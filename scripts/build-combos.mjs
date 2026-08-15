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
  {
    /* Both of the entries below exist because TripSit's chart has no category
       for them at all, and both are things this app's own alert pipeline is
       built to detect - Cook County's medical examiner named medetomidine and
       N-pyrro protonitazene in its recent toxicology. A reader who arrives
       from an alert and looks the substance up should not find silence. */
    id: "medetomidine",
    name: "Medetomidine (\"rhino tranq\")",
    with: "opioids",
    status: "Dangerous",
    note:
      "Medetomidine is a veterinary sedative from the same family as xylazine " +
      "and considerably stronger. It is not an opioid, so naloxone does not " +
      "reverse it — give naloxone anyway, because the fentanyl it arrives with " +
      "is what stops breathing, and that is what naloxone fixes. In the Chicago " +
      "cluster that first defined this in May 2024, all twelve laboratory-" +
      "confirmed cases stayed altered despite naloxone, all had markedly raised " +
      "blood pressure on arrival, and three quarters had a slowed heart rate. " +
      "Sedation outlasted the naloxone and needed hospital stabilisation, with " +
      "higher odds of admission and intensive care than other overdoses that " +
      "week. Watch breathing rather than alertness, and stay with them.",
    source: {
      name: "Journal of Medical Toxicology — medetomidine-involved overdoses, Chicago 2024",
      url: "https://doi.org/10.1007/s13181-026-01148-2",
    },
  },
  {
    id: "nitazenes",
    name: "Nitazenes",
    with: "benzodiazepines",
    status: "Dangerous",
    note:
      "Nitazenes are opioids — unlike xylazine and medetomidine — so every rule " +
      "on the opioid row applies to them, and naloxone does work. They are " +
      "missing from the chart only because they are new: laboratory work puts " +
      "the pyrrolidino family's grip on the μ-opioid receptor in the same range " +
      "as fentanyl's, and some analogues considerably above it. Stacked with " +
      "benzodiazepines — or with alcohol, gabapentinoids, or another opioid — " +
      "the effect on breathing compounds the same way it does for any opioid, " +
      "from a starting point where the amount that does it is very small and " +
      "not something a person can judge by eye.",
    source: {
      name: "J Pharmacol Exp Ther — pharmacology of N-pyrrolidino nitazenes",
      url: "https://doi.org/10.1016/j.jpet.2026.104977",
    },
  },
];

/* FOOD AND DRINK THAT CHANGE A DRUG.
 *
 * This lived in data/combos.json directly, which is a file this script
 * OVERWRITES on every run — so the next build would have deleted the whole
 * section without a word. It belongs here, next to the payload it ships in,
 * the same way build-reagents.mjs keeps its overrides.
 *
 * Not from TripSit. TripSit publish drug-on-drug interactions; this is a
 * separate body of pharmacokinetic work and every item carries its own
 * citation, which is why the attribution note below does not cover it. */
const FOOD = {
  "headline": "Food and drink that change a drug",
  "blurb": "Not nutrition advice. Four things people eat and drink that alter what a dose actually does — three of them by changing how much of it reaches your blood.",
  "items": [
    {
      "t": "Grapefruit, and it is not a small effect",
      "d": "Grapefruit blocks the enzyme that clears a lot of drugs, so the same dose becomes a bigger one. In a controlled study grapefruit juice raised oxycodone exposure 1.7-fold and its peak level 1.5-fold. A man on 90 mg of methadone daily who drank about half a liter of grapefruit juice a day for three days was found unresponsive with pinpoint pupils — the first published case of that interaction going far enough to be an overdose.",
      "note": "Also pomelo and Seville orange, which work the same way. Ordinary oranges do not. The effect can last a day or more after the last glass, so skipping it “on dosing days” does not clear it.",
      "sources": [
        {
          "name": "Nieminen et al., Basic Clin Pharmacol Toxicol 2010 — grapefruit juice enhances exposure to oral oxycodone",
          "url": "https://pubmed.ncbi.nlm.nih.gov/20406214/"
        },
        {
          "name": "Opioid toxidrome following grapefruit juice consumption on methadone maintenance, J Addict Med",
          "url": "https://www.ovid.com/jnls/journaladdictionmedicine/abstract/10.1097/adm.0000000000000535~opioid-toxidrome-following-grapefruit-juice-consumption-in"
        }
      ]
    },
    {
      "t": "Aged and fermented food, if anything you take is an MAOI",
      "d": "Aged cheese, cured and fermented meat, soy sauce, miso, sauerkraut, yeast extract and some draft and craft beers carry tyramine. With an MAOI in you, tyramine is not broken down and blood pressure can spike hard and fast. This is not only prescribed antidepressants: harmala alkaloids in ayahuasca and Syrian rue are MAOIs, and so is moclobemide.",
      "note": "The chart on this page already rates MAOIs against other drugs. This is the same mechanism arriving through dinner.",
      "sources": []
    },
    {
      "t": "Alcohol and the acetaminophen hiding in your pills",
      "d": "Plenty of pressed and prescription opioid tablets are combination products — Percocet, Vicodin and their counterfeits pair the opioid with acetaminophen, called paracetamol outside the US. Taking several to get the opioid dose you want stacks the acetaminophen too, and alcohol multiplies what that does to the liver. The opioid is what stops your breathing; the acetaminophen is what quietly takes the liver, and the amount that does it is lower than most people think.",
      "note": "A pressed pill that looks like a pharmacy tablet may contain neither ingredient in the stated amount, so the arithmetic is a floor rather than a figure.",
      "sources": [
        {
          "name": "NIAAA — harmful interactions: mixing alcohol with medicines",
          "url": "https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/harmful-interactions-mixing-alcohol-with-medicines"
        }
      ]
    },
    {
      "t": "Thiamine, if you drink heavily",
      "d": "Heavy drinking blocks thiamine — vitamin B1 — from being absorbed, and running low on it causes Wernicke's encephalopathy: confusion, unsteadiness, eye movement problems. Caught early it reverses with thiamine. Left alone it can become permanent memory damage. Thiamine costs almost nothing over the counter and there is no reason to wait for symptoms to start taking it.",
      "note": "Symptoms get mistaken for being drunk, which is the reason it goes unnoticed until it does not reverse.",
      "sources": [
        {
          "name": "NHS — Wernicke's encephalopathy and thiamine",
          "url": "https://www.nhs.uk/conditions/wernickes-encephalopathy/"
        }
      ]
    },
    {
      "t": "An empty stomach is a different dose",
      "d": "Anything swallowed hits faster and harder on an empty stomach, and that is where redosing goes wrong — nothing happens for an hour, a second dose goes in, then both arrive together. Food slows and flattens the same amount. It does not reduce it.",
      "note": "This is timing, not a safety margin: eating does not make a dose smaller.",
      "sources": []
    }
  ],
  "sourceNote": "Where an item has no link, it is standard pharmacology rather than a single study, and the mechanism is stated so it can be checked."
};

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
  food: FOOD,
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
