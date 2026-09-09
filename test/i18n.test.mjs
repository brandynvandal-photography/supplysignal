/* NUMBERS DO NOT MOVE IN TRANSLATION.
 *
 * docs/TRANSLATION.md hands a translator the `sos` block of en-US.json - the
 * six overdose steps, the opening lines and the hotline descriptions - with
 * one rule above every other: the facts are not negotiable. 2-3 minutes,
 * 30-90 minutes, one breath every 5 seconds, 911, 988. A translation that
 * reads well and says "5 minutes" is worse than English, and nothing in the
 * app would notice: t() hands back whatever the locale file holds.
 *
 * So this holds it. For every locale other than en-US:
 *
 *   1. every key it carries exists in en-US. An orphan key is a typo, and a
 *      typo falls back to English in silence for the key that was meant.
 *   2. inside `sos`, every value it translates carries exactly the numbers
 *      the English does - the same digit runs, the same number of them.
 *   3. no translated value is empty, and none is the English untouched: an
 *      unedited copy of the block would pass 2 while translating nothing.
 *   4. a locale marked reviewed in site/js/i18n.js carries the WHOLE sos
 *      block. A language offered to readers cannot show them English at the
 *      moment of use.
 *
 * And for en-US itself: the block exists, the six steps each have a title and
 * a body, and the figures the brief names are present in it - so the brief
 * and the file cannot drift apart either.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "data", "i18n");

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("I18N\n");

const load = (f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8"));
const flatten = (node, prefix = "", out = new Map()) => {
  if (typeof node === "string") out.set(prefix, node);
  else if (Array.isArray(node)) node.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("_")) continue;              // _note, _reviewed: editor notes, never strings
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
};
const digits = (s) => (String(s).match(/\d+/g) || []).join(",");

/* ---- en-US: the block the brief describes ---- */
const en = load("en-US.json");
const enFlat = flatten(en);
const sos = en.sos || {};
ok("en-US carries the sos block", Object.keys(sos).length > 0);
ok("the six overdose steps each have a title and a body",
   Array.isArray(sos.steps) && sos.steps.length === 6
   && sos.steps.every((s) => typeof s.title === "string" && s.title.length > 4 && typeof s.body === "string" && s.body.length > 20));
const sosText = [...enFlat].filter(([k]) => k.startsWith("sos.")).map(([, v]) => v).join(" ");
for (const [what, re] of [
  ["2-3 minutes between naloxone doses", /\b2[–-]3 minutes\b/],
  ["30-90 minutes before naloxone wears off", /\b30[–-]90 minutes\b/],
  ["one breath every 5 seconds", /every 5 seconds\b/],
  ["911", /\b911\b/],
  ["988", /\b988\b/],
]) ok(`the brief's figure is in the English block: ${what}`, re.test(sosText));

const empty = [...enFlat].filter(([, v]) => !v.trim()).map(([k]) => k);
ok("no English string is empty" + (empty.length ? `: ${empty.join(", ")}` : ""), !empty.length);

/* ---- the reviewed flags, read from the module that offers locales ---- */
const i18nSrc = readFileSync(path.join(ROOT, "site", "js", "i18n.js"), "utf8");
const reviewed = new Map([...i18nSrc.matchAll(/\{\s*code:\s*"([^"]+)"[^}]*reviewed:\s*(true|false)/g)].map((m) => [m[1], m[2] === "true"]));
ok("site/js/i18n.js declares which locales are reviewed", reviewed.size >= 2 && reviewed.get("en-US") === true);

/* ---- every other locale ---- */
const others = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "en-US.json");
ok(`there is at least one other locale file (${others.join(", ")})`, others.length > 0);

for (const f of others) {
  const code = f.replace(/\.json$/, "");
  const loc = flatten(load(f));

  const orphans = [...loc.keys()].filter((k) => !enFlat.has(k));
  ok(`${code}: every key exists in en-US` + (orphans.length ? `: ${orphans.slice(0, 5).join(", ")}` : ""), !orphans.length);

  const sosKeys = [...loc.keys()].filter((k) => k.startsWith("sos.") && enFlat.has(k));
  const moved = sosKeys.filter((k) => digits(loc.get(k)) !== digits(enFlat.get(k)))
    .map((k) => `${k} (en ${digits(enFlat.get(k)) || "none"} / ${code} ${digits(loc.get(k)) || "none"})`);
  ok(`${code}: the numbers in the sos block match the English exactly (${sosKeys.length} keys translated)`
     + (moved.length ? `: ${moved.slice(0, 4).join("; ")}` : ""), !moved.length);

  const blank = [...loc].filter(([, v]) => !String(v).trim()).map(([k]) => k);
  ok(`${code}: no translated string is empty` + (blank.length ? `: ${blank.slice(0, 5).join(", ")}` : ""), !blank.length);

  const untouched = sosKeys.filter((k) => loc.get(k) === enFlat.get(k));
  ok(`${code}: no sos value is the English left as it was` + (untouched.length ? `: ${untouched.slice(0, 5).join(", ")}` : ""), !untouched.length);

  const isReviewed = reviewed.get(code) === true;
  const missing = [...enFlat.keys()].filter((k) => k.startsWith("sos.") && !loc.has(k));
  ok(`${code}: ${isReviewed ? "reviewed, so it carries the whole sos block" : `not yet offered to readers (${missing.length} sos keys fall back to English)`}`
     + (isReviewed && missing.length ? `: missing ${missing.slice(0, 5).join(", ")}` : ""),
     !isReviewed || !missing.length);
}

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   en-US sos block intact; ${others.length} other locale(s) checked against it`);
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
