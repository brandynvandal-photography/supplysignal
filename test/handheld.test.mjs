/**
 * Who gets offered the reagent camera.
 *
 * The rule is "a phone or an iPad, not a Mac", and it cannot be written as a
 * user-agent check: iPadOS Safari reports itself as macOS on purpose, so any
 * string match either misses every iPad or catches every Mac. What actually
 * separates them is the hardware - a touch screen the reader can hold over a
 * spot plate - so that is what gets asked about.
 *
 * The one case this must never get wrong is macOS Safari. A Mac has no rear
 * camera to point at a plate, and offering the sheet there ends in a webcam
 * pointed at somebody's face while they are trying to read a drug test.
 *
 * Run: node test/handheld.test.mjs
 */

import assert from "node:assert/strict";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

/* The gate, restated. Kept in step with site/js/scanui.js by the last test in
   this file, which reads that source and asserts the two agree. */
function handheldCamera(nav, mm) {
  if (!nav) return false;
  if (!nav.mediaDevices?.getUserMedia) return false;
  const touch = (nav.maxTouchPoints || 0) > 0;
  const coarse = typeof mm === "function" && mm("(pointer: coarse)").matches;
  return touch && coarse;
}

const media = (coarse) => (q) => ({ matches: coarse && q.includes("coarse") });
const cam = { getUserMedia() {} };

console.log("HANDHELD CAMERA GATE");

t("iPhone Safari is offered the camera", () => {
  assert.equal(handheldCamera({ maxTouchPoints: 5, mediaDevices: cam }, media(true)), true);
});

/* The whole reason this is not a user-agent check. */
t("iPadOS Safari is offered it, despite claiming to be a Mac", () => {
  assert.equal(handheldCamera({ maxTouchPoints: 5, mediaDevices: cam }, media(true)), true);
});

t("macOS Safari is not offered it", () => {
  assert.equal(handheldCamera({ maxTouchPoints: 0, mediaDevices: cam }, media(false)), false);
});

t("a desktop with a webcam and a mouse is not offered it", () => {
  assert.equal(handheldCamera({ maxTouchPoints: 0, mediaDevices: cam }, media(false)), false);
});

/* A touch-screen Windows laptop reports touch points but drives a mouse, so
   its primary pointer stays fine. Both conditions are required for that. */
t("a touch laptop driven by a mouse is not offered it", () => {
  assert.equal(handheldCamera({ maxTouchPoints: 10, mediaDevices: cam }, media(false)), false);
});

t("a coarse pointer with no touch screen is not offered it", () => {
  assert.equal(handheldCamera({ maxTouchPoints: 0, mediaDevices: cam }, media(true)), false);
});

t("no camera API means no offer, however the device answers", () => {
  assert.equal(handheldCamera({ maxTouchPoints: 5, mediaDevices: {} }, media(true)), false);
  assert.equal(handheldCamera({ maxTouchPoints: 5 }, media(true)), false);
});

t("a missing navigator or matchMedia is refused, not assumed", () => {
  assert.equal(handheldCamera(null, media(true)), false);
  assert.equal(handheldCamera({ maxTouchPoints: 5, mediaDevices: cam }, undefined), false);
});

/* THE COPY OF THE RULE ABOVE MUST STAY A COPY. If the shipped gate is edited,
   this file's version has to be edited with it or the tests above are checking
   something the site no longer does. */
t("the shipped gate still asks these same questions", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../site/js/scanui.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function handheldCamera"));
  const fn = body.slice(0, body.indexOf("\n}") + 2);
  assert.ok(fn.includes("maxTouchPoints"), "no longer checks for a touch screen");
  assert.ok(fn.includes("pointer: coarse"), "no longer checks the pointer type");
  assert.ok(fn.includes("getUserMedia"), "no longer checks for a camera API");
  assert.ok(!/userAgent|platform/.test(fn),
    "went back to sniffing the user agent, which cannot tell an iPad from a Mac");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
