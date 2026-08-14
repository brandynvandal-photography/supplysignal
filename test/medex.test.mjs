/* County medical-examiner adapters.
 *
 * Every check here is a bug that was live during the first run against real
 * data, written down so it cannot come back. The network parts are not tested
 * — four counties' APIs are not this suite's to keep green — but the decisions
 * made on top of what they return are, and those are where the mistakes were.
 *
 * The theme running through all of it: mortality data arrives late and
 * incomplete, and every naive reading of it is wrong in the direction of
 * publishing something confident and false. */

import { WATCH, LABEL, tally, exactP, completeThrough, humanLag } from "../src/sources/medex.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = JSON.parse(readFileSync(path.join(ROOT, "config/sources.json"), "utf8"));

const cases = [];
const check = (name, fn) => cases.push({ name, fn });
const eq = (a, b, what) => (a === b ? null : `${what}: expected ${b}, got ${a}`);

/* ------------------------------------------------------- substance matching */

/* Both shapes this has to parse, taken verbatim from the two APIs. */
const COOK = "COMBINED DRUG (HEROIN, FENTANYL, DESPROPIONYL FENTANYL, BROMAZOLAM, COCAINE,.... ...AND PROBABLE MEDETOMIDINE/DEXMEDETOMIDINE) TOXICITY";
const COOK2 = "COMBINED DRUG (FENTANYL, DESPROPIONYL FENTANYL, PHENCYCLIDINE,.... ...PROBABLE ORTHO-METHYLFENTANYL, AND PROBABLE N-PYRRO PROTONITAZENE) TOXICITY";

check("reads a real Cook County cause-of-death string", () => {
  const t = tally([COOK]);
  return eq(t.get("medetomidine"), 1, "medetomidine")
    || eq(t.get("bromazolam"), 1, "bromazolam");
});

check("matches a nitazene nobody has heard of yet", () => {
  /* The whole point of the family pattern. New nitazenes appear faster than
     anyone updates a word list, and they all end the same way. */
  const t = tally([COOK2]);
  return eq(t.get("nitazenes"), 1, "n-pyrro protonitazene")
    || eq(t.get("methylfentanyl"), 1, "ortho-methylfentanyl");
});

check("matches Allegheny's clean column names too", () => {
  const t = tally(["Para-Fluorofentanyl", "Acetyl Fentanyl", "Xylazine", "Carfentanil"]);
  return eq(t.get("fluorofentanyl"), 1, "fluorofentanyl")
    || eq(t.get("acetylfentanyl"), 1, "acetyl fentanyl")
    || eq(t.get("xylazine"), 1, "xylazine")
    || eq(t.get("carfentanil"), 1, "carfentanil");
});

check("carfentanil is not read as fentanyl, or acetyl fentanyl as either", () => {
  const t = tally(["Carfentanil"]);
  if (t.get("acetylfentanyl")) return "carfentanil counted as acetyl fentanyl";
  const u = tally(["Acetyl Fentanyl"]);
  if (u.get("carfentanil")) return "acetyl fentanyl counted as carfentanil";
  return null;
});

check("plain fentanyl and 4-ANPP raise nothing", () => {
  /* Present in nearly every record. An alert that fires everywhere every run
     is one people learn to scroll past. */
  const t = tally(["COMBINED DRUG (FENTANYL AND DESPROPIONYL FENTANYL [4-ANPP]) TOXICITY"]);
  return t.size ? `expected no watchlist hit, got ${[...t.keys()].join(", ")}` : null;
});

check("one record with a substance twice still counts once", () => {
  const t = tally(["XYLAZINE ... XYLAZINE"]);
  return eq(t.get("xylazine"), 1, "xylazine");
});

check("every watchlist entry has a display label", () => {
  /* A missing label falls back to the internal id and ships a headline
     reading "Acetylfentanyl is turning up in Cook County's drug supply". */
  const bad = WATCH.map(([id]) => id).filter((id) => !LABEL[id]);
  return bad.length ? `no LABEL for: ${bad.join(", ")}` : null;
});

/* ------------------------------------------------------- the exact test */

check("Fisher's exact agrees with R", () => {
  /* R: fisher.test(matrix(c(3,1,1,3)), alternative="greater") -> 0.2429 */
  const p = exactP(3, 4, 1, 4);
  return Math.abs(p - 0.2429) < 0.0005 ? null : `got ${p.toFixed(4)}`;
});

check("a doubling on five records is not a finding", () => {
  /* The live first run wanted to publish "medetomidine, 6% against 3%" off
     5 of 83. The old z-test called that 1.90 and the bar was 2.0 - too close
     for something driven by four extra deaths. Exactly: p = 0.093. */
  const p = exactP(5, 83, 20, 751);
  return p > 0.001 ? null : `p=${p.toExponential(2)}, expected to stay quiet`;
});

check("acetyl fentanyl at 13 of 161 against 18 of 765 publishes", () => {
  /* The one real alert this feed has produced. */
  const p = exactP(13, 161, 18, 765);
  return p <= 0.001 ? null : `p=${p.toExponential(2)}, expected to clear the bar`;
});

check("the estimated baseline is not treated as known", () => {
  /* The old test compared against the baseline RATE as though it were a
     constant, which inflated the false-alarm rate 2.7x - a baseline that
     lands low by chance both lowers the ratio bar and shrinks the sd. Fisher
     conditions on the margins, so a thinner baseline is less certain, not
     more convincing: the same rise off a smaller baseline must score worse. */
  const wide = exactP(8, 100, 40, 2000);   // 2% baseline, 2000 observations
  const thin = exactP(8, 100, 2, 100);     // 2% baseline, 100 observations
  return thin > wide ? null : `thin=${thin.toExponential(2)} not weaker than wide=${wide.toExponential(2)}`;
});

check("an impossible table cannot return a significant p", () => {
  const bad = [exactP(-1, 10, 1, 10), exactP(5, 0, 1, 10), exactP(0, 0, 0, 0)];
  return bad.every((p) => p === 1) ? null : JSON.stringify(bad);
});

/* ------------------------------------------------------ completeness anchor */

/* Cook and Allegheny as measured on 2026-08-14. Both tails are partial; they
   are partial by very different amounts, which is why this is not a constant. */
const COOK_MONTHS = [
  ["2025-06", 74], ["2025-07", 63], ["2025-08", 61], ["2025-09", 56],
  ["2025-10", 65], ["2025-11", 52], ["2025-12", 57], ["2026-01", 77],
  ["2026-02", 61], ["2026-03", 57], ["2026-04", 69], ["2026-05", 48],
  ["2026-06", 46], ["2026-07", 16],
].map(([m, n]) => ({ m, n }));

const ALLEGHENY_MONTHS = [
  ["2025-06", 33], ["2025-07", 27], ["2025-08", 28], ["2025-09", 23],
  ["2025-10", 26], ["2025-11", 28], ["2025-12", 19], ["2026-01", 31],
  ["2026-02", 18], ["2026-03", 13], ["2026-04", 10], ["2026-05", 10],
  ["2026-06", 1],
].map(([m, n]) => ({ m, n }));

check("Cook's quarter-complete July does not become the anchor", () => {
  const r = completeThrough(COOK_MONTHS, 0.7);
  return eq(r?.through, "2026-06-30", "anchor");
});

check("Allegheny anchors months back, not at its newest record", () => {
  /* Its newest record was 65 days old. It is still filling in April. */
  const r = completeThrough(ALLEGHENY_MONTHS, 0.7);
  return eq(r?.through, "2026-01-31", "anchor");
});

check("a county whose caseload genuinely halved is not frozen out", () => {
  /* The old whole-span median made this permanent: 14 months at 40 keeps the
     bar at 28, so no month at a true new rate of 18 could ever clear it. The
     anchor froze, aged past maxLagDays, and the source was dropped as "stale"
     while it was publishing perfectly current data. */
  const declined = [
    ...Array.from({ length: 14 }, (_, i) => ({ m: `2025-${String(i + 2).padStart(2, "0")}`, n: 40 }))
      .map((x, i) => ({ m: i < 11 ? `2025-${String(i + 2).padStart(2, "0")}` : `2026-${String(i - 10).padStart(2, "0")}`, n: 40 })),
    { m: "2026-04", n: 18 }, { m: "2026-05", n: 18 }, { m: "2026-06", n: 18 },
    { m: "2026-07", n: 9 },
  ];
  return eq(completeThrough(declined, 0.7)?.through, "2026-06-30", "anchor");
});

check("a surge does not drag the anchor into a half-filled month", () => {
  /* 13 steady months at 30, then a July whose real count is 60 with only 33
     filed. 33 clears a level bar, so the old code ended the window inside it -
     and the missing 45% skews toward the cases needing confirmatory testing,
     which is to say toward the unusual adulterants. A false negative exactly
     when the feed's one job is to fire. */
  const surge = [
    ...["2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12",
        "2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"].map((m) => ({ m, n: 30 })),
    { m: "2026-07", n: 33 },
  ];
  return eq(completeThrough(surge, 0.7)?.through, "2026-06-30", "anchor");
});

check("a seasonal trough is not discarded every winter", () => {
  const seasonal = [
    ["2025-05",42],["2025-06",42],["2025-07",42],["2025-08",42],["2025-09",30],
    ["2025-10",25],["2025-11",20],["2025-12",20],["2026-01",20],["2026-02",25],
    ["2026-03",30],["2026-04",42],["2026-05",42],["2026-06",42],
  ].map(([m, n]) => ({ m, n }));
  return eq(completeThrough(seasonal, 0.7)?.through, "2026-06-30", "anchor");
});

check("too little history returns nothing rather than guessing", () => {
  const r = completeThrough([{ m: "2026-01", n: 10 }, { m: "2026-02", n: 9 }], 0.7);
  return r === null ? null : `expected null, got ${JSON.stringify(r)}`;
});

check("a county that stopped publishing anchors on its last real month", () => {
  const dead = [
    ["2025-01", 30], ["2025-02", 30], ["2025-03", 30], ["2025-04", 30],
    ["2025-05", 30], ["2025-06", 0], ["2025-07", 0], ["2025-08", 0],
  ].map(([m, n]) => ({ m, n }));
  const r = completeThrough(dead, 0.7);
  /* Three zero months in a row are a plateau by arithmetic. They must never
     be read as a settled new level and reported as a full, empty window. */
  return r && r.month.n > 0 ? null : `anchored on ${JSON.stringify(r?.month)}`;
});

/* ------------------------------------------------------------------- prose */

check("the lag never reads 'about 1 days'", () => {
  const bad = [];
  for (let d = 0; d <= 400; d++) {
    const s = humanLag(d);
    if (/\b1 (days|weeks|months)\b/.test(s)) bad.push(`${d} -> "${s}"`);
  }
  return bad.length ? bad.slice(0, 3).join("; ") : null;
});

/* ------------------------------------------------------ deliberate scoping */

check("levamisole and BTMPS stay off the watchlist", () => {
  /* Verified absent from all four sources on 2026-08-14 - including Allegheny,
     which filters by nothing at all - so no denominator change can expose
     them. A medical examiner measures what killed someone; a cocaine cutting
     agent at non-lethal concentration is a drug-CHECKING finding. Listing
     them here only implied a mortality source could see them.
     If this check fails because someone re-added them, the question to ask is
     whether a drug-checking source landed - not whether the filter changed. */
  const ids = WATCH.map(([id]) => id);
  const bad = ["levamisole", "BTMPS"].filter((x) => ids.includes(x));
  return bad.length ? `${bad.join(", ")} cannot fire from a mortality source` : null;
});

check("every enabled source states the denominator its shares are of", () => {
  /* Cook and San Diego count opioid-involved deaths, Allegheny all accidental
     overdoses, Santa Clara fentanyl-involved. A share means something
     different under each, so each alert says which. */
  const bad = SOURCES.medicalExaminers.sources
    .filter((s) => s.enabled)
    .filter((s) => !/deaths$/.test(s.denominator || ""));
  return bad.length ? bad.map((s) => `${s.id}: ${s.denominator}`).join("; ") : null;
});

/* ------------------------------------------------------------------ config */

check("every enabled source names its date field and its denominator", () => {
  const bad = [];
  for (const s of SOURCES.medicalExaminers.sources.filter((x) => x.enabled)) {
    if (!s.dateField) bad.push(`${s.id}: no dateField`);
    if (!s.denominator) bad.push(`${s.id}: no denominator`);
    if (!s.fips || !/^\d{5}$/.test(s.fips)) bad.push(`${s.id}: bad fips ${s.fips}`);
    if (!s.landing) bad.push(`${s.id}: no landing url`);
  }
  return bad.length ? bad.join("; ") : null;
});

check("no source asks for a column that identifies anybody", () => {
  /* The privacy boundary is $select. These datasets carry age, race, sex,
     street, ZIP and lat/lon; the whole design is that they are never
     requested, so the config must never name one. */
  const banned = /\b(age|race|sex|gender|latino|ethnic|name|case_?number|street|zip|latitude|longitude|location|residence)\b/i;
  const bad = [];
  for (const s of SOURCES.medicalExaminers.sources) {
    for (const f of [...(s.textFields || []), s.dateField, ...(s.drugColumns || [])]) {
      if (f && banned.test(f)) bad.push(`${s.id}: ${f}`);
    }
  }
  return bad.length ? bad.join("; ") : null;
});

check("every county in the config is a real FIPS", () => {
  const counties = JSON.parse(readFileSync(path.join(ROOT, "data/counties.json"), "utf8"));
  const known = new Set(counties.counties.map((c) => c.fips));
  const bad = SOURCES.medicalExaminers.sources
    .filter((s) => !known.has(s.fips))
    .map((s) => `${s.id}:${s.fips}`);
  return bad.length ? bad.join(", ") : null;
});

/* ------------------------------------------------------------------- run */

console.log("\nMEDICAL EXAMINERS");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
