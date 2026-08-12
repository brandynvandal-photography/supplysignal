#!/usr/bin/env node
/**
 * Nightlight ingest. Runs hourly under GitHub Actions.
 *
 *   fetch -> gate1 -> prefilter/score -> gate2 -> LLM escalate (ambiguous only)
 *         -> geotag -> dedupe/cluster -> write JSON + RSS -> commit
 *
 * Cost profile: everything free except the escalation calls, which are
 * capped per run in config/settings.json.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFeed, fetchCountyNews, fetchGdelt } from "./sources/index.mjs";
import { gate1, gate2 } from "./recency.mjs";
import { classifyDeterministic, band, classifyWithLLM, applyLLMVerdict } from "./classify.mjs";
import { buildIndex, geotag } from "./geotag.mjs";
import { cluster } from "./dedupe.mjs";
import {
  readJson, writeJson, writeCounty, writeIndex, writeCountyFeed, appendReview, writeRunLog,
  writeAlertsBundle,
} from "./store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...a) => path.join(ROOT, ...a);
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const DRY_RUN = process.env.DRY_RUN === "1";

const stats = {
  started: new Date().toISOString(),
  fetched: 0, notModified: 0,
  dropped: {}, published: 0, escalated: 0, reviewed: 0,
  llmCalls: 0, llmTokens: { input: 0, output: 0 },
  sourcesFailed: [],
};
const drop = (reason) => { stats.dropped[reason] = (stats.dropped[reason] || 0) + 1; };

async function main() {
  const settings = await readJson(p("config/settings.json"));
  const sources = await readJson(p("config/sources.json"));
  const vocab = await readJson(p("config/vocab.json"));
  const countiesJson = await readJson(p("data/counties.json"));
  const watchlist = await readJson(p("config/watchlist.json"), { counties: [] });
  const cache = await readJson(p("data/.cache.json"), {});
  const rotation = await readJson(p("data/.rotation.json"), { cursor: 0 });

  settings._states = countiesJson.states;
  buildIndex(countiesJson);

  const byFips = new Map(countiesJson.counties.map((c) => [c.fips, c]));
  const raw = [];

  /* ---- Tier S: feeds. ~80 requests, covers all 3,143 counties. ---- */
  for (const feed of sources.feeds.filter((f) => f.enabled)) {
    try {
      const r = await fetchFeed(feed, settings, cache[feed.id] || {});
      if (r.notModified) { stats.notModified++; continue; }
      cache[feed.id] = r.cache;
      raw.push(...r.items);
      stats.fetched += r.items.length;
    } catch (e) {
      console.error(`[feed:${feed.id}] ${e.message}`);
      stats.sourcesFailed.push(feed.id);
    }
  }

  /* ---- Tier A: watched counties, every run. ---- */
  const watched = watchlist.counties
    .map((f) => byFips.get(f))
    .filter(Boolean)
    .slice(0, settings.polling.maxWatchedPerRun);

  /* ---- Tier C: cold rotation. Full 3,143 sweep completes weekly. ---- */
  const per = settings.polling.coldRotationPerRun;
  const all = countiesJson.counties;
  const cold = [];
  for (let i = 0; i < per; i++) {
    cold.push(all[(rotation.cursor + i) % all.length]);
  }
  rotation.cursor = (rotation.cursor + per) % all.length;

  const scoped = [...watched, ...cold.filter((c) => !watchlist.counties.includes(c.fips))];

  for (const county of scoped) {
    try {
      const r = await fetchCountyNews(county, sources, settings);
      raw.push(...r.items);
      stats.fetched += r.items.length;
    } catch (e) {
      console.error(`[news:${county.fips}] ${e.message}`);
      if (e.rateLimited) { stats.sourcesFailed.push("google-news"); break; }
    }
    if (watchlist.counties.includes(county.fips)) {
      try {
        const g = await fetchGdelt(county, sources, settings);
        raw.push(...g.items);
        stats.fetched += g.items.length;
      } catch (e) {
        console.error(`[gdelt:${county.fips}] ${e.message}`);
      }
    }
  }

  /* ---- Gates + deterministic scoring ---- */
  const publishable = [];
  const escalate = [];
  const review = [];

  for (const item of raw) {
    const g1 = gate1(item, settings);
    if (!g1.pass) { drop(g1.reason); continue; }
    item.publishedAt = g1.published.toISOString();

    const scored = classifyDeterministic(item, vocab);
    if (scored.verdict === "drop") { drop(scored.reason); continue; }

    const g2 = gate2(item, vocab, settings);
    if (!g2.pass) { drop(g2.reason.split(":")[0]); continue; }

    const b = band(scored.confidence, settings);
    const merged = { ...item, ...scored, summary: (item.body || item.title).slice(0, 220) };

    if (b === "publish") publishable.push(merged);
    else if (b === "escalate") escalate.push(merged);
    else if (b === "review") review.push(merged);
    else drop("low_confidence");
  }

  /* ---- LLM escalation: ambiguous band only, no web search ---- */
  const budget = escalate.slice(0, settings.llm.maxItemsPerRun);
  stats.escalated = budget.length;
  if (budget.length && settings.llm.enabled && API_KEY) {
    for (let i = 0; i < budget.length; i += settings.llm.itemsPerCall) {
      const chunk = budget.slice(i, i + settings.llm.itemsPerCall);
      try {
        const out = await classifyWithLLM(chunk, settings, API_KEY);
        stats.llmCalls++;
        stats.llmTokens.input += out.usage.input_tokens || 0;
        stats.llmTokens.output += out.usage.output_tokens || 0;
        for (const v of out.results) {
          const target = chunk[v.i];
          if (!target) continue;
          const applied = applyLLMVerdict(target, v);
          if (applied.verdict === "drop") drop("llm_rejected");
          else publishable.push(applied);
        }
      } catch (e) {
        console.error(`[llm] ${e.message}`);
        review.push(...chunk); // fail safe: never publish an unverified ambiguous item
      }
    }
  } else {
    review.push(...budget); // no key configured - park them rather than guess
  }

  /* ---- Geotag ---- */
  const located = [];
  for (const item of publishable) {
    const g = geotag(item, item.hintFips, item.hintState);
    if (!g || !g.fips) { drop(g ? "state_only" : "ungeotagged"); continue; }
    located.push({
      ...item,
      fips: g.fips,
      state: g.state,
      eventDate: item.eventDate || item.publishedAt.slice(0, 10),
    });
  }

  /* ---- Cluster + write ---- */
  const clusters = cluster(located, settings);
  const byCounty = new Map();
  for (const c of clusters) {
    if (!byCounty.has(c.fips)) byCounty.set(c.fips, []);
    byCounty.get(c.fips).push(c);
  }

  /* Absolute base for the per-county RSS links. The fallback is the real
     production host rather than a placeholder, because these URLs get written
     into feeds that leave the building - a wrong default ships broken links to
     every subscriber rather than failing loudly here.

     No trailing path: root index.html redirects into site/ and carries the
     #/fips fragment across, so https://nightlight.help/#/47065 lands correctly
     and stays readable in a feed reader. */
  const siteUrl = process.env.SITE_URL || "https://nightlight.help";
  const indexEntries = await readJson(p("data/index.json"), { counties: {} }).then(
    (i) => i.counties || {}
  );

  const touched = new Set([...byCounty.keys(), ...scoped.map((c) => c.fips)]);
  let totalNew = 0;

  for (const fips of touched) {
    const county = byFips.get(fips);
    if (!county) continue;
    const cs = byCounty.get(fips) || [];
    const coverage = {
      lastScan: new Date().toISOString(),
      windowDays: settings.recency.windowDays,
      sourcesChecked: sources.feeds.filter((f) => f.enabled).length + 1,
      sourcesFailed: [...new Set(stats.sourcesFailed)],
      scanned: scoped.some((c) => c.fips === fips),
    };
    if (!DRY_RUN) {
      const { newIds } = await writeCounty(ROOT, county, cs, coverage);
      totalNew += newIds.length;
      if (cs.length) await writeCountyFeed(ROOT, county, cs, siteUrl);
    }
    indexEntries[fips] = {
      n: county.name, s: county.state,
      c: cs.length,
      sev: cs[0]?.severity || null,
      t: coverage.lastScan,
    };
  }

  stats.published = clusters.length;
  stats.reviewed = review.length;
  stats.finished = new Date().toISOString();
  stats.newClusters = totalNew;

  if (!DRY_RUN) {
    await writeIndex(ROOT, indexEntries);

    // The bundle the site reads. Written after the per-county files so it
    // reflects this run, including counties untouched by it.
    const bundle = await writeAlertsBundle(ROOT, {
      windowDays: settings.recency.windowDays,
      coverage: {
        lastScan: new Date().toISOString(),
        sourcesChecked: sources.feeds.filter((f) => f.enabled).length + 1,
        sourcesFailed: [...new Set(stats.sourcesFailed)],
        countiesScanned: scoped.length,
      },
    });
    stats.bundle = bundle;

    await writeJson(p("data/.cache.json"), cache);
    await writeJson(p("data/.rotation.json"), rotation);
    if (review.length) await appendReview(ROOT, review.map((r) => ({
      title: r.title, url: r.url, source: r.sourceName,
      published: r.publishedAt, confidence: r.confidence, audit: r.audit,
    })));
    await writeRunLog(ROOT, stats);
  }

  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
