/* The combination supplement.
 *
 * These are the entries TripSit's chart has no category for, written by hand
 * against a source that was fetched and read. They are the only combination
 * claims in the app that are not quoted from upstream, so they carry the
 * project's sourcing rule directly: every one names a source, and the source
 * has to be somewhere a reader can actually get to.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMBOS = JSON.parse(readFileSync(path.join(ROOT, "data/combos.json"), "utf8"));
const VIEW = readFileSync(path.join(ROOT, "site/js/views/substances.js"), "utf8");

const cases = [];
const check = (name, fn) => cases.push({ name, fn });

check("every supplement entry is complete", () => {
  const bad = [];
  for (const s of COMBOS.supplement || []) {
    for (const k of ["id", "name", "with", "status", "note"]) {
      if (!s[k]) bad.push(`${s.id || "?"}: missing ${k}`);
    }
    if (!s.source?.name || !s.source?.url) bad.push(`${s.id}: missing source`);
  }
  return bad.length ? bad.join("; ") : null;
});

check("every source is an https link, not a bare citation", () => {
  /* A reader has to be able to check it. A journal name with no URL is a
     claim about a source rather than a source. */
  const bad = (COMBOS.supplement || [])
    .filter((s) => !/^https:\/\//.test(s.source?.url || ""))
    .map((s) => `${s.id}: ${s.source?.url}`);
  return bad.length ? bad.join("; ") : null;
});

check("every entry pairs with a category the chart actually has", () => {
  /* `with` drives the rendered caption. A typo would print a pairing that
     does not exist and cannot be looked up. */
  const cats = new Set(Object.keys(COMBOS.matrix || {}));
  const bad = (COMBOS.supplement || [])
    .filter((s) => !cats.has(s.with))
    .map((s) => `${s.id}: "${s.with}" is not a category`);
  return bad.length ? bad.join("; ") : null;
});

check("the caption uses each entry's own category, not a hardcoded one", () => {
  /* Every supplement entry paired with opioids until medetomidine and
     nitazenes were added, so the renderer hardcoded "+ opioids" and the field
     was never read - correct by coincidence. The first entry pairing with
     anything else would have been captioned wrongly. */
  if (VIEW.includes("`${s.name} + opioids`")) {
    return "supplementBlock still hardcodes + opioids";
  }
  if (!VIEW.includes("prettyCat(s.with")) {
    return "supplementBlock does not render s.with";
  }
  /* And there is at least one entry that would expose a regression. */
  const nonOpioid = (COMBOS.supplement || []).filter((s) => s.with !== "opioids");
  return nonOpioid.length ? null : "no non-opioid entry left to catch a regression";
});

check("nitazenes and medetomidine are covered", () => {
  /* Both are named by this app's own alert pipeline - Cook County's medical
     examiner reported medetomidine and N-pyrro protonitazene in its recent
     toxicology - and neither exists in TripSit's chart. A reader arriving
     from an alert must not find silence. */
  const ids = new Set((COMBOS.supplement || []).map((s) => s.id));
  const missing = ["medetomidine", "nitazenes"].filter((x) => !ids.has(x));
  return missing.length ? `no supplement entry for: ${missing.join(", ")}` : null;
});

check("the note says what naloxone does for each", () => {
  /* The single most consequential fact for both, and they differ: naloxone
     does not reverse medetomidine, and does reverse nitazenes. Getting either
     backwards in a hurry is the failure this app exists to prevent. */
  const bad = [];
  for (const id of ["medetomidine", "nitazenes"]) {
    const s = (COMBOS.supplement || []).find((x) => x.id === id);
    if (!s) continue;
    if (!/naloxone/i.test(s.note)) bad.push(`${id} does not mention naloxone`);
  }
  const med = (COMBOS.supplement || []).find((x) => x.id === "medetomidine");
  if (med && !/not an opioid|does not reverse/i.test(med.note)) {
    bad.push("medetomidine must say naloxone does not reverse it");
  }
  const nit = (COMBOS.supplement || []).find((x) => x.id === "nitazenes");
  if (nit && !/are opioids|naloxone does work/i.test(nit.note)) {
    bad.push("nitazenes must say they ARE opioids and naloxone works");
  }
  return bad.length ? bad.join("; ") : null;
});

check("the supplement does not contradict the adulterants page", () => {
  const AD = JSON.parse(readFileSync(path.join(ROOT, "data/adulterants.json"), "utf8"));
  const bad = [];
  for (const id of ["medetomidine", "nitazenes"]) {
    const a = (AD.substances || []).find((x) => x.id === id);
    const s = (COMBOS.supplement || []).find((x) => x.id === id);
    if (!a || !s) continue;
    const aSaysOpioid = /\bARE opioids\b/i.test(a.summary || "");
    const sSaysOpioid = /\bare opioids\b/i.test(s.note);
    if (aSaysOpioid !== sSaysOpioid) {
      bad.push(`${id}: adulterants says opioid=${aSaysOpioid}, supplement says ${sSaysOpioid}`);
    }
  }
  return bad.length ? bad.join("; ") : null;
});

/* ------------------------------------------------------------------- run */

console.log("\nCOMBINATION SUPPLEMENT");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
