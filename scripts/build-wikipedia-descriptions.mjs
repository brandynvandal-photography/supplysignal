// Draft plain-language descriptions from Wikipedia, verified against PubChem.
//
//   node scripts/build-wikipedia-descriptions.mjs            # write drafts
//   node scripts/build-wikipedia-descriptions.mjs --dry      # report only
//
// WHAT THIS IS FOR. 174 of 298 substances have no description, and the page
// says so rather than guessing. They are research chemicals with nothing
// plain-language published anywhere the first two passes could check, and
// writing one from memory is exactly how a confident sentence about an
// unfamiliar drug ends up wrong.
//
// WIKIPEDIA IS A FINDING AID, NOT A CITATION, and that distinction is the whole
// design of this script. It does not trust the article. It takes only the class
// of claim an article's lead makes about a compound's IDENTITY — what family it
// belongs to, what it is an analogue of, when it appeared — and then confirms
// that claim is about the right molecule by joining it to PubChem, which is a
// primary source, is already the app's structure source, and is already cited
// on every substance page.
//
// The join is: the app holds a PubChem CID for the substance (from
// data/structures.json). PubChem returns that CID's synonym list. The Wikipedia
// article's title has to appear in it. If it does not, the article is about
// something else — a different salt, a brand name, a disambiguation page, or a
// town in Ohio — and the substance is left without a description. That is not a
// formality: "MDA" is a drug, a US federal agency, and a file format, and a
// summary API that follows redirects will hand back whichever Wikipedia thinks
// is primary.
//
// WHAT IT WILL NOT TAKE:
//   - Effects. An article's account of what a drug FEELS like is the least
//     sourced part of it and the most dangerous to get wrong. Only the identity
//     sentences are kept; if that leaves nothing, the substance is skipped and
//     the page keeps saying nobody has published a description.
//   - Dose, route, or duration. Those have their own section with their own
//     caveats and their own source.
//   - Anything from a disambiguation page or an article with no PubChem match.
//
// Everything it writes is a DRAFT, into a separate file, for a person to read
// before it reaches readers. It never edits data/descriptions.json.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DRY = process.argv.includes("--dry");
const UA = "Nightlight/1.0 (public health harm reduction; +https://nightlight.help)";
const OUT = "data/descriptions.wikipedia.json";

const { substances } = JSON.parse(readFileSync("data/substances.json", "utf8"));
const { structures } = JSON.parse(readFileSync("data/structures.json", "utf8"));
const existing = JSON.parse(readFileSync("data/descriptions.json", "utf8")).descriptions;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const get = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) return null;
  return res.json();
};

/* US English, because test/copy.test.mjs will reject the file otherwise and it
   is right to. Wikipedia is written in British English about half the time —
   "synthesised", "colour", "analogue" — and these are OUR words once they are
   in the app's voice. Ordered longest-first so "analogues" is not left as
   "analogs" + "ues". */
const US = [
  [/\bsynthesised\b/g, "synthesized"], [/\bsynthesise\b/g, "synthesize"],
  [/\bcharacterised\b/g, "characterized"], [/\brecognised\b/g, "recognized"],
  [/\banalogues\b/g, "analogs"], [/\banalogue\b/g, "analog"],
  [/\bcolours\b/g, "colors"], [/\bcolour\b/g, "color"],
  [/\bmetabolised\b/g, "metabolized"], [/\bmetabolise\b/g, "metabolize"],
  [/\butilised\b/g, "utilized"], [/\bcatalogued\b/g, "cataloged"],
  [/\blabelled\b/g, "labeled"], [/\bmodelling\b/g, "modeling"],
  [/\bprogramme\b/g, "program"], [/\bpractise\b/g, "practice"],
  [/\bfavour\b/g, "favor"], [/\bbehaviour\b/g, "behavior"],
  [/\banaesthetic\b/g, "anesthetic"], [/\banaesthesia\b/g, "anesthesia"],
  [/\bdefence\b/g, "defense"], [/\blicence\b/g, "license"],
  [/\bcentre\b/g, "center"], [/\bfibre\b/g, "fiber"],
  [/\bhaemorrhage\b/g, "hemorrhage"], [/\boedema\b/g, "edema"],
  [/\bfoetal\b/g, "fetal"], [/\bparacetamol\b/g, "acetaminophen"],
  [/\bnoradrenaline\b/g, "norepinephrine"], [/\borganis(e|ed|ing)\b/g, "organiz$1"],
  /* Added after the copy guard caught "grey market" in a flubromazepam draft.
     The guard scans data/*.json, so it holds these drafts to the same standard
     as shipped copy even before any of them is merged - which is the reason to
     write drafts into data/ rather than somewhere it cannot see. */
  [/\bgrey\b/g, "gray"], [/\bgreyish\b/g, "grayish"],
  [/\bsulphur/g, "sulfur"], [/\baluminium\b/g, "aluminum"],
  [/\bstorey\b/g, "story"], [/\btyres?\b/g, "tires"],
];
const americanize = (s) => US.reduce((acc, [re, to]) => acc.replace(re, to), s);

/* An IDENTITY sentence says what the compound is. An effects sentence says what
   it does to a person. Only the first kind is kept, and the test is positive
   rather than negative — a sentence has to look like taxonomy to survive, which
   fails closed on anything this pattern has not seen before. */
const IDENTITY = /\b(is|are|was|were)\s+(a|an|the)?\s*[^.]*\b(drug|compound|chemical|substance|analog|derivative|family|class|stimulant|depressant|psychedelic|dissociative|opioid|opiate|benzodiazepine|cannabinoid|barbiturate|amphetamine|phenethylamine|tryptamine|cathinone|arylcyclohexylamine|lysergamide|nootropic|supplement|medication|anesthetic|sedative|hypnotic|antidepressant|antipsychotic|solvent|alkaloid)\b/i;

/* Sentences that are about a person's experience, a legal schedule, or a
   market. Dropped even when they sit inside an otherwise-identity sentence's
   paragraph. */
const NOT_IDENTITY = /\b(effects?|euphori|hallucinat|trip|high|dose|dosage|users? (report|describe)|onset|duration|overdose|toxic|lethal|death|fatal|schedule [IVX]|controlled substance act|banned|illegal|street price)\b/i;

function identityFrom(extract) {
  /* Split on sentence ends that are not inside a number or an abbreviation. */
  const sentences = String(extract)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const kept = [];
  for (const s of sentences) {
    if (NOT_IDENTITY.test(s)) continue;
    if (!IDENTITY.test(s) && kept.length === 0) continue;
    /* Once the first identity sentence is in, a following sentence may join it
       if it is also clean — that is usually the "it is the X analog of Y" or
       "first sold as a designer drug in 20xx" line, which is the useful half. */
    if (kept.length && !IDENTITY.test(s) && !/\b(first|sold|marketed|reported|identified|appeared|developed|patented|derived|related)\b/i.test(s)) continue;
    kept.push(s);
    if (kept.length === 2) break;
  }
  return kept.join(" ");
}

const targets = substances.filter((s) => !existing[s.id]);
console.log(`${targets.length} substances without a description\n`);

const drafts = {};
const skipped = { noCid: [], noArticle: [], noPubChemMatch: [], disambig: [], noIdentity: [], tooShort: [] };
let done = 0;

for (const sub of targets) {
  done++;
  if (done % 25 === 0) console.error(`  ...${done}/${targets.length}`);

  const cid = structures[sub.id]?.cid;
  if (!cid) { skipped.noCid.push(sub.id); continue; }

  /* Try the display name first, then each alias. The REST summary endpoint
     follows redirects, so "Cimbi-5" lands on 25I-NBOMe — which is exactly why
     the PubChem check below is not optional. */
  const tries = [sub.name, ...(sub.aliases || [])].filter(Boolean).slice(0, 4);
  let page = null;
  for (const t of tries) {
    page = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`);
    await sleep(120);
    if (page && page.type !== "disambiguation" && page.extract) break;
    page = null;
  }
  if (!page) { skipped.noArticle.push(sub.id); continue; }
  if (page.type === "disambiguation") { skipped.disambig.push(sub.id); continue; }

  const syn = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/synonyms/JSON`);
  await sleep(120);
  const names = syn?.InformationList?.Information?.[0]?.Synonym || [];
  /* THE JOIN. The article's own title has to be one of PubChem's names for the
     molecule the app is showing a structure of. Nothing else counts — not the
     substance's name matching, not a fuzzy score. */
  if (!names.some((n) => norm(n) === norm(page.title))) {
    skipped.noPubChemMatch.push(`${sub.id} (wiki "${page.title}" not a PubChem synonym of CID ${cid})`);
    continue;
  }

  const identity = americanize(identityFrom(page.extract));
  if (!identity) { skipped.noIdentity.push(sub.id); continue; }
  if (identity.length < 40) { skipped.tooShort.push(sub.id); continue; }

  drafts[sub.id] = {
    text: identity,
    verified: { pubchemCid: cid, wikipediaTitle: page.title, wikipediaRevision: page.revision || null },
  };
}

console.log(`\ndrafted: ${Object.keys(drafts).length}`);
for (const [k, v] of Object.entries(skipped)) {
  console.log(`  skipped ${k}: ${v.length}`);
}
console.log("\nsample:");
for (const [id, d] of Object.entries(drafts).slice(0, 8)) {
  console.log(`  ${id}\n     ${d.text.slice(0, 150)}`);
}

if (DRY) { console.log("\n--dry: nothing written"); process.exit(0); }

writeFileSync(OUT, JSON.stringify({
  note: "DRAFTS, not published copy. Written by scripts/build-wikipedia-descriptions.mjs. Each entry's identity claim was taken from an English Wikipedia lead and then confirmed to be about the right molecule by checking the article's title against PubChem's synonym list for the CID the app already holds a structure for. Effects, dose and legal status are stripped: the identity is what Wikipedia's lead sources well and PubChem can corroborate, and the rest is neither. Read these before merging any of them into data/descriptions.json.",
  generated: new Date().toISOString().slice(0, 10),
  source: {
    text: { name: "English Wikipedia", url: "https://en.wikipedia.org/", license: "CC BY-SA 4.0" },
    verification: { name: "PubChem, US National Library of Medicine", url: "https://pubchem.ncbi.nlm.nih.gov/", license: "Public domain (US Government)" },
  },
  skipped,
  drafts,
}, null, 1) + "\n");
console.log(`\nwrote ${OUT}`);
