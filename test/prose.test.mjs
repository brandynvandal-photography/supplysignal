/* THE PROSE STAYS SHORT, AND IT NAMES NOBODY.
 *
 * Two rules of this app that only a scan can hold.
 *
 *   1. SENTENCE LENGTH. Mean sentence length across the hand-written text is
 *      about 14 words. The review of 2026-09-09 found 91 sentences over 30,
 *      the worst at 51, concentrated where the writing had drifted from
 *      "said" to "written"; they were split. This keeps a ceiling under the
 *      reader-facing text so a 50-word sentence cannot come back unnoticed:
 *      40 words, which every sentence left after that pass clears with room.
 *      Editors' notes are exempt (_note, _doc, a top-level note, rules), and
 *      so is data/corrections.json, whose own rule is that entries are never
 *      edited after the fact.
 *
 *   2. NO NAMED PERSON. The app never names a real person - not a victim,
 *      not an official, not a chemist. Four drug descriptions rewritten from
 *      Wikipedia leads carried the chemists who first made the molecule; the
 *      role and the company say everything a reader needs, and they were cut
 *      (2026-09-09). The patterns here are the shapes a name takes in prose:
 *      "by Firstname Lastname", "Firstname Lastname's team", a title before a
 *      name, "Firstname Lastname, a chemist". The allowlist is what already
 *      legitimately matches those shapes - counties, states, companies.
 *
 * Both scans read the hand-written datasets, the English interface strings
 * and the string literals in the views. Generated files are skipped: they
 * are rebuilt from these.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("PROSE\n");

/* Built by scripts/build-*.mjs, or ingested; never edited by hand. */
const GENERATED = new Set([
  "adjacency.json", "alerts.json", "combos.json", "counties.json", "county-mesh.json",
  "county-shapes.json", "descriptions.wikipedia.json", "donate.json", "emerging.json",
  "index.json", "mortality.json", "places-rural.json", "places.json", "reagents.json",
  "regional.json", "runs.json", "search.json", "structures.json", "substances.json",
  "topics.json",
]);
const CEILING = 40;
const EDITOR_NOTE = (p) => p.startsWith("_") || p === "note" || p.startsWith("rules") || /\._[a-z]/i.test(p);

/* A sentence ends at . ! or ?, optionally followed by a closing quote or
   bracket, then whitespace and a capital (or an opening quote or bracket).
   The closing-quote allowance is what keeps `...Care.” The same law...` from
   reading as one 38-word sentence. */
const sentences = (text) => String(text).replace(/\s+/g, " ").split(/(?<=[.!?]["”’)]?)\s+(?=[A-Z"“(])/);
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

const strings = [];   // { where, path, text, exempt }
const walk = (node, p, where) => {
  if (typeof node === "string") strings.push({ where, path: p, text: node, exempt: EDITOR_NOTE(p) });
  else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${p}[${i}]`, where));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, p ? `${p}.${k}` : k, where);
};
const dataDir = path.join(ROOT, "data");
const files = readdirSync(dataDir).filter((f) => f.endsWith(".json") && !GENERATED.has(f) && f !== "corrections.json");
for (const f of files) walk(JSON.parse(readFileSync(path.join(dataDir, f), "utf8")), "", f);
walk(JSON.parse(readFileSync(path.join(dataDir, "i18n", "en-US.json"), "utf8")), "", "i18n/en-US.json");

/* The views: every double-quoted literal on one line long enough to be a
   sentence. Template literals are skipped - they carry code. */
const viewsDir = path.join(ROOT, "site", "js", "views");
const jsFiles = [...readdirSync(viewsDir).map((f) => path.join("site/js/views", f)), "site/js/practice.js", "scripts/build-combos.mjs"];
for (const f of jsFiles) {
  const src = readFileSync(path.join(ROOT, f), "utf8");
  const re = /"((?:[^"\\\n]|\\.){60,})"/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split("\n").length;
    strings.push({ where: f, path: `line ${line}`, text: m[1].replace(/\\"/g, "\""), exempt: false });
  }
}
ok(`there is prose to scan (${files.length} datasets, ${jsFiles.length} scripts, ${strings.length} strings)`, strings.length > 2000);

/* ---- 1. the ceiling ---- */
const long = [];
let longest = 0;
for (const s of strings) {
  if (s.exempt) continue;
  for (const sent of sentences(s.text)) {
    const n = words(sent);
    if (n > longest) longest = n;
    if (n > CEILING) long.push(`${s.where} ${s.path} (${n} words: "${sent.trim().slice(0, 60)}…")`);
  }
}
ok(`no reader-facing sentence runs past ${CEILING} words (longest is ${longest})`
   + (long.length ? `: ${long.slice(0, 4).join("; ")}` : ""), !long.length);

/* ---- 2. nobody is named ---- */
const NAME_SHAPES = [
  /\bby [A-Z][a-z]+(?: [A-Z]\.)? [A-Z][a-zA-Z'-]+(?:'s)?\b/g,
  /\b[A-Z][a-z]+ [A-Z][a-z]+'s (?:team|lab|group|study|paper|report)\b/g,
  /\b(?:Dr|Prof|Professor|Mr|Ms|Mrs|Sen|Rep|Gov|Judge|Officer|Chief|Sheriff|Coroner|Detective)\.? [A-Z][a-z]+/g,
  /\b[A-Z][a-z]+ [A-Z][a-z]+, (?:a|an|the) (?:chemist|professor|doctor|physician|researcher|pharmacologist|nurse|officer|paramedic|mother|father|woman|man|DJ)\b/g,
  /\b(?:named|called|identified as) [A-Z][a-z]+ [A-Z][a-z]+\b/g,
];
/* Not people. Each of these matched a shape above and is a place, a program
   or a company; add here with the file it appears in when a new one does. */
const ALLOW = new Set([
  "by Lane County",          // checking.json - a county health department
  "by Project Weber",        // policy.json - Project Weber/RENEW, the Providence program
  "by New Mexico",           // policy.json - a state, in a list of states
  "by American Cyanamid",    // descriptions.json - the company that developed cyclazodone
]);
const named = [];
for (const s of strings) {
  for (const re of NAME_SHAPES) {
    for (const m of s.text.matchAll(re)) {
      if (ALLOW.has(m[0])) continue;
      named.push(`${s.where} ${s.path}: "${m[0]}"`);
    }
  }
}
ok("no prose names a person" + (named.length ? `: ${named.slice(0, 5).join("; ")}` : ""), !named.length);
ok("the allowlist only holds things that still occur (a stale entry hides a future name)",
   [...ALLOW].every((a) => strings.some((s) => s.text.includes(a))));

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   ${strings.length} strings scanned; longest sentence ${longest} words; nobody named`);
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
