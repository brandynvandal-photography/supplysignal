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
