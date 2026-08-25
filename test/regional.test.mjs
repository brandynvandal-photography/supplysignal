/**
 * The regional tier: findings whose geography is a coast and nothing finer.
 *
 * The pipeline had exactly two geographic tiers, county and statewide, and
 * dropped everything else as ungeotagged. NIST RaDAR reports by West or East
 * Coast, which is neither, so a third tier exists for sources that genuinely
 * have no finer geography.
 *
 * Every test here is about the same danger: a coast quietly becoming a place.
 *
 * Run: node test/regional.test.mjs
 */

import assert from "node:assert/strict";
import { writeAlertsBundle } from "../src/store.mjs";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

console.log("REGIONAL TIER\n");

const today = new Date().toISOString().slice(0, 10);

function regionalCluster(over = {}) {
  return {
    id: "r1", headline: "Something newly detected in West Coast samples",
    eventDate: today, summary: "NIST RaDAR: ...", severity: "advisory",
    substances: ["something"], sources: [], scope: "region", region: "west",
    fips: null, state: null, ...over,
  };
}

async function bundleWith({ regional = [], statewide = [] }) {
  const root = await mkdtemp(path.join(tmpdir(), "nl-regional-"));
  await mkdir(path.join(root, "data", "counties"), { recursive: true });
  await writeFile(path.join(root, "data", "counties", "42101.json"), JSON.stringify({
    name: "Philadelphia", state: "PA",
    clusters: [{ id: "c1", fips: "42101", headline: "A county alert", eventDate: today,
                 severity: "critical", substances: [], sources: [] }],
  }));
  await writeAlertsBundle(root, {
    windowDays: 365, coverage: { countiesScanned: 1 }, statewide, regional,
  });
  return JSON.parse(await readFile(path.join(root, "data", "alerts.json"), "utf8"));
}

/* THE WHOLE POINT. A regional finding must never carry a location it does not
   have - not a county, not a state, not even an empty-string one that a
   template could print. */
await t("a regional cluster reaches the bundle with no county and no state", async () => {
  const b = await bundleWith({ regional: [regionalCluster()] });
  const r = b.clusters.find((c) => c.scope === "region");
  assert.ok(r, "regional cluster missing from the bundle");
  assert.equal(r.fips, null);
  assert.equal(r.state, null);
  assert.equal(r.region, "west");
});

await t("its region survives the trip", async () => {
  const b = await bundleWith({ regional: [regionalCluster({ region: "east" })] });
  assert.equal(b.clusters.find((c) => c.scope === "region").region, "east");
});

/* The bundle carries all three tiers side by side; they must stay distinct. */
await t("county, statewide and regional coexist without merging", async () => {
  const b = await bundleWith({
    regional: [regionalCluster()],
    statewide: [{ id: "s1", headline: "Statewide advisory", eventDate: today,
                  severity: "elevated", substances: [], sources: [],
                  scope: "state", state: "PA", fips: null }],
  });
  const scopes = b.clusters.map((c) => c.scope || "county");
  assert.ok(scopes.includes("region"), "no regional");
  assert.ok(scopes.includes("state"), "no statewide");
  assert.ok(scopes.includes("county") || b.clusters.some((c) => c.fips), "no county");
  /* Nothing county-scoped picked up a region, and vice versa. */
  for (const c of b.clusters) {
    if (c.scope === "region") assert.ok(!c.fips && !c.state, "a regional cluster gained a place");
    if (c.fips) assert.ok(c.scope !== "region", "a county cluster became regional");
  }
});

await t("a stale regional finding falls out of the window like anything else", async () => {
  const old = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const b = await bundleWith({ regional: [regionalCluster({ eventDate: old })] });
  assert.ok(!b.clusters.some((c) => c.scope === "region"), "an out-of-window finding shipped");
});

/* ------------------------------------------- the client-side split */

/* alertsAll names a county for every row it returns. A regional finding has
   none, so it must not be in that list - this is the bug the tier exists to
   avoid, and the filter is one character away from allowing it. */
await t("the county-facing list excludes regional and statewide alike", async () => {
  const src = await readFile(new URL("../site/js/data.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function alertsAll"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /scope !== "state"/, "statewide no longer excluded");
  assert.match(body, /scope !== "region"/, "REGIONAL NOT EXCLUDED - coast-level items would list as county alerts");
});

await t("there is a regional accessor, and it filters on scope", async () => {
  const src = await readFile(new URL("../site/js/data.js", import.meta.url), "utf8");
  assert.match(src, /export async function alertsRegional/);
  const fn = src.slice(src.indexOf("export async function alertsRegional"));
  assert.match(fn.slice(0, fn.indexOf("\n}")), /scope === "region"/);
});

/* ------------------------------------------------- the ingest gate */

/* "We could not tell where this is" and "this is a coast-level finding" are
   different facts. The first is still dropped; only a source that DECLARES a
   regional scope gets the tier. */
await t("ingest routes declared regions, and still drops the ungeotaggable", async () => {
  const src = await readFile(new URL("../src/ingest.mjs", import.meta.url), "utf8");
  assert.match(src, /item\.scope === "region"/, "no regional branch in ingest");
  assert.match(src, /drop\("ungeotagged"\)/, "the ungeotagged drop was removed");
  const branch = src.slice(src.indexOf('if (item.scope === "region")'));
  const block = branch.slice(0, branch.indexOf("\n    }"));
  assert.ok(!/geotag\(/.test(block), "a declared region is being geocoded anyway");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
