// Build data/combos.json - the drug combination risk matrix.
//
// Mixing is what kills people. Opioids with benzodiazepines, opioids with
// alcohol - both sides suppress breathing, and the combination is far more
// dangerous than either alone. A matrix that answers "I took X, what happens
// if I add Y" is the most directly overdose-preventing thing in this app.
//
// Source: TripSit (github.com/TripSit/drugs), 31 categories, 841 directed
// pairs, 164 of them flagged Dangerous. It is the only free structured matrix
// that covers RECREATIONAL substances - clinical interaction databases omit
// exactly the combinations that appear in overdose deaths.
//
// Fetched from the GitHub raw files, NOT the TripSit API: the API rate-limits
// at ~5 requests per minute and would take hours, while the repo is three
// files. Also fetched at BUILD time, like everything else, so the browser
// never announces to a third party which combination someone is checking.
//
// ATTRIBUTION IS A CONDITION OF USE. TripSit's stated terms require a link
// back to their factsheets and a source note on every page that displays this
// data. The UI carries both; do not remove them.
//
//   node scripts/build-combos.mjs

import { writeFileSync } from "node:fs";

const RAW = "https://raw.githubusercontent.com/TripSit/drugs/main";

const get = async (file) => {
  const res = await fetch(`${RAW}/${file}`, {
    headers: { "user-agent": "Nightlight/1.0 (public health harm reduction; +https://nightlight.help)" },
  });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
};

const [definitions, combos, drugs] = await Promise.all([
  get("combo_definitions.json"),
  get("combos.json"),
  get("drugs.json"),
]);

/* ------------------------------------------------------------- categories */

const CATEGORIES = Object.keys(combos).sort();

/* Mapping a drug to a combo category needs three passes, because TripSit's two
   files use different vocabularies: drugs.json tags things `opioid` while
   combos.json keys on `opioids`, and most combo categories are drug families
   (lsd, ketamine, nbomes) that no tag describes at all. */

// 1. tag -> category, for the three that genuinely are classes
const TAG_MAP = {
  opioid: "opioids",
  benzodiazepine: "benzodiazepines",
  ssri: "ssris",
};

// 2. exact name / alias -> category
const NAME_MAP = {
  alcohol: "alcohol", ethanol: "alcohol",
  cocaine: "cocaine", crack: "cocaine",
  ketamine: "ketamine",
  lsd: "lsd", acid: "lsd",
  mdma: "mdma",
  cannabis: "cannabis", thc: "cannabis", marijuana: "cannabis",
  dmt: "dmt",
  mescaline: "mescaline",
  "nitrous oxide": "nitrous", nitrous: "nitrous",
  caffeine: "caffeine",
  tramadol: "tramadol",
  pregabalin: "pregabalin", lyrica: "pregabalin",
  lithium: "lithium",
  mxe: "mxe", methoxetamine: "mxe",
  pcp: "pcp", phencyclidine: "pcp",
  ghb: "ghb/gbl", gbl: "ghb/gbl",
  mephedrone: "mephedrone", "4-mmc": "mephedrone",
  diphenhydramine: "diphenhydramine", benadryl: "diphenhydramine",
  dxm: "dextromethorphan", dextromethorphan: "dextromethorphan",
  amt: "amt", "a-mt": "amt",
  psilocybin: "mushrooms", psilocin: "mushrooms", mushrooms: "mushrooms",
  amphetamine: "amphetamines", methamphetamine: "amphetamines",
  adderall: "amphetamines", dextroamphetamine: "amphetamines",
  lisdexamfetamine: "amphetamines", methylphenidate: "amphetamines",
};

// 3. structural families, matched on the name
const PATTERNS = [
  // NBOMe family incl. the NBOH / NBF / NBMD variants. Worth mapping: these
  // are routinely sold as LSD and are far more dangerous than it.
  [/nbo(me|h|f|md)/i, "nbomes"],
  [/^25[a-z]{1,2}-/i, "nbomes"],
  // Lysergamides - 1P-LSD, 1cP-LSD, AL-LAD, ETH-LAD, LSZ, ALD-52 all behave
  // like LSD for interaction purposes.
  [/(^|[^a-z])lsd\b/i, "lsd"],
  [/-lad\b/i, "lsd"],
  [/^(lsz|ald-52|lsm-775)$/i, "lsd"],
  [/^2c-t-\d/i, "2c-t-x"],
  [/^2c-[bcdeiptn]/i, "2c-x"],
  [/^do[bcimet]\b/i, "dox"],
  [/^5-meo-/i, "5-meo-xxt"],
  [/^(harmaline|harmine|moclobemide|phenelzine|tranylcypromine|selegiline|syrian rue|banisteriopsis)/i, "maois"],
  [/maoi/i, "maois"],
];

function categoriesFor(key, entry) {
  const found = new Set();
  const name = (entry.pretty_name || entry.name || key).toLowerCase();
  const aliases = (entry.aliases || []).map((a) => String(a).toLowerCase());

  for (const t of entry.categories || []) {
    if (TAG_MAP[t]) found.add(TAG_MAP[t]);
  }
  for (const n of [name, key.toLowerCase(), ...aliases]) {
    if (NAME_MAP[n]) found.add(NAME_MAP[n]);
  }
  for (const [re, cat] of PATTERNS) {
    if (re.test(name) || re.test(key)) found.add(cat);
  }
  return [...found].filter((c) => combos[c]);
}

/* ------------------------------------------------------------------ build */

const drugList = [];
const uncategorised = [];

for (const [key, entry] of Object.entries(drugs)) {
  const cats = categoriesFor(key, entry);
  const name = entry.pretty_name || entry.name || key;
  if (!cats.length) uncategorised.push(name);

  drugList.push({
    id: key.toLowerCase(),
    name,
    aliases: [...new Set((entry.aliases || []).map(String))].slice(0, 10),
    cats,
  });
}
drugList.sort((a, b) => a.name.localeCompare(b.name));

/* Matrix. Thumbnails are dropped deliberately - they point at an external
   image host, which the CSP blocks and which would leak a request anyway. */
const matrix = {};
let pairs = 0;
const tally = {};

for (const [a, row] of Object.entries(combos)) {
  matrix[a] = {};
  for (const [b, v] of Object.entries(row)) {
    if (!v?.status) continue;
    matrix[a][b] = { s: v.status, ...(v.note ? { n: v.note } : {}) };
    pairs++;
    tally[v.status] = (tally[v.status] || 0) + 1;
  }
}

/* Two substances that matter enormously right now and that the matrix simply
   does not cover: xylazine is absent from TripSit's dataset entirely, and
   gabapentin exists as a drug but has no combination category. Both are
   involved in a large and growing share of overdose deaths, so leaving a blank
   would be the wrong kind of honest. These are carried separately, with their
   own sourcing, and are never presented as TripSit data. */
const SUPPLEMENT = [
  {
    id: "xylazine",
    name: "Xylazine (\"tranq\")",
    with: "opioids",
    status: "Dangerous",
    note:
      "Xylazine is a veterinary sedative, not an opioid. How often it turns up in " +
      "fentanyl depends enormously on where you are - it has been found in most " +
      "fentanyl samples in Philadelphia, around one in four or five in Los Angeles, " +
      "and far less across much of the country. It deepens and lengthens sedation, " +
      "and naloxone does NOT reverse it. Give naloxone anyway - the fentanyl " +
      "alongside it is what stops breathing, and that is what naloxone fixes. Watch " +
      "breathing rather than alertness: someone may stay drowsy after a successful " +
      "reversal. Xylazine also causes severe skin wounds at sites away from where it " +
      "was injected.",
    source: { name: "FDA — xylazine safety communication", url: "https://www.fda.gov/animal-veterinary/product-safety-information/fda-warns-about-risk-xylazine-exposure-humans" },
  },
  {
    id: "gabapentin",
    name: "Gabapentin / pregabalin",
    with: "opioids",
    status: "Dangerous",
    note:
      "Gabapentinoids taken with opioids raise the risk of fatal respiratory " +
      "depression, and the risk rises with dose. This combination is common because " +
      "gabapentin is widely prescribed and often assumed to be harmless.",
    source: { name: "FDA — gabapentinoid breathing risk", url: "https://www.fda.gov/drugs/drug-safety-and-availability/fda-warns-about-serious-breathing-problems-seizure-and-nerve-pain-medicines-gabapentin-neurontin" },
  },
];

const payload = {
  generated: new Date().toISOString(),
  supplement: SUPPLEMENT,
  attribution: {
    source: "TripSit",
    url: "https://tripsit.me/",
    factsheets: "https://tripsit.me/factsheets/",
    comboChart: "https://combo.tripsit.me/",
    note:
      "Combination risk data from TripSit. Their terms require a link back and " +
      "a source note wherever this data is displayed - both are rendered by the " +
      "UI and must not be removed.",
  },
  definitions: definitions.map((d) => ({
    status: d.status,
    color: d.color,
    definition: d.definition,
  })),
  categories: CATEGORIES,
  matrix,
  drugs: drugList,
};

writeFileSync("data/combos.json", JSON.stringify(payload));

const covered = drugList.filter((d) => d.cats.length).length;
const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);

console.log(`categories:      ${CATEGORIES.length}`);
console.log(`directed pairs:  ${pairs}`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${k.padEnd(24)} ${v}`);
}
console.log(`\ndrugs:           ${drugList.length}`);
console.log(`  mapped to a combo category: ${covered} (${((covered / drugList.length) * 100).toFixed(0)}%)`);
console.log(`  unmapped: ${uncategorised.length}`);
console.log(`\nsize: ${kb} KB`);

/* The pair that matters most - fail loudly if it ever stops being Dangerous,
   because that would mean the mapping or the upstream data broke. */
const check = matrix["opioids"]?.["benzodiazepines"];
if (check?.s !== "Dangerous") {
  console.error(`\nFAIL: opioids x benzodiazepines is "${check?.s}", expected "Dangerous"`);
  process.exit(1);
}
console.log(`\nsanity: opioids x benzodiazepines = ${check.s}`);
