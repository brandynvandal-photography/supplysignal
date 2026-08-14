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
import { fetchMedicalExaminer } from "./sources/medex.mjs";
import { gate1, gate2 } from "./recency.mjs";
import { classifyDeterministic, band, classifyWithLLM, applyLLMVerdict } from "./classify.mjs";
import { buildIndex, geotag } from "./geotag.mjs";
import { cluster } from "./dedupe.mjs";
import { grade, admit } from "./evidence.mjs";
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
  /* One statistical look per data state - see the fingerprint block in
     src/sources/medex.mjs. Internal, like .cache.json and .rotation.json. */
  const medexState = await readJson(p("data/.medex.json"), {});

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

  /* ---- Tier S2: county medical examiners. ----
   *
   * A handful of counties publish their toxicology as open data. Unlike every
   * other source here it does not depend on anyone writing an article, and it
   * names the actual compound. Four requests, three counties, and it is the
   * only thing in this pipeline that can say what is in a supply rather than
   * what somebody said about it. See src/sources/medex.mjs. */
  const me = sources.medicalExaminers;
  const meReached = new Set();
  if (me?.enabled) {
    for (const src of me.sources.filter((s) => s.enabled)) {
      try {
        const r = await fetchMedicalExaminer(src, settings, me, medexState);
        if (r.skipped) {
          console.error(`[medex:${src.id}] skipped (${r.skipped})`);
          stats.sourcesFailed.push(src.id);
          continue;
        }
        raw.push(...r.items);
        stats.fetched += r.items.length;
        /* The county WAS examined, whether or not anything crossed the
           threshold. That is the difference between "nothing published here"
           and "we have not looked", which data/index.json now reports. */
        meReached.add(src.fips);
        stats.medex = stats.medex || {};
        if (r.fingerprint) {
          medexState[src.id] = { fingerprint: r.fingerprint, items: r.items };
        }
        stats.medex[src.id] = {
          items: r.items.length, latest: r.latest, lagDays: r.lagDays,
          recent: r.recentTotal, baseline: r.baseTotal,
          /* true = the county's numbers had not moved, so no fresh test was
             run. Worth seeing in the log: it should be true most runs. */
          cached: Boolean(r.cached),
        };
      } catch (e) {
        console.error(`[medex:${src.id}] ${e.message}`);
        stats.sourcesFailed.push(src.id);
      }
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

  const scoped = [...watched, ...cold.filter((c) => !watchlist.counties.includes(c.fips))];

  /* Which counties this run actually reached.
   *
   * The loop below BREAKS on a rate limit, and the cursor used to advance by
   * `per` before the loop ran - so anything after the break was skipped and
   * the cursor moved past it anyway. Those counties would not come round again
   * for a full sweep. At 19 a run that was rare enough to go unnoticed; at the
   * volumes this now runs it would not be, and it got worse when the app
   * started reading data/index.json to tell a reader whether their county has
   * been scanned. A county marked scanned but never fetched makes that message
   * say "nothing published here" about a place nobody looked at, which is the
   * exact claim the index was added to stop making.
   *
   * So: record what was reached, advance the cursor by that, and let the index
   * below key off the same set. */
  const reached = new Set();

  for (const county of scoped) {
    try {
      const r = await fetchCountyNews(county, sources, settings);
      raw.push(...r.items);
      stats.fetched += r.items.length;
      reached.add(county.fips);
    } catch (e) {
      console.error(`[news:${county.fips}] ${e.message}`);
      if (e.rateLimited) { stats.sourcesFailed.push("google-news"); break; }
      /* A single feed failing is not the same as never having looked - the
         county WAS polled, the source just did not answer. */
      reached.add(county.fips);
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

    /* Structured sources score themselves.
     *
     * A medical-examiner tally is a counted fact out of a named public
     * dataset, not prose that has to be interpreted, and the two stages being
     * skipped here are both built for news articles. The keyword classifier
     * would be guessing at text this pipeline generated itself. gate2 drops
     * any item naming a year that is not this one or last, which is right for
     * an article recounting an old spike and wrong for a comparison against
     * last year's baseline.
     *
     * gate1 above still applies. Recency is a safety property, not a
     * formatting one, and a source that quietly stops updating has to fail
     * closed - medex.mjs has its own staleness guard for the same reason. */
    if (item.preScored) {
      const { preScored, ...rest } = item;
      publishable.push({
        ...rest, ...preScored,
        verdict: "score",
        evidenceClass: item.evidence || "lab",
        originator: item.sourceName,
        summary: item.summary || item.body || item.title,
      });
      continue;
    }

    const scored = classifyDeterministic(item, vocab);
    if (scored.verdict === "drop") { drop(scored.reason); continue; }

    const g2 = gate2(item, vocab, settings);
    if (!g2.pass) { drop(g2.reason.split(":")[0]); continue; }

    /* Evidence before confidence. The keyword score says whether this READS
       like an alert; the grade says whether anyone identifiable actually
       found it out. An unattributed item is dropped here no matter how well
       it scores - see src/evidence.mjs for why that trade is the right way
       round. */
    const ev = grade(item, scored, sources);
    if (ev.verdict === "drop") { drop(`evidence_${ev.reason}`); continue; }
    if (scored.confidence < ev.floor) { drop("below_class_floor"); continue; }

    const b = band(scored.confidence, settings);
    /* rawSeverity is the ungraded reading; severity is the graded one.
     *
     * Both are needed. Capping in place here made the cluster-level
     * corroboration rule unreachable: dedupe takes the max of member
     * severities, so an all-media cluster could never ARRIVE at admit() as
     * critical, and admit() only ever demotes - so "two independent
     * publishers may hold critical" could not fire from any real input. The
     * cap still applies to what publishes; admit() gets to see what the
     * evidence would have said without it. */
    const merged = {
      ...item, ...scored,
      rawSeverity: scored.severity,
      severity: ev.ceiling && scored.severity === "critical" && ev.ceiling !== "critical"
        ? ev.ceiling : scored.severity,
      evidenceCeiling: ev.ceiling,
      evidenceClass: ev.klass,
      originator: ev.originator,
      summary: (item.body || item.title).slice(0, 220),
    };

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
          if (applied.verdict === "drop") { drop("llm_rejected"); continue; }
          /* The model may raise severity, and it does not know about evidence
             classes. Without this, a "critical" verdict on a community or
             media item walked straight past the ceiling that the whole module
             exists to enforce - the one production path that could publish a
             community report as critical. */
          const RANKS = { critical: 0, elevated: 1, advisory: 2 };
          applied.rawSeverity = applied.severity;
          if (target.evidenceCeiling &&
              RANKS[applied.severity] < RANKS[target.evidenceCeiling]) {
            applied.severity = target.evidenceCeiling;
          }
          publishable.push(applied);
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

  /* The cluster-level evidence gate: severity capped at the strongest member's
     ceiling, and a critical claim needs a measurement, an institution, or two
     INDEPENDENT publishers - twenty outlets running one wire story is one
     source. dedupe strips members, so classes ride on the cluster. */
  for (const c of clusters) {
    const a = admit(c);
    if (a.severity !== c.severity) {
      stats.evidenceDemoted = (stats.evidenceDemoted || 0) + 1;
    }
    c.severity = a.severity;
    c.evidenceClass = a.evidenceClass;
    c.independent = a.independent;
  }
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
  /* Advance only past the cold counties this run actually got to. If a rate
     limit cut the run short, the rest come round on the next one. */
  const coldReached = cold.filter((c) => reached.has(c.fips)).length;
  rotation.cursor = (rotation.cursor + coldReached) % all.length;

  const indexEntries = await readJson(p("data/index.json"), { counties: {} }).then(
    (i) => i.counties || {}
  );

  /* `reached` stays the news loop's own bookkeeping, because the rotation
     cursor above is derived from it and a medical-examiner county must not
     advance it. This is the union that answers "did anybody look here", which
     is the question data/index.json exists to answer honestly. */
  const scannedFips = new Set([...reached, ...meReached]);
  const touched = new Set([...byCounty.keys(), ...scannedFips]);
  let totalNew = 0;

  for (const fips of touched) {
    const county = byFips.get(fips);
    if (!county) continue;
    const cs = byCounty.get(fips) || [];
    const coverage = {
      lastScan: new Date().toISOString(),
      windowDays: settings.recency.windowDays,
      sourcesChecked:
        sources.feeds.filter((f) => f.enabled).length + 1 + (meReached.has(fips) ? 1 : 0),
      sourcesFailed: [...new Set(stats.sourcesFailed)],
      scanned: scannedFips.has(fips),
    };
    if (!DRY_RUN) {
      const { newIds } = await writeCounty(ROOT, county, cs, coverage, settings.recency.windowDays);
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
    await writeJson(p("data/.medex.json"), medexState);
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
