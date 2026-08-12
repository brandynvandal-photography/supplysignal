/**
 * Map hit-testing tests, run against the real boundary data.
 *
 * These exist because hovering Alaska on the zoomed-out map reported counties
 * from entirely different states. The cause was a color-indexed pick buffer:
 * canvas fills are antialiased, so every border pixel was a blend of two
 * neighboring index colors, and that blend decodes to a third, unrelated
 * county. Alaska at national zoom is nearly all border pixels, so it was the
 * worst case - but every state was affected along its edges.
 *
 * The fix tests geometry instead of pixels. This checks it across ALL states.
 *
 *   node test/hittest.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMesh, hitTest, pointInRing } from "../site/js/mesh.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));

let pass = 0;
const fails = [];
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fails.push(name); }
};

console.log("\nMAP HIT TESTING");

const shapes = read("data/county-shapes.json");
const gaz = read("data/counties.json");
const mesh = buildMesh(shapes, gaz.counties);
const byFips = new Map(gaz.counties.map((c) => [c.fips, c]));

t("mesh covers the gazetteer", () => {
  assert.ok(mesh.counties.length > 3100,
    `only ${mesh.counties.length} counties in mesh`);
});

t("ray casting agrees with a known square", () => {
  const sq = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  assert.equal(pointInRing(0.5, 0.5, sq), true);
  assert.equal(pointInRing(1.5, 0.5, sq), false);
  assert.equal(pointInRing(-0.5, 0.5, sq), false);
});

/* The core check. For every county whose own centroid genuinely falls inside
   its own boundary, hit testing that point must return that same county.
   Concave counties whose centroid falls outside themselves are skipped -
   there is no correct answer to assert for those. */
function centroidSelfHits() {
  let checked = 0, wrong = 0, wrongCrossState = 0;
  const examples = [];

  for (const co of mesh.counties) {
    const inside = co.rings.some((r) => pointInRing(co.cx, co.cy, r));
    if (!inside) continue;              // centroid outside its own shape
    checked++;

    const hit = hitTest(mesh, co.cx, co.cy);
    if (hit?.fips === co.fips) continue;

    wrong++;
    const a = byFips.get(co.fips), b = hit && byFips.get(hit.fips);
    if (!b || a.state !== b.state) {
      wrongCrossState++;
      if (examples.length < 5) {
        examples.push(`${a.name}, ${a.state} -> ${b ? `${b.name}, ${b.state}` : "nothing"}`);
      }
    }
  }
  return { checked, wrong, wrongCrossState, examples };
}

const r = centroidSelfHits();

t(`every county resolves to itself (${r.checked} checked)`, () => {
  assert.equal(r.wrong, 0,
    `${r.wrong} counties resolved to the wrong county` +
    (r.examples.length ? `\n       e.g. ${r.examples.join("\n            ")}` : ""));
});

t("no county ever resolves across a state line", () => {
  assert.equal(r.wrongCrossState, 0,
    `${r.wrongCrossState} cross-state mismatches — the symptom originally reported`);
});

/* Alaska specifically: the case that surfaced the bug. */
t("Alaska resolves to Alaska", () => {
  const ak = mesh.counties.filter((c) => c.fips.startsWith("02"));
  assert.ok(ak.length > 20, `only ${ak.length} Alaska boroughs in mesh`);

  let checked = 0, bad = [];
  for (const co of ak) {
    if (!co.rings.some((rg) => pointInRing(co.cx, co.cy, rg))) continue;
    checked++;
    const hit = hitTest(mesh, co.cx, co.cy);
    if (!hit || !hit.fips.startsWith("02")) {
      const a = byFips.get(co.fips);
      const b = hit && byFips.get(hit.fips);
      bad.push(`${a.name} -> ${b ? `${b.name}, ${b.state}` : "nothing"}`);
    }
  }
  assert.ok(checked > 15, `only ${checked} Alaska centroids testable`);
  assert.equal(bad.length, 0, `Alaska leaked to other states: ${bad.join("; ")}`);
});

/* The territories sit in their own insets and must not bleed into CONUS. */
t("territory insets stay separate from the mainland", () => {
  const bad = [];
  for (const prefix of ["72", "78", "66", "69", "60", "15"]) {
    const set = mesh.counties.filter((c) => c.fips.startsWith(prefix));
    for (const co of set) {
      if (!co.rings.some((rg) => pointInRing(co.cx, co.cy, rg))) continue;
      const hit = hitTest(mesh, co.cx, co.cy);
      if (hit && !hit.fips.startsWith(prefix)) {
        const a = byFips.get(co.fips), b = byFips.get(hit.fips);
        bad.push(`${a.name}, ${a.state} -> ${b.name}, ${b.state}`);
      }
    }
  }
  assert.equal(bad.length, 0, bad.slice(0, 5).join("; "));
});

t("a point far outside the map hits nothing", () => {
  assert.equal(hitTest(mesh, -5, -5), null);
  assert.equal(hitTest(mesh, 99, 99), null);
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
