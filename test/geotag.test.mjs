/* Where an alert says it happened.
 *
 * Getting this wrong is not a cosmetic bug. An alert filed under the wrong
 * county tells one set of readers about a supply that is not theirs, and tells
 * the county it actually happened in nothing at all — and the second half is
 * silent, which is the app's worst failure mode.
 *
 * Every case here is a defect that was live in production.
 */

import { buildIndex, geotag } from "../src/geotag.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
buildIndex(JSON.parse(readFileSync(path.join(ROOT, "data/counties.json"), "utf8")));

const cases = [];
const check = (name, fn) => cases.push({ name, fn });
const at = (title, hint = null) => geotag({ title, body: "" }, hint, null);

/* ------------------------------------------------- state name collisions */

check("West Virginia is not Virginia", () => {
  /* stateFromText scanned the state map in abbreviation order and returned the
     FIRST substring match, so VA (index 46) beat WV (index 48) and every West
     Virginia article resolved to Virginia. The two share no county names, so
     38 of West Virginia's 55 counties could never resolve at all. */
  const g = at("Health officials in Kanawha County, West Virginia confirm fentanyl deaths");
  return g?.state === "WV" ? null : `got ${g?.state} / ${g?.name}`;
});

check("Virginia is still Virginia", () => {
  const g = at("Overdose spike in Fairfax County, Virginia");
  return g?.state === "VA" ? null : `got ${g?.state}`;
});

check("Kansas is not inside Arkansas", () => {
  const g = at("Pulaski County, Arkansas health department warns of xylazine");
  return g?.state === "AR" ? null : `got ${g?.state}`;
});

check("Kansas City is Missouri, not Kansas", () => {
  const g = at("Jackson County health officials in Kansas City, Missouri warn of a bad batch");
  return g?.state === "MO" ? null : `got ${g?.state} / ${g?.name}`;
});

check("every state name resolves to its own state", () => {
  /* The general form of the bug: any state name that contains another. */
  const states = JSON.parse(readFileSync(path.join(ROOT, "data/counties.json"), "utf8")).states;
  const bad = [];
  for (const [abbr, name] of Object.entries(states)) {
    const g = at(`Health department in ${name} reports an overdose spike`);
    if (g?.state !== abbr) bad.push(`${name} -> ${g?.state || "none"}, want ${abbr}`);
  }
  return bad.length ? bad.join("; ") : null;
});

/* ------------------------------------------- the query scope is a hint */

const COOK = "17031";

check("a county-scoped query does not override the text's own state", () => {
  /* geotag returned on hintFips before reading a word of the item. Google News
     does not enforce the quoted phrases in a query, so articles about other
     counties and other STATES were filed under whichever county was querying —
     and every ambiguity safeguard below that early return was unreachable for
     the pipeline's highest-volume source. */
  const g = at("Davidson County, Tennessee reports an overdose spike", COOK);
  return g === null ? null : `filed under ${g.name}, ${g.state} — should be dropped`;
});

check("the text wins over the query when it names another county in the same state", () => {
  const g = at("DuPage County officials confirm deaths in Illinois", COOK);
  return g?.fips === "17043" ? null : `got ${g?.name} (${g?.fips})`;
});

check("the query still answers when the text says nothing locational", () => {
  const g = at("Health officials warn about fentanyl in the supply", COOK);
  return g?.fips === COOK && g.method === "query_scope" ? null : JSON.stringify(g);
});

check("the query still answers when the text agrees", () => {
  const g = at("Cook County health department confirms fentanyl deaths", COOK);
  return g?.fips === COOK ? null : JSON.stringify(g);
});

/* -------------------------------------------------------------- general */

check("an ambiguous county name with no state is not guessed", () => {
  /* "Washington County" exists in 30 states. Guessing is worse than nothing. */
  const g = at("Washington County reports an overdose spike");
  return g === null || g.fips === null ? null : `guessed ${g.name}, ${g.state}`;
});

check("a comma-abbreviation still resolves", () => {
  /* This branch was dead code: it required [A-Z]{2} but was handed an
     already-lowercased string, so its own documented example could not match. */
  const g = at("Overdose deaths rise in Hamilton County, TN");
  return g?.state === "TN" ? null : `got ${g?.state}`;
});

/* ------------------------------------------------------------------- run */

console.log("\nGEOTAGGING");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
