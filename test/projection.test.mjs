/**
 * Map projection tests.
 *
 * These exist because the map shipped upside down and nothing caught it. A
 * vertically flipped United States still looks like a plausible blob, so
 * neither review nor screenshots found it - a reader did.
 *
 *   node test/projection.test.mjs
 */

import assert from "node:assert/strict";
import { project, regionFor } from "../site/js/projection.js";

let pass = 0;
const fails = [];
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fails.push(name); }
};

console.log("\nPROJECTION");

/* Screen convention: y increases DOWNWARD. So a place further north must
   project to a SMALLER y than a place further south. */

t("north is up — Maine sits above Florida", () => {
  const maine = project("23003", -68.6, 46.7);      // Aroostook County, ME
  const florida = project("12086", -80.5, 25.6);    // Miami-Dade County, FL
  assert.ok(
    maine[1] < florida[1],
    `Maine y=${maine[1].toFixed(3)} should be less than Florida y=${florida[1].toFixed(3)}`
  );
});

t("north is up — Seattle sits above San Diego", () => {
  const seattle = project("53033", -122.3, 47.6);
  const sandiego = project("06073", -117.2, 32.7);
  assert.ok(seattle[1] < sandiego[1], "Seattle should project above San Diego");
});

t("west is left — California sits left of Maine", () => {
  const ca = project("06073", -117.2, 32.7);
  const me = project("23003", -68.6, 46.7);
  assert.ok(ca[0] < me[0], "California should project left of Maine");
});

t("latitude ordering holds across the whole span", () => {
  const ys = [25, 30, 35, 40, 45].map((lat) => project("12086", -95, lat)[1]);
  for (let i = 1; i < ys.length; i++) {
    assert.ok(ys[i] < ys[i - 1], `y should decrease as latitude rises (${ys.join(", ")})`);
  }
});

/* Insets */

t("Alaska and Hawaii are parked below the mainland", () => {
  const kansas = project("20173", -97.3, 37.7);     // middle of CONUS
  const ak = project("02020", -149.9, 61.2);        // Anchorage
  const hi = project("15003", -157.8, 21.3);        // Honolulu
  assert.ok(ak[1] > kansas[1], "Alaska inset should sit below the mainland");
  assert.ok(hi[1] > kansas[1], "Hawaii inset should sit below the mainland");
});

t("Puerto Rico is placed to the right of Hawaii", () => {
  const hi = project("15003", -157.8, 21.3);
  const pr = project("72127", -66.1, 18.4);         // San Juan
  assert.ok(pr[0] > hi[0], "Puerto Rico should sit right of Hawaii");
});

t("region routing covers the territories", () => {
  assert.equal(regionFor("47065"), "conus");
  assert.equal(regionFor("02020"), "ak");
  assert.equal(regionFor("15003"), "hi");
  assert.equal(regionFor("72127"), "pr");
  assert.equal(regionFor("78010"), "pr");
  assert.equal(regionFor("66010"), "gu");
  assert.equal(regionFor("69110"), "gu");
  assert.equal(regionFor("60010"), "as");
});

t("every projected coordinate is finite", () => {
  const samples = [
    ["47065", -85.3, 35.0], ["02020", -149.9, 61.2], ["15003", -157.8, 21.3],
    ["72127", -66.1, 18.4], ["66010", 144.8, 13.4], ["60010", -170.7, -14.3],
  ];
  for (const [fips, lng, lat] of samples) {
    const [x, y] = project(fips, lng, lat);
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `${fips} projected to ${x},${y}`);
  }
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
