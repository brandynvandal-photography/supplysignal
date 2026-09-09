/* THE DESCRIPTION IS THE MOLECULE. THE SUPPLY LINE IS THE MARKET.
 *
 * data/descriptions.json carries two maps since 2026-09-09: `descriptions`,
 * which says what a drug is and what it does, and `supply`, which says what is
 * sold as it, what pills actually contain, batch variance and cutting agents.
 * The split is the file's own last rule, and the reason is that the two kinds
 * of sentence read as one when they share a paragraph - "a benzodiazepine
 * prescribed as Xanax ... pressed pills sold as Xanax frequently contain a
 * different benzodiazepine" is a description of a drug and a warning about a
 * market welded together.
 *
 * This holds the line going forward: a supply sentence written back into a
 * description fails here, by the markers such sentences carry.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = JSON.parse(readFileSync(path.join(ROOT, "data", "descriptions.json"), "utf8"));
const desc = doc.descriptions || {};
const supply = doc.supply || {};

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("DESCRIPTIONS\n");

ok(`there are descriptions (${Object.keys(desc).length})`, Object.keys(desc).length > 200);
ok(`there are supply lines (${Object.keys(supply).length})`, Object.keys(supply).length >= 20);

const orphan = Object.keys(supply).filter((id) => !desc[id]);
ok("every supply line belongs to a drug that has a description" + (orphan.length ? `: ${orphan.join(", ")}` : ""), !orphan.length);

const unfinished = Object.entries(supply).filter(([, v]) => typeof v !== "string" || !/[.!?]$/.test(v.trim())).map(([k]) => k);
ok("every supply line is a finished sentence" + (unfinished.length ? `: ${unfinished.join(", ")}` : ""), !unfinished.length);

/* The markers. Each one is a phrase that only a sentence about the market
   uses; a description that needs one of them has a supply sentence in it. */
const MARKERS = [
  /\bstreet supply\b/i,
  /\bpressed (?:into|pills)\b/i,
  /\bfake (?:pills|Xanax|oxy)/i,
  /\bbatch to batch\b|\bfrom one batch\b/i,
  /\bcutting agent\b/i,
  /\bmix(?:ed)? evenly\b/i,
  /\bconsistent strength\b|\bstrengths? that are not stated\b|\bhow much is in a pill\b|\bamount in any given pill\b/i,
  /\bwhat (?:is|gets) sold (?:as|under)\b/i,
  /* "sold as ecstasy or molly" on MDMA's own page is a name, not a market
     claim, so the bare drug names are deliberately not markers. */
  /\bsold as (?:an? )?(?:MDMA substitute|Xanax|oxycodone|a legal stand-in|a supervised medical treatment)\b/i,
  /\bvary wildly in what they actually contain\b/i,
];
const leaked = Object.entries(desc)
  .filter(([, text]) => MARKERS.some((re) => re.test(text)))
  .map(([id, text]) => `${id} ("${(text.match(MARKERS.find((re) => re.test(text)))?.[0] || "").trim()}")`);
ok("no description carries a supply sentence" + (leaked.length ? `: ${leaked.slice(0, 6).join("; ")}` : ""), !leaked.length);

ok("the rule is written into the file", (doc.rules || []).some((r) => /NOTHING ABOUT THE SUPPLY IN THE DESCRIPTION/.test(r)));

const view = readFileSync(path.join(ROOT, "site", "js", "views", "substances.js"), "utf8");
ok("the drug page renders the supply line under the description", /s\.supply/.test(view) && /In the supply: /.test(view));
const dataJs = readFileSync(path.join(ROOT, "site", "js", "data.js"), "utf8");
ok("data.js attaches it", /desc\.supply\?\.\[s\.id\]/.test(dataJs));

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   ${Object.keys(supply).length} supply lines split out; no description carries one`);
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
