/* Browsing substances by class.
 *
 * The point of these tests is coverage and safety, not tidiness. If a drug
 * belongs to no class it cannot be reached by browsing at all, and if a CNS
 * depressant is filed somewhere other than depressants it is missing from the
 * exact list someone checks before stacking it with an opioid. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLASSES, GROUP_ENTRIES, classesOf, groupAll, isClass, classInfo,
} from "../site/js/taxonomy.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB = JSON.parse(readFileSync(path.join(ROOT, "data", "substances.json"), "utf8"));
const AD = JSON.parse(readFileSync(path.join(ROOT, "data", "adulterants.json"), "utf8"));

/* Mirrors the merge in data.js: adulterants appended, upstream always wins. */
const have = new Set(DB.substances.map((s) => s.id));
const ALL = [...DB.substances, ...AD.substances.filter((s) => !have.has(s.id))];
const byName = (n) => ALL.find((s) => s.name === n);
const byId = (i) => ALL.find((s) => s.id === i);

const cases = [];
const check = (name, fn) => cases.push({ name, fn });

/* ------------------------------------------------------------- coverage */

check("every real substance is reachable by browsing", () => {
  const { unplaced } = groupAll(ALL);
  return unplaced.length
    ? `${unplaced.length} unreachable: ${unplaced.map((s) => s.name).join(", ")}`
    : null;
});

check("browsable + group entries account for the whole file", () => {
  const { groups } = groupAll(ALL);
  const reach = new Set();
  for (const list of groups.values()) for (const s of list) reach.add(s.id);
  const stubs = ALL.filter((s) => GROUP_ENTRIES.has(s.name)).length;
  const total = reach.size + stubs;
  return total === ALL.length ? null : `${total} accounted for, file has ${ALL.length}`;
});

check("no class is empty", () => {
  const { groups } = groupAll(ALL);
  const bare = CLASSES.filter((c) => !groups.get(c.slug).length).map((c) => c.label);
  return bare.length ? `empty classes would render as dead ends: ${bare}` : null;
});

check("every class slug resolves", () => {
  for (const c of CLASSES) {
    if (!isClass(c.slug)) return `isClass() rejects its own slug: ${c.slug}`;
    if (classInfo(c.slug)?.label !== c.label) return `classInfo() wrong for ${c.slug}`;
  }
  return isClass("not-a-class") ? "isClass() accepts an unknown slug" : null;
});

/* --------------------------------------------------------------- safety */

/* The overdose-relevant ones. Getting any of these wrong is the difference
   between someone finding an interaction warning and not. */
const MUST = {
  Fentanyl: "opioids", Heroin: "opioids", Methadone: "opioids",
  Oxycodone: "opioids", Buprenorphine: "opioids",
  Alcohol: "depressants", Alprazolam: "depressants", Diazepam: "depressants",
  Bromazepam: "depressants", Kava: "depressants", Zolpidem: "depressants",
  Cocaine: "stimulants", Methamphetamine: "stimulants",
  MDMA: "empathogens", Ketamine: "dissociatives", Cannabis: "cannabinoids",
  LSD: "psychedelics",
};

check("overdose-relevant substances land in the right class", () => {
  const wrong = [];
  for (const [name, want] of Object.entries(MUST)) {
    const s = byName(name);
    if (!s) { wrong.push(`${name} is ABSENT from the database`); continue; }
    const got = classesOf(s);
    if (!got.includes(want)) wrong.push(`${name}: expected ${want}, got [${got}]`);
  }
  return wrong.length ? wrong.join("; ") : null;
});

/* Benzodiazepines and z-drugs suppress breathing on their own and multiply the
   risk of an opioid. Every one of them must appear under depressants, whatever
   the source file happens to call it. */
check("all benzodiazepines and z-drugs are filed as depressants", () => {
  const missed = [];
  for (const s of ALL) {
    if (GROUP_ENTRIES.has(s.name)) continue;
    const chem = (s.class?.chemical || []).join(" ").toLowerCase();
    const isBenzo = /benzodiazepine/.test(chem);
    const isZ = /^(zolpidem|zopiclone|eszopiclone|zaleplon)$/i.test(s.name);
    if ((isBenzo || isZ) && !classesOf(s).includes("depressants")) {
      missed.push(`${s.name} [${classesOf(s)}]`);
    }
  }
  return missed.length ? `not browsable as depressants: ${missed.join(", ")}` : null;
});

/* "Hallucinogens" mixed z-drugs in with salvia. It must not come back. */
check("the Hallucinogens label is not used as a browse class", () => {
  if (CLASSES.some((c) => /hallucinogen/i.test(c.label))) return "Hallucinogens is back";
  const salvia = byName("Salvinorin A");
  if (!salvia) return null;
  const got = classesOf(salvia);
  if (!got.length) return "Salvinorin A lost its class when Hallucinogens was dropped";
  const ambien = byName("Zolpidem");
  return classesOf(ambien).includes(classesOf(salvia)[0])
    ? "Zolpidem and Salvinorin A share a class again"
    : null;
});

/* --------------------------------------------------------------- shape */

check("class pages are excluded from browsing but kept in the file", () => {
  const problems = [];
  for (const name of GROUP_ENTRIES) {
    const s = byName(name);
    if (!s) { problems.push(`${name} is listed as a group entry but not in the file`); continue; }
    if (classesOf(s).length) problems.push(`${name} is a class page yet appears in browsing`);
  }
  return problems.length ? problems.join("; ") : null;
});

check("multi-class substances appear in each of their classes", () => {
  const { groups } = groupAll(ALL);
  const multi = ALL.filter((s) => classesOf(s).length > 1);
  if (!multi.length) return "expected at least one multi-class substance";
  for (const s of multi.slice(0, 25)) {
    for (const slug of classesOf(s)) {
      if (!groups.get(slug).some((x) => x.id === s.id)) {
        return `${s.name} missing from ${slug}`;
      }
    }
  }
  return null;
});

check("opioids and depressants lead the ordering", () => {
  const first = CLASSES.slice(0, 2).map((c) => c.slug);
  return first[0] === "opioids" && first[1] === "depressants"
    ? null
    : `overdose-relevant classes must lead; got ${first}`;
});

check("listings are sorted and free of duplicates", () => {
  const { groups } = groupAll(ALL);
  for (const [slug, list] of groups) {
    const names = list.map((s) => s.name);
    if (new Set(list.map((s) => s.id)).size !== list.length) return `${slug} has duplicates`;
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    if (names.join("|") !== sorted.join("|")) return `${slug} is not sorted`;
  }
  return null;
});

/* ---------------------------------------------------------- adulterants */

/* These four are why the app exists, and they were missing entirely until
   2026-08-10 because the upstream wikis only document drugs people choose. */
const ADULTERANTS = {
  xylazine: "depressants",        // alpha-2 agonist - naloxone does NOT reverse
  medetomidine: "depressants",    // alpha-2 agonist - naloxone does NOT reverse
  nitazenes: "opioids",           // IS an opioid - naloxone DOES work
  btmps: "other",                 // industrial chemical, no psychoactive class
};

check("the adulterants driving current overdose deaths exist and are searchable", () => {
  const missing = Object.keys(ADULTERANTS).filter((id) => !byId(id));
  return missing.length ? `absent from the merged index: ${missing.join(", ")}` : null;
});

check("adulterants are classed by what they do to a body", () => {
  const wrong = [];
  for (const [id, want] of Object.entries(ADULTERANTS)) {
    const s = byId(id);
    if (!s) continue;
    const got = classesOf(s);
    if (!got.includes(want)) wrong.push(`${s.name}: expected ${want}, got [${got}]`);
  }
  return wrong.length ? wrong.join("; ") : null;
});

check("every adulterant is flagged so it never renders a dose chart", () => {
  const bad = [];
  for (const id of Object.keys(ADULTERANTS)) {
    const s = byId(id);
    if (!s) continue;
    if (s.adulterant !== true) bad.push(`${s.name} is missing adulterant:true`);
    if (s.roas?.length) bad.push(`${s.name} carries dose data - nobody chooses a dose of this`);
  }
  return bad.length ? bad.join("; ") : null;
});

/* The single most dangerous misreading available on these pages is "naloxone
   won't work on this, so don't bother". Xylazine and medetomidine are not
   opioids and naloxone does not reverse them - but they are mixed with
   fentanyl, so it must still be given. Both halves must be present. */
check("non-opioid adulterants still tell people to give naloxone", () => {
  const bad = [];
  for (const id of ["xylazine", "medetomidine"]) {
    const s = byId(id);
    if (!s) continue;
    if (s.naloxone?.reverses !== false) { bad.push(`${s.name}: should record that naloxone does not reverse it`); continue; }
    const blob = `${s.naloxone.lead} ${s.naloxone.text}`.toLowerCase();
    if (!/give it anyway|still be given|give naloxone/.test(blob)) {
      bad.push(`${s.name}: says naloxone does not work without saying to give it anyway`);
    }
  }
  return bad.length ? bad.join("; ") : null;
});

check("nitazenes are recorded as reversible by naloxone", () => {
  const s = byId("nitazenes");
  if (!s) return null;
  return s.naloxone?.reverses === true
    ? null
    : "nitazenes are opioids; naloxone works on them and the data must say so";
});

/* This one guards against a claim that is widely repeated and NOT supported.
   The published evidence puts the effective naloxone dose for nitazenes in the
   ordinary range; the real difference is that the drug can outlast naloxone.
   Writing "needs much higher doses" would be the exact class of overstatement
   EVIDENCE.md was written to prevent. */
/* Scoped to the HEADLINE claim, not the whole record.
   A first attempt scanned the entire entry for phrases like "many times the",
   and failed on this sentence:

     "You may have read that nitazenes need many times the usual amount of
      naloxone. The published evidence does not support that."

   which is the page doing its job. Same lesson as the copy suite: a phrase and
   its debunking are the same words, so the assertion is what gets tested. */
check("the nitazene headline says naloxone works at normal doses", () => {
  const s = byId("nitazenes");
  if (!s) return null;
  const lead = (s.naloxone?.lead || "").toLowerCase();
  if (/higher|more naloxone|many times|massive/.test(lead)) {
    return `the lead overstates the dose needed: "${s.naloxone.lead}"`;
  }
  if (!/normal|standard|usual/.test(lead)) {
    return `the lead should say naloxone works at ordinary doses; got "${s.naloxone.lead}"`;
  }
  const blob = JSON.stringify(s).toLowerCase();
  return /outlast|wear off|back under/.test(blob)
    ? null
    : "should explain that the drug can outlast naloxone - that is the real risk";
});

check("every adulterant claim carries a source", () => {
  const bad = [];
  for (const s of AD.substances) {
    const fields = [s.whyInSupply, s.naloxone, s.withdrawal, s.detection, s.prevalence]
      .filter(Boolean);
    for (const f of fields) {
      if (!f.sources?.length) bad.push(`${s.name}: an unsourced claim`);
      for (const src of f.sources || []) {
        if (!/^https:\/\//.test(src.url || "")) bad.push(`${s.name}: bad source URL ${src.url}`);
      }
    }
    for (const b of [...(s.overdose || []), ...(s.effects || [])]) {
      if (!b.sources?.length) bad.push(`${s.name}: "${b.title}" has no source`);
    }
  }
  return bad.length ? [...new Set(bad)].join("; ") : null;
});

/* ------------------------------------------------------------------ run */

console.log("\nSUBSTANCE CLASSES");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
