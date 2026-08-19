/* Reader-facing copy.
 *
 * This file exists because of one recurring bug. British spellings keep
 * arriving in the UI - two earlier sweeps replaced 58 and then 11 of them, and
 * "a US forensic science centre" still made it into the early-warning screen.
 * The audience is American, and an app about a US drug supply that spells like
 * a British one reads as though it was written somewhere else, about somewhere
 * else. Catching it by eye has now failed three times, so it is a test.
 *
 * Only STRING LITERALS are checked. Code comments are free to say "colour",
 * and Census place names like "Centre County, Pennsylvania" must survive - the
 * earlier sweep broke exactly that and had to be reverted. */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site", "js");

const cases = [];
const check = (name, fn) => cases.push({ name, fn });

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

/** Strip comments so only real code (and its string literals) remains. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:'"\\])\/\/.*$/gm, "$1 ");

/** Pull out the contents of ' " and ` literals. Good enough for prose copy. */
function stringLiterals(src) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  let m;
  while ((m = re.exec(src))) out.push(m[2]);
  return out;
}

/* Word-boundary matched, so "centre" is caught but "Centre County" is not -
   the exception is handled below by allowing a capitalised proper noun. */
/* Real proper nouns that happen to contain a British spelling. Nobody may
   "correct" these — they are names of places and products. Matched from the
   start of the hit, so "Centre County" is exempt and "Centre of the room" is
   not. Add to this list rather than reaching for case sensitivity again. */
const PROPER_NOUNS = [
  "Centre County", "Grey Eagle", "Discovery Harbour", "Centre Hall",
  "Centre Island", "Grey County", "Bay Centre", "Centre for Disease",
];

const BRITISH = [
  ["centre", "center"], ["colour", "color"], ["behaviour", "behavior"],
  ["favour", "favor"], ["labour", "labor"], ["organisation", "organization"],
  ["organise", "organize"], ["recognise", "recognize"], ["analyse", "analyze"],
  ["apologise", "apologize"], ["licence", "license"], ["defence", "defense"],
  ["practise", "practice"], ["programme", "program"], ["catalogue", "catalog"],
  ["travelling", "traveling"], ["cancelled", "canceled"], ["grey", "gray"],
  ["litre", "liter"], ["metre", "meter"], ["fibre", "fiber"],
  ["labelled", "labeled"], ["labelling", "labeling"], ["modelling", "modeling"],
  ["signalling", "signaling"], ["counsellor", "counselor"], ["counselling", "counseling"],
  /* Added after "a dissociative anaesthetic" sat in the PCP description
     through three sweeps - the medical words are the ones that slip past,
     because nobody re-reads a drug description looking for spelling. */
  ["anaesthetic", "anesthetic"], ["anaesthesia", "anesthesia"], ["haemorrhage", "hemorrhage"],
  ["oesophag", "esophag"], ["paediatric", "pediatric"], ["diarrhoea", "diarrhea"],
  ["foetal", "fetal"], ["oedema", "edema"], ["anaemia", "anemia"],
  ["gonorrhoea", "gonorrhea"], ["immunise", "immunize"], ["immunises", "immunizes"],
  ["offence", "offense"], ["offences", "offenses"], ["centimetre", "centimeter"],
  ["grovelling", "groveling"], ["characterise", "characterize"],
  ["uncharacterised", "uncharacterized"], ["vaporise", "vaporize"],
  ["paracetamol", "acetaminophen"], ["noradrenaline", "norepinephrine"],
  ["counsellor", "counselor"], ["randomised", "randomized"],
  ["licence", "license"], ["litre", "liter"], ["litres", "liters"],
];

/* Hand-written content files. The first version of this test scanned only
   site/js and therefore sailed past "An anaesthetic used in hospitals" sitting
   in descriptions.json. Reader-facing prose lives in both places. */
/* Globbed, not enumerated.
 *
 * This was a hardcoded list of 14 filenames, and it is why the test passed
 * today with fifteen British spellings shipped: sex.json, supervision.json and
 * stimulants.json were simply never opened. Seven of those fifteen were words
 * ALREADY on the list above. An allowlist that has to be updated by hand every
 * time content is added will always drift behind the content.
 *
 * Excluded files are generated upstream or geographic - their prose is not
 * ours to spell, and place names legitimately contain "Centre" and "Grey". */
const GENERATED = new Set([
  "substances.json", "combos.json", "reagents.json", "alerts.json", "emerging.json",
  "mortality.json", "regional.json", "places.json", "places-rural.json",
  "counties.json", "county-shapes.json", "adjacency.json", "index.json",
  "runs.json", "search.json", "gazetteer.json",
  /* topics.json is a CONCATENATION of the files above and below it, built by
     scripts/build-topics.mjs. Scanning it would re-check content already
     exempted at source - it caught a "catalogue" living inside a euda.europa.eu
     URL in emerging.json, which is generated and excluded for exactly that
     reason. Each constituent is still checked on its own where it should be. */
  "topics.json",
]);
const CONTENT = readdirSync(path.join(ROOT, "data"))
  .filter((f) => f.endsWith(".json") && !GENERATED.has(f))
  .map((f) => path.join(ROOT, "data", f));

check("no British spellings in reader-facing strings", () => {
  const bad = [];
  const targets = [
    ...walk(SITE).map((f) => [f, stringLiterals(stripComments(readFileSync(f, "utf8")))]),
    // JSON has no comments to strip; every string in it is content.
    ...CONTENT.map((f) => [f, JSON.stringify(JSON.parse(readFileSync(f, "utf8"))).split('"')]),
  ];

  for (const [file, literals] of targets) {
    for (const lit of literals) {
      for (const [uk, us] of BRITISH) {
        /* LEADING boundary only, and this is the fix for a real miss.
         *
         * Both ends were anchored, so "litre" was caught and "millilitres" was
         * not — and "Twenty millilitres" shipped in the strip dilution
         * instructions and rode into topics.json from there. British spellings
         * take suffixes and prefixes like any other word, and requiring a
         * boundary on the right meant the list only ever caught the bare stem.
         *
         * The left boundary stays. It is what keeps "analyse" from firing on
         * "analysis" and lets place names beginning mid-word survive. */

        /* EITHER CASE ON THE FIRST LETTER, which is the third miss this test
         * has had.
         *
         * It matched lowercase only, and the reason was sound: that is what
         * kept a capitalised Centre County or Grey Eagle from firing. The cost
         * was that a British spelling STARTING A SENTENCE was invisible, and
         * "Practise both, now" duly shipped into Learn's Start-here block and
         * passed a full run of this suite.
         *
         * So the first letter is now matched in either case and the proper
         * nouns are named instead. A name on a list is a decision somebody
         * made; a case-sensitivity rule silently covering for it is not, and it
         * cannot tell a place from the first word of a sentence. */
        const head = uk[0];
        const re = new RegExp(`\\b[${head}${head.toUpperCase()}]${uk.slice(1)}`, "g");
        for (const m of lit.matchAll(re)) {
          if (PROPER_NOUNS.some((p) => lit.slice(m.index).startsWith(p))) continue;
          bad.push(`${path.relative(ROOT, file)}: "${m[0]}" should be "${us}"`);
        }
      }
    }
  }
  return bad.length ? [...new Set(bad)].join("; ") : null;
});

check("our own prose inside generated files is spell-checked too", () => {
  /* The other half of the same miss. Generated files are excluded above and
     should be — they carry Census place names (Centre County, Grey Eagle,
     Discovery Harbour), third-party prose nobody here may rewrite, and real
     street names like 4-HO-MET's "Colour". But some of them also carry OUR
     writing, and excluding the whole file meant "half a litre of grapefruit
     juice" was never looked at.

     So this checks only the parts written here: combos.json's food section,
     which is authored in build-combos.mjs and merged into TripSit's payload,
     and topics.json, which is a concatenation of hand-written content files.

     Not paracetamol. It is on the main list because it is the wrong word in
     our own copy, but it is also the international generic name and TripSit
     use it throughout — and their text is not ours to edit. */
  const PROSE_ONLY = [
    ["litre", "liter"], ["colour", "color"], ["behaviour", "behavior"],
    ["anaesthe", "anesthe"], ["diarrhoea", "diarrhea"], ["oesophag", "esophag"],
    ["paediatric", "pediatric"], ["defence", "defense"], ["licence", "license"],
    ["draught", "draft"], ["organisation", "organization"],
    ["recognise", "recognize"], ["metre", "meter"], ["fibre", "fiber"],
  ];

  const scan = (label, text) => {
    const out = [];
    for (const [uk, us] of PROSE_ONLY) {
      for (const m of text.matchAll(new RegExp(`\\b${uk}`, "gi"))) {
        /* Never inside a URL. EUDA publish a real /catalogue-page/ path and
           rewriting a link breaks it. */
        if (/https?:\/\/\S*$/.test(text.slice(Math.max(0, m.index - 120), m.index))) continue;
        out.push(`${label}: "${uk}" should be "${us}"`);
      }
    }
    return out;
  };

  const bad = [];
  const combos = path.join(ROOT, "data/combos.json");
  if (existsSync(combos)) {
    const food = JSON.parse(readFileSync(combos, "utf8")).food;
    if (food) bad.push(...scan("data/combos.json .food", JSON.stringify(food)));
  }
  const topics = path.join(ROOT, "data/topics.json");
  if (existsSync(topics)) bad.push(...scan("data/topics.json", readFileSync(topics, "utf8")));

  return bad.length ? [...new Set(bad)].join("; ") : null;
});

/* There is deliberately NO "banned phrases" check for copy that promises
   safety, even though rule 2 is the most important rule in the app.
 *
 * It was written and removed. A list of phrases like "no risk" or "is safe to
 * take" flagged three strings, and all three were the app doing its job:
 *
 *   "Treat this as 'no information', not 'no risk'."
 *   "Nothing here verifies a substance, clears it, or says it is safe to take."
 *   "No information is not the same as no risk."
 *
 * The dangerous phrase and its refutation are the same words. A regex cannot
 * tell a promise from its negation, and a check that fires on correct copy
 * gets muted or worked around - which leaves the codebase worse off than
 * having no check at all. This one needs a human reading the sentence.
 *
 * British spellings have no such problem: there is no context in which "centre"
 * is the right word here, which is why that check is reliable enough to keep. */

/* ------------------------------------------------------------------- run */


/* A LOCALE IS OFFERED ONLY IF ITS FILE SAYS IT WAS REVIEWED.
   es.json shipped with "_reviewed": false and was auto-selected for every
   Spanish device anyway. i18n.js now gates on a `reviewed` flag per locale;
   this holds the flag to the file so nobody can flip one without the other. */
check("every offered locale's reviewed flag matches its file", () => {
  const src = readFileSync(path.join(SITE, "i18n.js"), "utf8");
  const list = [...src.matchAll(/code:\s*"([^"]+)"[^}]*reviewed:\s*(true|false)/g)];
  if (list.length < 2) return `could not read LOCALES from i18n.js (found ${list.length})`;
  for (const [, code, flag] of list) {
    const f = path.join(ROOT, "data", "i18n", `${code}.json`);
    const doc = JSON.parse(readFileSync(f, "utf8"));
    const fileSays = doc._reviewed !== false;   // absent = the source language, reviewed by definition
    if ((flag === "true") !== fileSays)
      return `${code}: i18n.js says reviewed=${flag} but ${code}.json says _reviewed=${doc._reviewed}`;
  }
  return null;
});

console.log("\nCOPY");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
