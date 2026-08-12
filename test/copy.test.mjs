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

import { readdirSync, readFileSync, statSync } from "node:fs";
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
];

/* Hand-written content files. The first version of this test scanned only
   site/js and therefore sailed past "An anaesthetic used in hospitals" sitting
   in descriptions.json. Reader-facing prose lives in both places. */
const CONTENT = ["descriptions.json", "adulterants.json", "testing.json", "support.json"]
  .map((f) => path.join(ROOT, "data", f))
  .filter((f) => { try { readFileSync(f); return true; } catch { return false; } });

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
        // Lowercase only. A capitalised "Centre"/"Grey" is a proper noun
        // (Centre County PA, Grey County ON) and must be left alone.
        const re = new RegExp(`\\b${uk}\\b`, "g");
        if (re.test(lit)) {
          bad.push(`${path.relative(ROOT, file)}: "${uk}" should be "${us}"`);
        }
      }
    }
  }
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
