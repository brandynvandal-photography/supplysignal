/**
 * The reagent scanner's color engine.
 *
 * Everything here is pure arithmetic on numbers, which is the point: the part
 * of a camera feature that can be wrong in a way that hurts somebody is the
 * part that turns pixels into a color name, and that part must be testable
 * without a camera.
 *
 * Run: node test/scanner.test.mjs
 */

import assert from "node:assert/strict";
import {
  PALETTE, hexToRgb, rgbToLab, labDistance, balance, classify,
  samplePatch, readSeconds, capturePlan, patchSpread, SPREAD_LIMIT,
} from "../site/js/scanner.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

console.log("SCANNER");

/* ---------------------------------------------------------- color space */

t("hex parses, with and without the hash", () => {
  assert.deepEqual(hexToRgb("#ffffff"), [255, 255, 255]);
  assert.deepEqual(hexToRgb("000000"), [0, 0, 0]);
  assert.equal(hexToRgb("nope"), null);
});

t("Lab puts white at L=100 and black at L=0", () => {
  const w = rgbToLab([255, 255, 255]);
  const b = rgbToLab([0, 0, 0]);
  assert.ok(Math.abs(w[0] - 100) < 0.5, `white L was ${w[0]}`);
  assert.ok(Math.abs(b[0]) < 0.5, `black L was ${b[0]}`);
  /* Neutral means a and b sit at zero. */
  assert.ok(Math.hypot(w[1], w[2]) < 0.5);
});

t("distance is zero to itself and larger between opposites", () => {
  const yellow = rgbToLab(hexToRgb(PALETTE.yellow));
  const blue = rgbToLab(hexToRgb(PALETTE.blue));
  assert.equal(labDistance(yellow, yellow), 0);
  assert.ok(labDistance(yellow, blue) > 50);
});

/* ------------------------------------------------------------- classify */

t("each palette color classifies as itself, confidently", () => {
  for (const [name, hex] of Object.entries(PALETTE)) {
    const got = classify(hexToRgb(hex));
    assert.equal(got[0].name, name, `${name} classified as ${got[0].name}`);
    assert.equal(got[0].confident, true, `${name} was not confident about itself`);
  }
});

/* The distinction the palette exists to preserve. The CSS comment says peach
   sits deliberately between orange and pink "because that is what the reader
   is being asked to tell apart" — so a midpoint must NOT be reported
   confidently as either one. */
t("a color between two neighbors is not reported confidently", () => {
  const orange = hexToRgb(PALETTE.orange);
  const peach = hexToRgb(PALETTE.peach);
  const mid = orange.map((c, i) => Math.round((c + peach[i]) / 2));
  const got = classify(mid);
  assert.equal(got[0].confident, false, "a midpoint claimed confidence");
  const top2 = [got[0].name, got[1].name].sort();
  assert.deepEqual(top2, ["orange", "peach"]);
});

t("allowed narrows the palette to a step's own branches", () => {
  /* Olive is the nearest name to this, but a step that cannot produce olive
     must never be told olive. */
  const olive = hexToRgb(PALETTE.olive);
  assert.equal(classify(olive)[0].name, "olive");
  const got = classify(olive, ["yellow", "green", "black"]);
  assert.ok(["yellow", "green"].includes(got[0].name));
  assert.ok(got.every((c) => c.name !== "olive"), "olive survived the filter");
});

t("an empty or unknown allowed list does not invent an answer", () => {
  assert.deepEqual(classify(hexToRgb(PALETTE.red), ["notacolor"]), []);
  assert.deepEqual(classify(null), []);
});

t("a color outside the palette entirely is flagged off-palette", () => {
  /* Mid cyan. Not clipped, and the palette has no teal - the bench, or a
     fingertip, rather than a drop. */
  const got = classify([0, 180, 180]);
  assert.equal(got[0].offPalette, true, `nearest was ${got[0].name} at ${got[0].distance.toFixed(1)}`);
  assert.equal(got[0].confident, false);
});

/* The dangerous case: a glossy plate under a torch blows out, and the hue that
   survives is an artefact of exposure. White stays a legitimate READING; it is
   the clipped MEASUREMENT that is refused. */
t("a clipped measurement is never confident, even near a real palette color", () => {
  const got = classify([252, 250, 251]);
  assert.equal(got[0].clipped, true);
  assert.equal(got[0].confident, false, "a blown-out sample claimed confidence");
});

t("an unclipped genuine white still reads as white, confidently", () => {
  const got = classify(hexToRgb(PALETTE.white));
  assert.equal(got[0].name, "white");
  assert.equal(got[0].clipped, false);
  assert.equal(got[0].confident, true);
});

/* -------------------------------------------------------- white balance */

t("a neutral reference leaves a sample essentially unchanged", () => {
  const out = balance([180, 90, 60], [200, 200, 200]);
  assert.ok(out.every((c, i) => Math.abs(c - [180, 90, 60][i]) <= 2), `got ${out}`);
});

t("a warm reference cools the sample back toward neutral", () => {
  /* Tungsten: the plate photographs orange. A gray drop under that light
     should come back gray, not orange. */
  const out = balance([200, 170, 140], [220, 190, 155]);
  const spread = Math.max(...out) - Math.min(...out);
  assert.ok(spread < 30, `still strongly tinted: ${out}`);
});

t("a reference too dark to divide by is refused", () => {
  assert.equal(balance([120, 120, 120], [8, 8, 8]), null);
});

t("a plainly colored surface is refused as a reference", () => {
  assert.equal(balance([120, 120, 120], [200, 40, 40]), null);
});

t("missing inputs are refused rather than guessed", () => {
  assert.equal(balance(null, [200, 200, 200]), null);
  assert.equal(balance([1, 2, 3], null), null);
});

/* ------------------------------------------------------------ sampling */

t("a specular highlight does not drag the reading toward white", () => {
  const drop = Array.from({ length: 20 }, () => [120, 40, 60]);
  const glare = Array.from({ length: 4 }, () => [255, 255, 255]);
  const got = samplePatch([...drop, ...glare]);
  assert.deepEqual(got, [120, 40, 60]);
});

t("a shadowed rim does not drag it dark either", () => {
  const drop = Array.from({ length: 20 }, () => [200, 180, 60]);
  const shadow = Array.from({ length: 4 }, () => [5, 5, 5]);
  assert.deepEqual(samplePatch([...drop, ...shadow]), [200, 180, 60]);
});

t("a tiny patch still averages rather than returning nothing", () => {
  assert.deepEqual(samplePatch([[10, 20, 30], [30, 40, 50]]), [20, 30, 40]);
  assert.equal(samplePatch([]), null);
  assert.equal(samplePatch(null), null);
});

/* ---------------------------------------------- one well, or two? */

/* The plate is small and a full run fills four to six wells. A tap that lands
   between two of them must not average them into a color that is in neither. */
t("a patch inside one well reads as uniform", () => {
  const px = Array.from({ length: 40 }, (_, i) =>
    [140 + (i % 3), 60 + (i % 2), 90 - (i % 3)]);   // sensor noise only
  assert.ok(patchSpread(px) < SPREAD_LIMIT, `spread was ${patchSpread(px).toFixed(1)}`);
});

t("a patch straddling two wells is not uniform", () => {
  const wellA = Array.from({ length: 20 }, () => [200, 40, 40]);    // red
  const wellB = Array.from({ length: 20 }, () => [40, 60, 200]);    // blue
  const spread = patchSpread([...wellA, ...wellB]);
  assert.ok(spread > SPREAD_LIMIT, `two wells averaged to a spread of only ${spread.toFixed(1)}`);
});

t("a patch on a well's rim is not uniform either", () => {
  const drop = Array.from({ length: 24 }, () => [120, 150, 60]);
  const plate = Array.from({ length: 16 }, () => [238, 232, 220]);  // white ceramic
  assert.ok(patchSpread([...drop, ...plate]) > SPREAD_LIMIT);
});

t("spread needs enough pixels to mean anything", () => {
  assert.equal(patchSpread([[1, 2, 3]]), 0);
  assert.equal(patchSpread([]), 0);
  assert.equal(patchSpread(null), 0);
});

/* --------------------------------------------------------- read windows */

t("read windows parse as the charts write them", () => {
  assert.equal(readSeconds("0:45"), 45);
  assert.equal(readSeconds("5:00"), 300);
  assert.equal(readSeconds("30:00"), 1800);
  assert.equal(readSeconds(""), null);
  assert.equal(readSeconds("45"), null);
});

t("an ordinary step captures once, inside its window", () => {
  const plan = capturePlan({ read: "0:45" });
  assert.equal(plan.series, false);
  assert.equal(plan.at.length, 1);
  assert.ok(plan.at[0] < 45, "capture was not inside the window");
});

/* The reason this module exists. A step the chart flags as a progression
   cannot be answered by one frame. */
t("a sequenceOrAny step captures a series across the window", () => {
  const plan = capturePlan({ read: "0:45", sequenceOrAny: true });
  assert.equal(plan.series, true);
  assert.ok(plan.at.length >= 3, `only ${plan.at.length} captures`);
  /* strictly increasing, all inside the window */
  for (let i = 1; i < plan.at.length; i++) assert.ok(plan.at[i] > plan.at[i - 1]);
  assert.ok(plan.at[plan.at.length - 1] < 45);
});

t("Morris and Ehrlich get their own windows, not Marquis's", () => {
  assert.equal(capturePlan({ read: "5:00" }).total, 300);
  assert.equal(capturePlan({ read: "30:00" }).total, 1800);
});

t("a step with no published read window gets no plan", () => {
  assert.equal(capturePlan({}), null);
  assert.equal(capturePlan({ read: "soon" }), null);
  assert.equal(capturePlan(null), null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
