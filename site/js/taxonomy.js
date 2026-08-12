/* Browsing substances by class.
 *
 * A flat list of 298 names is not a reference, it is a phone book. Nobody
 * arrives knowing that the thing they took is called "4-HO-MET". They arrive
 * knowing roughly what kind of thing it was, so that is the way in.
 *
 * The bundled class data cannot be used raw. It comes from a community wiki
 * and carries the inconsistencies you would expect:
 *
 *   - Singular and plural mixed ("Depressant" vs "Opioids").
 *   - "Hallucinogens" is not a usable category. Its members are Zolpidem,
 *     Zopiclone, Eszopiclone, Gaboxadol, PMA and Salvinorin A - z-drugs that
 *     can cause hallucinations, filed beside salvia. Browsing it would put
 *     Ambien next to a psychedelic. Every member except Salvinorin A already
 *     carries a truthful class, so the label is dropped and Salvinorin A is
 *     placed by hand.
 *   - Ten entries are CLASS pages, not drugs ("Opioids", "Benzodiazepines",
 *     "MAOI"...). They exist so the combination checker has something to point
 *     at. Listing "Opioids" inside the opioids class is circular, so they are
 *     excluded from browsing and remain findable by search.
 *   - Five real drugs carry no psychoactive class at all and are placed here.
 *
 * ORDER IS DELIBERATE and is not alphabetical, not by size, and not a danger
 * ranking. It is ordered by how often the class is involved in a fatal
 * overdose, because this app exists to reduce those. Opioids and depressants
 * lead despite psychedelics being the largest class by count. The cards carry
 * no severity colour, so that the sequence reads as "what this app is most
 * often needed for" rather than as a league table of harm.
 */

/** Entries that are categories rather than drugs. Searchable, not browsable. */
export const GROUP_ENTRIES = new Set([
  "Opioids", "Benzodiazepines", "Psychedelic", "MAOI", "RIMA",
  "Synthetic cannabinoid", "2C-x", "25x-NBOMe", "25x-NBOH", "Inhalants",
]);

/* Drugs the source file leaves unclassified. Each of these is a judgement, so
   each gets a reason.

   Kava and Bromazepam matter most: both are CNS depressants, and a depressant
   that is not filed as one is invisible exactly where it is most dangerous -
   stacked with opioids or alcohol. Bromazepam is a benzodiazepine outright. */
const MANUAL = {
  "Cannabis": ["cannabinoids"],           // chemical class only in the source
  "Bromazepam": ["depressants"],          // a benzodiazepine; source lists none
  "Kava": ["depressants"],                // GABAergic; potentiates alcohol
  "Blue Lotus": ["depressants"],          // mildly sedating (nuciferine)
  "Changa": ["psychedelics"],             // smokable DMT with a MAOI herb
  "Salvinorin A": ["dissociatives"],      // rescued from "Hallucinogens"

  /* Adulterants (data/adulterants.json). Classed by what they DO to a body,
     because that is what governs the overdose response:

     Xylazine and medetomidine are alpha-2 agonists, not opioids - naloxone
     does not reverse either. They sit under depressants because that is where
     someone checking what a sedative stacks with will look, and because the
     thing that kills is the combined respiratory depression.

     Nitazenes ARE opioids, so naloxone does work, and they must appear in the
     opioid list beside fentanyl rather than in some separate box.

     BTMPS is an industrial plastic stabiliser with no psychoactive class at
     all. It gets "other" so it stays reachable rather than becoming an orphan
     the browse tree cannot show. */
  "Xylazine": ["depressants"],
  "Medetomidine": ["depressants"],
  "Nitazenes": ["opioids"],
  "BTMPS": ["other"],
};

/* Source label -> browse class. A label missing here is deliberately dropped. */
const MAP = {
  "Opioids": "opioids",
  "Depressant": "depressants",
  "Hypnotic": "depressants",        // z-drugs stack with opioids; belongs here
  "Stimulants": "stimulants",
  "Eugeroics": "stimulants",        // modafinil: not a classical stimulant, but
                                    // it is where someone would look for it
  "Psychedelic": "psychedelics",
  "Dissociatives": "dissociatives",
  "Entactogen": "empathogens",
  "Cannabinoid": "cannabinoids",
  "Deliriant": "deliriants",
  "Nootropic": "nootropics",
  "Antipsychotic": "other",
  "Antidepressants": "other",
  "Oneirogen": "other",
  // "Hallucinogens" intentionally absent - see the header.
};

/** Ordered, with plain-language examples rather than definitions. */
export const CLASSES = [
  { slug: "opioids", label: "Opioids",
    hint: "Fentanyl, heroin, oxycodone, methadone" },
  { slug: "depressants", label: "Depressants",
    hint: "Alcohol, benzodiazepines, GHB, sleep medication" },
  { slug: "stimulants", label: "Stimulants",
    hint: "Cocaine, methamphetamine, Adderall, caffeine" },
  { slug: "empathogens", label: "Empathogens",
    hint: "MDMA and related" },
  { slug: "psychedelics", label: "Psychedelics",
    hint: "LSD, psilocybin, DMT, mescaline" },
  { slug: "dissociatives", label: "Dissociatives",
    hint: "Ketamine, DXM, nitrous oxide, PCP" },
  { slug: "cannabinoids", label: "Cannabinoids",
    hint: "Cannabis, THC, synthetic cannabinoids" },
  { slug: "deliriants", label: "Deliriants",
    hint: "Diphenhydramine, datura, scopolamine" },
  { slug: "nootropics", label: "Nootropics",
    hint: "Racetams and other cognition drugs" },
  { slug: "other", label: "Other medications",
    hint: "Antipsychotics, antidepressants, and less common groups" },
];

const BY_SLUG = new Map(CLASSES.map((c) => [c.slug, c]));
export const isClass = (slug) => BY_SLUG.has(slug);
export const classInfo = (slug) => BY_SLUG.get(slug) || null;

/** Every browse class a substance belongs to. Multi-class drugs return several,
 *  which is correct - MDMA really is both an empathogen and a stimulant. */
export function classesOf(s) {
  if (GROUP_ENTRIES.has(s.name)) return [];
  if (MANUAL[s.name]) return MANUAL[s.name];

  const out = [];
  for (const label of s.class?.psychoactive || []) {
    const slug = MAP[label];
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/**
 * Group the whole file into browse classes.
 * Returns `{ groups: Map<slug, substance[]>, unplaced: substance[] }`.
 *
 * `unplaced` is returned rather than swallowed. A drug that belongs to no class
 * is unreachable by browsing, which is a real defect - so the caller can show
 * it, and a test can assert it stays empty.
 */
export function groupAll(substances) {
  const groups = new Map(CLASSES.map((c) => [c.slug, []]));
  const unplaced = [];

  for (const s of substances) {
    if (GROUP_ENTRIES.has(s.name)) continue;
    const slugs = classesOf(s);
    if (!slugs.length) { unplaced.push(s); continue; }
    for (const slug of slugs) groups.get(slug)?.push(s);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return { groups, unplaced };
}
