/* NO SHARED SENTENCE MAY STATE A TIME THAT VARIES BY BRAND.
 *
 * Found on 2026-09-05, live on the site, on the app's highest-stakes control.
 *
 * The strip section prints brandPicker's per-brand table and then a block of
 * reading prose that every brand shares. Three of the six brands say "Wait 5
 * minutes" - BTNX fentanyl, Lochness, BTNX xylazine - and the shared sentence
 * underneath said "wait the full three minutes before deciding". A reader who
 * picked BTNX got a five-minute instruction and a three-minute instruction
 * twenty pixels apart, and the three-minute one was the more emphatic of the
 * two.
 *
 * Nothing in ~380 tests could see it, because each half was internally
 * consistent. The contradiction only exists in the composition, which is
 * exactly the seam this file watches: a duration written into prose that is
 * rendered for ALL brands, when the brands disagree about the duration.
 *
 * WHAT IT CHECKS
 *
 *   1. Every brand still states a dip time and a wait time. Presence first -
 *      a test that only checks agreement passes vacuously when a field goes
 *      missing, which is how "litre" shipped past the copy guard twice.
 *   2. The brands genuinely disagree. If they ever all converge on one number
 *      this test says so, because at that point a shared sentence naming it
 *      would be legitimate and this guard would be over-strict.
 *   3. No string in strips[].reading - the prose every brand shares - names a
 *      duration at all. That is the actual rule, and it is stricter than
 *      "matches the brand", deliberately: shared prose cannot be right for
 *      every brand while naming one brand's number.
 *
 * WHAT IT DOES NOT CHECK. Per-brand prose may name times freely; that is
 * where a time belongs. The strip-level procedure may state a generic limit
 * ("do not read after 10 minutes") because that one is generic to the strip
 * type rather than to a brand - so procedure text is exempt and the exemption
 * is narrow and named.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const d = JSON.parse(readFileSync(path.join(ROOT, "data", "testing.json"), "utf8"));

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("TIMING\n");

const brands = (d.brands?.items || []);
ok(`there are brands to check (${brands.length})`, brands.length >= 4);

/* ---- 1. every brand states its own times ---- */
const missing = brands.filter((b) => !b.wait || !b.dip).map((b) => b.name);
ok("every brand states a dip time and a wait time"
   + (missing.length ? `: ${missing.join(", ")}` : ""), !missing.length);

/* Minutes named in each brand's wait line. */
const MINUTES = /\b(\d+(?:\.\d+)?)\s*(?:minute|minutes|min)\b/i;
const WORD_MIN = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:minute|minutes)\b/i;
const waits = brands.map((b) => ({
  name: b.name,
  strip: b.strip,
  mins: (b.wait.match(MINUTES) || [])[1] || null,
}));
const stated = waits.filter((w) => w.mins);
ok(`every brand's wait line names a number (${stated.length}/${brands.length})`,
   stated.length === brands.length);

/* ---- 2. the brands disagree, which is why shared prose may not name one ---- */
const distinct = new Set(stated.map((w) => w.mins));
ok(`brands disagree about the wait, so no shared sentence may name one `
   + `(${[...distinct].sort().join(" and ")} minutes)`, distinct.size > 1);

/* ---- 3. the shared reading prose names no duration ---- */
const offenders = [];
for (const strip of d.strips || []) {
  const reading = strip.reading;
  if (!reading || typeof reading !== "object") continue;
  for (const [key, text] of Object.entries(reading)) {
    if (typeof text !== "string") continue;
    const m = text.match(MINUTES) || text.match(WORD_MIN);
    if (m) offenders.push(`${strip.id || strip.name || "strip"}.reading.${key} says "${m[0]}"`);
  }
}
ok("no shared reading line states a duration"
   + (offenders.length ? `: ${offenders.join("; ")}` : ""), !offenders.length);

/* The reader is still told to wait for something - the sentence must point at
   where the real number is rather than simply dropping it. */
const faint = d.strips?.[0]?.reading?.faintLine || "";
ok("the faint-line rule still tells the reader to wait for the full time",
   /wait the full time/i.test(faint));

/* ---- 4. the machine-readable seconds agree with the printed prose ----
 *
 * waitSeconds and dipSeconds drive the countdown; b.wait and b.dip are what the
 * reader is shown. If those two ever disagree the clock says one thing and the
 * table says another, on the same card, which is the exact failure this file
 * was opened for one level up. Both were DERIVED from the prose rather than
 * typed, so today they agree by construction - this is what keeps them agreeing
 * after somebody edits one of them. */
const WORDS = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
const parse = (text, unit) => {
  const n = text.match(new RegExp(`\\b(\\d+)\\s*${unit}`, "i"));
  if (n) return Number(n[1]);
  const w = text.match(new RegExp(`\\b(${Object.keys(WORDS).join("|")})\\s+${unit}`, "i"));
  return w ? WORDS[w[1].toLowerCase()] : null;
};

const drift = [];
for (const b of brands) {
  if (!b.waitSeconds || !b.dipSeconds) { drift.push(`${b.name} has no waitSeconds/dipSeconds`); continue; }
  const waitMin = parse(b.wait, "minutes?");
  const dipSec = parse(b.dip, "seconds?");
  if (waitMin != null && waitMin * 60 !== b.waitSeconds) {
    drift.push(`${b.name}: wait says ${waitMin} min, waitSeconds is ${b.waitSeconds}`);
  }
  if (dipSec != null && dipSec !== b.dipSeconds) {
    drift.push(`${b.name}: dip says ${dipSec}s, dipSeconds is ${b.dipSeconds}`);
  }
}
ok("the countdown's seconds match the printed dip and wait"
   + (drift.length ? `: ${drift.join("; ")}` : ""), !drift.length);

/* The read ceiling belongs to the strip type and must come from its own
   procedure, not from a number somebody chose. */
const ceilings = (d.strips || []).filter((s) => s.readCeilingSeconds);
ok(`at least one strip publishes a read ceiling (${ceilings.length})`, ceilings.length > 0);
const badCeiling = ceilings.filter((s) =>
  !JSON.stringify(s.procedure || []).match(new RegExp(`${s.readCeilingSeconds / 60}\\s*minutes`, "i")));
ok("every read ceiling is stated in that strip's own procedure"
   + (badCeiling.length ? `: ${badCeiling.map((s) => s.id).join(", ")}` : ""), !badCeiling.length);

/* ---- 5. demoting a footnote may not delete it ----
 *
 * The reagent procedure's steps were split on 2026-09-05: the instruction stays
 * in `body`, the reasoning moves to `more` and renders behind a "Why" fold. A
 * split like that is one careless edit away from being a deletion, and the
 * sentences most at risk are exactly the ones worth keeping - the hedges and
 * the failure modes, which are what a demotion is tempted to drop.
 *
 * So the load-bearing phrases are named. Each is checked against body AND more
 * together, because which side of the split it sits on is a judgement that may
 * change; whether it is on the page at all is not. */
const MUST_SURVIVE = [
  ["Use a pinhead of sample", "10 mg of active drug"],
  ["Never test the whole pill, and never in the bag", "concentrated acids"],
  ["Never test the whole pill, and never in the bag", "Ehrlich"],
  ["One drop, and never touch the sample with the bottle", "contaminates the entire bottle"],
  ["One drop, and never touch the sample with the bottle", "SAME sample"],
  ["Watch from the moment the drop lands", "no single correct number"],
  ["Watch from the moment the drop lands", "40 seconds to 3 minutes"],
  ["Run a blank next to it", "darken with age"],
];
const lost = [];
for (const [title, phrase] of MUST_SURVIVE) {
  const step = (d.procedure || []).find((x) => x.title === title);
  if (!step) { lost.push(`step "${title}" is gone`); continue; }
  const all = `${step.body || ""} ${step.more || ""}`;
  if (!all.includes(phrase)) lost.push(`"${title}" no longer says "${phrase}"`);
}
ok("no sentence was lost when the footnotes were demoted"
   + (lost.length ? `: ${lost.join("; ")}` : ""), !lost.length);

/* And the instruction itself stays on the surface: a step whose body is only a
   fragment has had too much moved down. */
const thin = (d.procedure || [])
  .filter((x) => (x.body || "").trim().length < 40)
  .map((x) => `${x.title} (${(x.body || "").length} chars)`);
ok("every step's instruction is still readable without opening anything"
   + (thin.length ? `: ${thin.join("; ")}` : ""), !thin.length);

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) {
  console.log(`  ok   ${brands.length} brands state their own dip and wait times`);
  console.log(`  ok   shared reading prose names no duration (${[...distinct].sort().join("/")} min brands coexist)`);
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
