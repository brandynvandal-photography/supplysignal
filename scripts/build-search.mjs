/* Search index.
 *
 * Everything about this is shaped by one constraint: a search query is the
 * single most revealing thing a reader could send anywhere. "fentanyl",
 * "am i going to fail my drug test", "free naloxone" — each is a sentence
 * about somebody's life. So there is no search endpoint and never will be.
 * The index ships in the bundle, the matching runs on the device, and nothing
 * about what anyone typed exists outside their phone.
 *
 * That decision sets the budget. A full-text index over every paragraph in
 * data/ would be enormous and would mostly return prose fragments nobody can
 * act on. This indexes DESTINATIONS instead: headings, section titles, item
 * titles, drug names and aliases — the things that are somewhere to go.
 *
 *   node scripts/build-search.mjs
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");

/* Which file feeds which route, and how deep to walk it. Anything not listed
   is deliberately not indexed - the generated bundles (alerts, mortality) are
   per-county numbers rather than destinations. */
const PAGES = [
  { file: "testing.json",    route: "#/test",        kind: "Test" },
  { file: "education.json",  route: "#/learn",       kind: "Learn" },
  { file: "consent.json",    route: "#/learn",       kind: "Learn" },
  { file: "sitting.json",    route: "#/learn",       kind: "Learn" },
  { file: "practice.json",   route: "#/learn",       kind: "Learn" },
  { file: "support.json",    route: "#/support",     kind: "Support" },
  { file: "communities.json",route: "#/support",     kind: "Support" },
  { file: "after.json",      route: "#/after",       kind: "After an overdose" },
  { file: "policy.json",     route: "#/policy",      kind: "Policy" },
  { file: "supervision.json",route: "#/supervision", kind: "Testing & supervision" },
  { file: "sex.json",        route: "#/sex",         kind: "Sex and being out" },
  { file: "stimulants.json", route: "#/stimulants",  kind: "Staying up" },
  { file: "heat.json",       route: "#/heat",        kind: "Heat and water" },
  { file: "market.json",     route: "#/substances",  kind: "Drugs" },
  { file: "conditions.json", route: "#/substances",  kind: "Drugs" },
  { file: "rx.json",         route: "#/substances",  kind: "Drugs" },
];

/* Keys whose STRING values are titles worth landing on. Body prose is not
   indexed: it makes the file large and returns fragments rather than places. */
const TITLE_KEYS = new Set(["headline", "title", "t", "name", "label", "drug"]);

const entries = [];
const seen = new Set();

function add(label, route, kind, anchor) {
  const text = String(label || "").trim();
  if (text.length < 3 || text.length > 90) return;
  const key = `${text.toLowerCase()}|${route}`;
  if (seen.has(key)) return;
  seen.add(key);
  entries.push(anchor ? { t: text, r: route, k: kind, a: anchor } : { t: text, r: route, k: kind });
}

/* Section ids are derivable for the pages that follow the sec-<key> pattern,
   which is most of them. Where they are not, the chip still lands on the page. */
function anchorFor(file, topKey) {
  if (!topKey) return null;
  const map = {
    "supervision.json": ["rights","panels","windows","misreads","cannabis","medication","violations","reentry","hair"],
    "sex.json": ["framing","spiking","barriers","prep","ec","interactions","out"],
    "stimulants.json": ["sleep","hallucination","interaction","psychosis","helping","calling","coming"],
    "heat.json": ["spot","hot","water","cool","prevent","risk"],
    "policy.json": ["calling","law","money","voice","orgs"],
    /* The strip picker's own heading (sec-brands, an h3 the view renders above
       it) and the brand names under it - both live under testing.json's
       `brands` key, so "Which strip do you have?" and "BTNX" resolve to the
       picker rather than the top of the Test page. Only `brands` is mapped:
       every other testing section either has no stable per-topic id or is
       reached fine from the page top. */
    "testing.json": ["brands"],
  };
  return (map[file] || []).includes(topKey) ? `sec-${topKey}` : null;
}

function walk(node, page, topKey, depth = 0) {
  if (depth > 6 || node == null) return;
  if (Array.isArray(node)) {
    for (const v of node) walk(v, page, topKey, depth + 1);
    return;
  }
  if (typeof node !== "object") return;

  for (const [k, v] of Object.entries(node)) {
    /* Citations are not destinations. A `sources` array is full of `name`
       fields - "FDA — first OTC naloxone approval" - which match TITLE_KEYS
       and would otherwise fill a search for "naloxone" with references
       instead of places to go. Same for the attribution blocks. */
    /* MATCHED BY SHAPE, not by a list of three names. The list missed
       `amountsSource` - the citation for a strip's dilution amounts - so
       "DanceSafe fentanyl test strip instructions, read 2026-08-19" was
       indexed as a place to go, and views.test.mjs caught it landing nowhere
       the moment the index was rebuilt. Any key ending in "source" holds a
       citation, whatever it is called. */
    if (k === "attribution" || /sources?$/i.test(k)) continue;
    /* NOT DESTINATIONS EITHER, found by the test that tries to land every
       result. Quiz `options` are answers - including the WRONG ones, so "Skip
       naloxone if you think it is xylazine" was a standalone search result
       pointing at nothing. Quiz `steps` are prompts. `tiers` are the mail-
       program status labels, `conditions` the lens chips, `locators`/`labs`/
       `options` under labs are link-button labels, `approaches` the therapy
       names in a card list. None renders as a heading the resolver can reach.
       Indexing them sent a reader to the right page and left them at the
       top with nothing to find. */
    if (["options", "steps", "tiers", "conditions", "locators", "approaches", "scripts", "cards",
         "close",   // practice's closing callout renders only after the quiz is finished
         "scope",   // market's "What you won't find here" is a <strong> lead-in inside a paragraph
        ].includes(k)) continue;
    /* LINK CLUSTERS ARE DESTINATIONS ONLY WITH AN ANCHOR. "Find a program near
       you" and the lab names are link buttons under a section, not headings
       the resolver can match - but a reader typing "program" must still
       reach Test (search.test holds that). So rather than drop them, every
       name under testing.json's buying `links` and labs `options` carries the
       id of the disclosure that renders it, and the reader lands on that
       section, open. The same move A17 made for strip brands. */
    if (page.file === "testing.json" && (k === "links" || (k === "options" && topKey === "labs"))) {
      const anchor = topKey === "labs" ? "sec-labs" : "sec-buying";
      for (const item of (Array.isArray(v) ? v : [])) if (item && item.name) add(item.name, page.route, page.kind, anchor);
      continue;
    }
    if (typeof v === "string" && TITLE_KEYS.has(k)) {
      add(v, page.route, page.kind, anchorFor(page.file, topKey));
    } else if (typeof v === "object") {
      walk(v, page, depth === 0 ? k : topKey, depth + 1);
    }
  }
}

for (const page of PAGES) {
  let doc;
  try {
    doc = JSON.parse(await readFile(path.join(DATA, page.file), "utf8"));
  } catch {
    continue;                       // a dataset not generated yet is not fatal
  }
  walk(doc, page, null);
}

/* Substances, with their aliases. This is the largest single contributor and
   the one people use most - somebody arriving with a name in their head. */
const subs = JSON.parse(await readFile(path.join(DATA, "substances.json"), "utf8"));
let extra = { substances: [] };
try { extra = JSON.parse(await readFile(path.join(DATA, "adulterants.json"), "utf8")); } catch {}

const drugs = [];
for (const s of [...(subs.substances || []), ...(extra.substances || [])]) {
  if (!s?.id || !s?.name) continue;
  drugs.push({
    i: s.id,
    n: s.name,
    /* Aliases are how this audience actually names things. Capped so one drug
       with forty street names cannot dominate the file. */
    a: (s.aliases || []).slice(0, 12),
  });
}

const out = {
  note: "Built by scripts/build-search.mjs. Matching runs on the device; no query leaves it.",
  generated: new Date().toISOString().slice(0, 10),
  entries,
  drugs,
};

const json = JSON.stringify(out);
await writeFile(path.join(DATA, "search.json"), json + "\n");
console.log(`search.json: ${entries.length} destinations, ${drugs.length} drugs, ${(json.length / 1024).toFixed(1)}KB`);
