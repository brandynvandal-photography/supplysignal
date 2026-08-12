/**
 * Offline pipeline test. No network. Verifies the parts that actually decide
 * what gets published: recency gates, classifier bands, geotag, dedupe.
 * Run: node test/pipeline.test.mjs
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { gate1, gate2, clampWindow } from "../src/recency.mjs";
import { classifyDeterministic, band } from "../src/classify.mjs";
import { buildIndex, geotag } from "../src/geotag.mjs";
import { cluster, canonicalUrl, jaccard } from "../src/dedupe.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const j = async (f) => JSON.parse(await readFile(path.join(ROOT, f), "utf8"));

const settings = await j("config/settings.json");
const vocab = await j("config/vocab.json");
const counties = await j("data/counties.json");
buildIndex(counties);

const iso = (d) => new Date(Date.now() - d * 86400000).toUTCString();
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

console.log("\nGATE 1 — publish date resolution");
t("recent dated item passes", () => {
  const r = gate1({ pubDate: iso(5) }, settings);
  assert.equal(r.pass, true);
});
t("undated item is dropped, not defaulted to now", () => {
  const r = gate1({ pubDate: null }, settings);
  assert.equal(r.pass, false);
  assert.equal(r.reason, "undated");
});
t("item older than the window is dropped", () => {
  const r = gate1({ pubDate: iso(400) }, settings);
  assert.equal(r.pass, false);
  assert.equal(r.reason, "outside_window");
});
t("future-dated garbage is rejected", () => {
  const r = gate1({ pubDate: new Date(Date.now() + 30 * 86400000).toUTCString() }, settings);
  assert.equal(r.pass, false);
});

console.log("\nGATE 2 — retrospective detection (the 2023-article problem)");
t("recent report about a current spike passes", () => {
  const r = gate2({ title: "Health officials warn of overdose spike", body: "Six overdoses this week." }, vocab, settings);
  assert.equal(r.pass, true);
});
t("2026 article about a 2023 spike is dropped", () => {
  const r = gate2({ title: "Remembering the fentanyl deaths", body: "The cluster in 2023 killed nine people." }, vocab, settings);
  assert.equal(r.pass, false);
  assert.match(r.reason, /foreign_year/);
});
t("retrospective phrasing is caught", () => {
  const r = gate2({ title: "Fentanyl crisis revisited", body: "Years ago the county saw a spike. At the time, officials said little. Looking back, families still grieve." }, vocab, settings);
  assert.equal(r.pass, false);
});

console.log("\nGATE 3 — window clamping");
t("oversized window request is clamped to the ceiling", () => {
  assert.equal(clampWindow(5000, settings), 365);
});
t("garbage window falls back to default", () => {
  assert.equal(clampWindow("abc", settings), 90);
});

console.log("\nCLASSIFIER");

// Regression: the first live run published a West Nile Virus advisory as an
// elevated methamphetamine alert, because "meth" is a substring of "methods".
// Vocabulary matching must be on word boundaries.
t("substance terms do not match inside longer words", () => {
  const c = classifyDeterministic({
    title: "First Case of West Nile Virus Reported in North Dakota",
    body:
      "The Department of Health and Human Services has confirmed the first human " +
      "case of West Nile virus this year. Prevention methods include repellent.",
    trust: 1,
  }, vocab);
  assert.equal(c.verdict, "drop");
  assert.equal(c.reason, "prefilter");
});

t("real substance mentions still match", () => {
  const c = classifyDeterministic({
    title: "Health alert: meth supply contaminated in Multnomah County",
    body: "Officials confirmed fentanyl detected in samples sold as meth.",
    trust: 1,
  }, vocab);
  assert.equal(c.verdict, "score");
  assert.ok(c.substances.includes("meth"), "should still detect the word meth");
});

t("official spike advisory scores as publish/critical", () => {
  const c = classifyDeterministic({
    title: "Health Alert: overdose spike in Hamilton County",
    body: "Officials report a cluster of fentanyl overdoses with three deaths.",
    trust: 1,
  }, vocab);
  assert.equal(c.severity, "critical");
  assert.equal(band(c.confidence, settings), "publish");
});
t("contamination finding scores elevated", () => {
  const c = classifyDeterministic({
    title: "Xylazine detected in local drug supply",
    body: "Drug checking confirmed xylazine in samples of heroin.",
    trust: 1,
  }, vocab);
  assert.equal(c.severity, "elevated");
});
t("court coverage is rejected by the negative list", () => {
  const c = classifyDeterministic({
    title: "Man sentenced in fentanyl overdose death",
    body: "A jury convicted the defendant after a trial.",
    trust: 2,
  }, vocab);
  assert.notEqual(band(c.confidence, settings), "publish");
});
t("unrelated item fails the prefilter entirely", () => {
  const c = classifyDeterministic({ title: "County fair returns Saturday", body: "Rides and food.", trust: 2 }, vocab);
  assert.equal(c.verdict, "drop");
  assert.equal(c.reason, "prefilter");
});
t("ambiguous item lands in the escalate band", () => {
  const c = classifyDeterministic({
    title: "Naloxone distribution expands amid opioid concerns",
    body: "Officials cite an overdose warning.",
    trust: 2,
  }, vocab);
  assert.equal(band(c.confidence, settings), "escalate");
});

console.log("\nGEOTAG");
t("county + state resolves to the right FIPS", () => {
  const g = geotag({ title: "Overdose spike in Hamilton County, Tennessee", body: "" });
  assert.equal(g.fips, "47065");
  assert.equal(g.state, "TN");
});
t("ambiguous county name without state is not guessed", () => {
  const g = geotag({ title: "Overdoses reported in Washington County", body: "" });
  assert.ok(!g || !g.fips, "should refuse to guess among many Washington Counties");
});
t("query scope hint wins", () => {
  const g = geotag({ title: "Local alert", body: "" }, "41051", "OR");
  assert.equal(g.fips, "41051");
  assert.equal(g.method, "query_scope");
});
t("Louisiana parish resolves", () => {
  const g = geotag({ title: "Fentanyl deaths in Orleans Parish, Louisiana", body: "" });
  assert.equal(g.state, "LA");
  assert.equal(g.fips, "22071");
});

console.log("\nDEDUPE");
t("tracking params are stripped from canonical URL", () => {
  assert.equal(
    canonicalUrl("https://www.example.com/story/?utm_source=x&id=7#top"),
    "https://example.com/story?id=7"
  );
});
t("near-identical headlines are similar", () => {
  assert.ok(jaccard("Overdose spike hits Hamilton County", "Overdose spike hits Hamilton County, officials say") > 0.55);
});
t("one incident across five outlets collapses to one cluster", () => {
  const base = {
    fips: "47065", state: "TN", severity: "critical", substances: ["fentanyl"],
    publishedAt: new Date().toISOString(), eventDate: new Date().toISOString().slice(0, 10),
    confidence: 0.9, trust: 2,
  };
  const items = [
    { ...base, title: "Overdose spike hits Hamilton County", url: "https://a.com/1", sourceName: "A" },
    { ...base, title: "Overdose spike hits Hamilton County, officials say", url: "https://b.com/2", sourceName: "B" },
    { ...base, title: "Overdose spike hits Hamilton County — officials say", url: "https://c.com/3", sourceName: "C" },
    { ...base, title: "Overdose spike hits Hamilton County", url: "https://a.com/1?utm_source=fb", sourceName: "A" },
    { ...base, title: "New library opens downtown", url: "https://d.com/4", sourceName: "D" },
  ];
  const out = cluster(items, settings);
  assert.equal(out.length, 2, `expected 2 clusters, got ${out.length}`);
  assert.equal(out[0].sourceCount, 3);
});
t("critical sorts above advisory", () => {
  const now = new Date().toISOString();
  const out = cluster([
    { fips: "1", state: "AL", title: "General drug advisory issued", url: "https://x/1", severity: "advisory", substances: [], publishedAt: now, eventDate: now.slice(0,10), confidence: .8, trust: 1, sourceName: "X" },
    { fips: "1", state: "AL", title: "Deaths reported from fentanyl batch", url: "https://y/2", severity: "critical", substances: [], publishedAt: now, eventDate: now.slice(0,10), confidence: .9, trust: 1, sourceName: "Y" },
  ], settings);
  assert.equal(out[0].severity, "critical");
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
