/* One answer to "does this substance match what the reader typed".
 *
 * Two surfaces ask it: the Drugs index (and its class pages), and the sold-as
 * picker inside the reagent tracker on Test. They used to answer it
 * differently. The index matched name + aliases + searchAliases as a flat
 * list, which is right there - "tusi" has to find the page that says tusi is
 * almost never 2C-B, and that page opens on the warning. The tracker offered
 * a <select> of proper names only, so "molly" found nothing and a reader had
 * to already know that molly is MDMA to test it.
 *
 * The danger in giving the tracker the index's matcher wholesale is the
 * searchAliases. Those are the DECEPTIVE names from data/name-warnings.json -
 * names the market uses for something that is usually a different drug - and
 * data.js keeps them out of `aliases` so no page ever prints "Also called:
 * Tusi" over 2C-B. A tracker that took "tusi" and quietly loaded the 2C-B
 * chart would be asserting exactly that: it would score a pink powder, which
 * is typically a ketamine mix, against 2C-B's published colours, and a
 * matching reading would read as reassurance. So the match REPORTS HOW it
 * matched, and a caller that cannot render the name warning next to a
 * searchAlias hit must not offer the hit at all.
 *
 * Pure: no DOM, no data loading. test/reagentmatch.test.mjs covers the
 * tracker's scoring; this file's contract is small enough to be covered by
 * the views test rendering both surfaces against the real bundle. */

const lc = (x) => String(x || "").toLowerCase();

/**
 * Match one substance record against a typed term.
 *
 * Returns null, or { via } where via is "name", "alias" or "searchAlias" -
 * the strongest way it matched, in that order. `term` is expected lowercased
 * and trimmed by the caller (both callers already do), but is lowercased
 * again here because a stray capital would otherwise silently match nothing.
 */
export function matchSubstance(s, term) {
  const t = lc(term).trim();
  if (!t || !s) return null;
  if (lc(s.name).includes(t)) return { via: "name" };
  if ((s.aliases || []).some((a) => lc(a).includes(t))) return { via: "alias" };
  if ((s.searchAliases || []).some((a) => lc(a).includes(t))) return { via: "searchAlias" };
  return null;
}

/**
 * Every record a term matches, each tagged with how. Name hits first, then
 * alias hits, then searchAlias hits, each band in the order the records were
 * given - so a list built from this reads "the thing you typed" before "a
 * thing also called that" before "a thing sold under that name".
 *
 * `includeSearchAliases` defaults to true, which is the index's behaviour.
 * The tracker passes it too, and then renders the warning beside every
 * searchAlias hit - see the note at the top of this file for why it may not
 * pass it and then drop the warning.
 */
export function findSubstances(list, term, { includeSearchAliases = true } = {}) {
  const bands = { name: [], alias: [], searchAlias: [] };
  for (const s of list || []) {
    const m = matchSubstance(s, term);
    if (!m) continue;
    if (m.via === "searchAlias" && !includeSearchAliases) continue;
    bands[m.via].push({ s, via: m.via });
  }
  return [...bands.name, ...bands.alias, ...bands.searchAlias];
}

/**
 * A stand-in record for a reagent-table id that has no substance page.
 *
 * The colour table carries a handful of ids straight from PsychonautWiki -
 * cathinone, coca, DOx, phentermine, 4-BMC - that were never given a page, so
 * they have no record to match against and a picker built on records alone
 * could not reach them even though the table can score them. This gives each
 * one the minimum a matcher needs: an id, a display name, and an empty alias
 * list. Nothing invented beyond the name, and the name is the id in the case
 * it would otherwise print: title-cased, except where that gets it wrong.
 */
const DISPLAY = { dox: "DOx", "4-bmc": "4-BMC" };
const titleCase = (id) =>
  String(id).replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());

export function synthesize(id) {
  return { id, name: DISPLAY[id] || titleCase(id), aliases: [], synthesized: true };
}

/** The display name for an id, from a record if there is one. */
export function displayName(id, list) {
  return (list || []).find((x) => x.id === id)?.name || synthesize(id).name;
}
