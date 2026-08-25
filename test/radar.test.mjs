/**
 * The NIST RaDAR adapter, against the real pages it has to read.
 *
 * Fixtures are unmodified captures: the program page's newsletter archive, and
 * the February and April 2026 issues. Both issues are here on purpose - each
 * carries a different trap, and one of them shipped a wrong answer before the
 * fixture existed.
 *
 * Run: node test/radar.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { flatten, issuesFrom, parseIssue, parseTotals } from "../src/sources/radar.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const INDEX = read("radar-index.html");
const FEB = flatten(read("radar-2026-02.html"));
const APR = flatten(read("radar-2026-04.html"));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

console.log("NIST RaDAR");

/* ------------------------------------------------------------- discovery */

t("the program page yields the newsletter archive", () => {
  const got = issuesFrom(INDEX);
  assert.ok(got.length >= 24, `only ${got.length} issues found`);
  assert.ok(got.every((i) => /bulletins\/[0-9a-f]+$/.test(i.url)));
});

t("issues come back newest first, whatever order the page lists them", () => {
  const got = issuesFrom(INDEX);
  for (let i = 1; i < got.length; i++) {
    const a = got[i - 1], b = got[i];
    assert.ok(a.year > b.year || (a.year === b.year && a.month > b.month),
      `${a.label} came before ${b.label}`);
  }
});

t("every issue carries a real month and year", () => {
  for (const i of issuesFrom(INDEX)) {
    assert.ok(i.month >= 1 && i.month <= 12, `${i.label} -> month ${i.month}`);
    assert.ok(i.year >= 2024 && i.year <= 2100, `${i.label} -> year ${i.year}`);
  }
});

/* Anything on that page that is not a dated newsletter link - and there are 29
   govdelivery links against 27 issues - must not be mistaken for one. */
t("non-newsletter links on the same page are ignored", () => {
  const got = issuesFrom(INDEX);
  assert.ok(got.every((i) => /^[A-Z][a-z]+ \d{4}$/.test(i.label)), "a non-dated label got through");
});

/* --------------------------------------------------------------- parsing */

/* THE TRAP THAT SHIPPED A WRONG ANSWER FIRST TIME. Chemical nomenclature
   italicises its locants, so <i>N,N</i> sits in the middle of the name. A
   flatten that breaks on every tag returns a compound called "4-Methyl-". */
t("a compound name split by italic markup is reassembled", () => {
  const got = parseIssue(APR, { month: 4, year: 2026 });
  assert.equal(got.length, 1, `expected 1 compound, got ${got.length}`);
  assert.equal(got[0].name, "4-Methyl-N,N-dimethylcathinone (4-MDMC)");
  assert.ok(!got[0].name.endsWith("-"), "name was truncated at the italic tag");
});

t("February's seven compounds all parse, with their coast", () => {
  const got = parseIssue(FEB, { month: 2, year: 2026 });
  assert.equal(got.length, 7, `expected 7, got ${got.length}`);
  const byName = Object.fromEntries(got.map((c) => [c.name, c]));
  assert.equal(byName["SR-17018"].coast, "west");
  assert.equal(byName["Yangonin"].coast, "east");
  assert.ok(got.every((c) => c.month === 2 && c.year === 2026));
});

/* The class field is provenance, not taxonomy. RaDAR calls citalopram a
   benzodiazepine and it is an SSRI; the adapter must reproduce what they
   printed without the app ever treating it as a class it can use. */
t("the printed class is carried verbatim, wrong or not", () => {
  const got = parseIssue(FEB, { month: 2, year: 2026 });
  const cit = got.find((c) => c.name === "Citalopram");
  assert.ok(cit, "citalopram entry missing");
  assert.equal(cit.printedClass, "benzodiazepine");
});

/* One entry's "class" is a whole descriptive phrase, so nothing downstream may
   assume this field is a single taxonomy term. */
t("a class that is really a phrase survives intact", () => {
  const got = parseIssue(FEB, { month: 2, year: 2026 });
  const y = got.find((c) => c.name === "Yangonin");
  assert.match(y.printedClass, /kava/);
});

t("section scaffolding is not read as a compound", () => {
  const got = parseIssue(FEB, { month: 2, year: 2026 });
  assert.ok(got.every((c) => !/^(Important|Determination|Compounds discussed)/i.test(c.name)),
    `scaffolding parsed as a compound: ${got.map((c) => c.name).join(", ")}`);
});

/* The section is bounded, so prose from later sections cannot leak in. */
t("parsing stops at the next section", () => {
  const got = parseIssue(FEB, { month: 2, year: 2026 });
  assert.ok(got.every((c) => !/quantitation|breakdown|publication/i.test(c.name)));
});

t("an issue with no such section yields nothing rather than guessing", () => {
  assert.deepEqual(parseIssue("Some other bulletin entirely.", { month: 1, year: 2026 }), []);
});

/* ---------------------------------------------------------------- totals */

t("sample totals parse, even though the prevalence tables are images", () => {
  assert.deepEqual(parseTotals(FEB), { west: 393, east: 534, all: 927 });
  assert.deepEqual(parseTotals(APR), { west: 555, east: 669, all: 1224 });
});

t("totals are absent rather than zero when the line is missing", () => {
  assert.equal(parseTotals("no totals here"), null);
});

/* ------------------------------------------------------------- geography */

/* The whole reason this source needs a tier of its own. If a coast ever
   resolved to a state or a county, it would be inventing precision. */
t("nothing in a parsed compound looks like a county or a state", () => {
  for (const c of [...parseIssue(FEB, { month: 2, year: 2026 }), ...parseIssue(APR, { month: 4, year: 2026 })]) {
    assert.ok(["west", "east", null].includes(c.coast), `coast was ${c.coast}`);
  }
});

/* ------------------------------------------------------- fixture hygiene */

/* CAPTURED PAGES CARRY OTHER PEOPLE'S SECRETS. The first version of the index
   fixture was the whole 97KB program page, which embeds NIST's own Mapbox
   access token in its map config - GitHub push protection refused the push,
   correctly. It is reduced to the anchors the test actually reads. This guard
   exists because the next captured fixture will be someone else's page too,
   and a link-extraction test never needs a whole document. */
t("no fixture carries anything shaped like a credential", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  const patterns = [
    [/\b(?:sk|pk)\.[A-Za-z0-9_-]{20,}/, "Mapbox-style token"],
    [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
    [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, "GitHub token"],
    [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, "private key"],
  ];
  const hits = [];
  for (const f of readdirSync(dir)) {
    const body = readFileSync(new URL(f, dir), "utf8");
    for (const [re, what] of patterns) if (re.test(body)) hits.push(`${f}: ${what}`);
  }
  assert.deepEqual(hits, [], `secrets in fixtures: ${hits.join(", ")}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
