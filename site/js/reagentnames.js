/* What a reagent is called, everywhere it is shown.
 *
 * data/reagents.json stores a short key per reagent — Marquis, Mecke, Morr,
 * Simons, Ehrlich — because those are identifiers: flowcharts.json references
 * them, the picker's list is built from them, and the overrides in
 * scripts/build-reagents.mjs patch rows by them. Keys are ASCII and stable, and
 * renaming them to add an apostrophe would break every one of those.
 *
 * But five of them were being PRINTED. The substance pages render the key
 * directly as the row header, so a reader met "Morr" and "Simons" where the
 * bottle in their hand says Morris and Simon's, and where this app's own
 * testing guide and DanceSafe's charts both say Morris and Simon's. Reported
 * from the live site.
 *
 * So the key stays a key and this is the label. One map, imported by every
 * screen that shows one, rather than a second copy inside whichever view
 * happened to need it first.
 *
 * NAMES ARE NOT GUESSED. Marquis, Mecke, Mandelin, Liebermann, Froehde,
 * Simon's, Ehrlich's, Scott, Hofmann and Zimmermann are printed on kit bottles
 * and on DanceSafe's charts. Morris is on the charts too, and in
 * data/testing.json. Robadope and Folin come from PsychonautWiki's own reagent
 * documentation, which is where the data comes from. Anything not on this list
 * is dropped at build time rather than shipped as an abbreviation nobody can
 * act on — see the note in scripts/build-reagents.mjs.
 */
const LABELS = {
  marquis: "Marquis",
  mecke: "Mecke",
  mandelin: "Mandelin",
  liebermann: "Liebermann",
  froehde: "Froehde",
  simons: "Simon's",
  ehrlich: "Ehrlich's",
  scott: "Scott",
  hofmann: "Hofmann",
  zimmermann: "Zimmermann",
  gallic: "Gallic",
  morr: "Morris",
  roba: "Robadope",
  foli: "Folin",
};

/**
 * The printable name for a reagent key.
 * Falls back to the key so a new upstream reagent renders as something rather
 * than as a blank, but see build-reagents.mjs — unnamed keys should not reach
 * the data in the first place.
 *
 * @param {string} key  a `reagent` value from data/reagents.json
 */
export function reagentLabel(key) {
  return LABELS[String(key || "").toLowerCase()] || key;
}

/** Every key this module can name. Used by the build to reject the rest. */
export const NAMED_REAGENTS = Object.keys(LABELS);

/* THE COLOR THE BOTTLE ALREADY IS.
 *
 * Three of these reagents are strongly coloured before they touch anything, and
 * the picker's word for that colour does not mean "the reaction was this
 * colour" — it means the reaction did not happen.
 *
 *   Morris is cobalt(II) thiocyanate. Unreacted it is the PINK octahedral
 *   aquo-cobalt(II) species; the positive result is the deep blue
 *   tetrathiocyanatocobaltate ion. 57 of its 58 rows in the table lead with
 *   pink, across substances Morris has nothing to say about at all — MDMA,
 *   heroin, oxycodone, LSD.
 *
 *   Simon's is sodium nitroprusside, which is amber. 36 of its coloured rows
 *   lead with orange, and they include creatine, gabapentin and pregabalin —
 *   none of which has a secondary amine, so none of which CAN react with it.
 *
 *   Scott is cobalt thiocyanate too, and 7 of its rows lead with pink.
 *
 * A colour that shows up on nearly every row of a reagent is describing the
 * bottle, not the drug. Scored as an ordinary reading it does damage in both
 * directions: it agrees with the forty-odd substances whose rows happen to list
 * it, putting them forward as matches on the strength of a test that did
 * nothing, and it contradicts every substance whose row does not — eliminating
 * them because a reagent failed to react, which is exactly what a spent bottle,
 * too little sample, or a sample that would not dissolve all look like.
 *
 * So it is not an observation. It is dropped from scoring, said out loud, and
 * it confirms nobody and eliminates nobody.
 *
 * VERIFIED SAFE TO DISCARD: no substance in the file has any of these as its
 * SOLE published colour for that reagent, so nothing unique is lost. A test
 * asserts that, because it is the assumption this rests on.
 */
const BLANK = {
  Simons: ["orange", "peach"],
  Morr: ["pink"],
  Scott: ["pink"],
};

/**
 * Is this reading just the unreacted reagent?
 *
 * @param {string} reagent  a reagent key
 * @param {string} reading  a colour word, or "none"
 */
export function isBlankReading(reagent, reading) {
  const b = BLANK[reagent];
  return !!b && b.includes(String(reading || "").toLowerCase());
}

/** What the bottle looks like unreacted, for the copy that explains it. */
export const blankColorsFor = (reagent) => BLANK[reagent] || null;

/** Every reagent that has a resting colour. */
export const BLANK_REAGENTS = Object.keys(BLANK);
