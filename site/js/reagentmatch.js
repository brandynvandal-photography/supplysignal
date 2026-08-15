/* What could this be, given the colours you got?
 *
 * The reagent pages run one way: pick a reagent, see what it turns for each
 * drug. This runs the other way — you ran two or three reagents, you have some
 * colours, and you want to know what that is consistent with.
 *
 * THE RULE THAT MAKES THIS SAFE, and it is the whole design:
 *
 *   A substance with no published result for a reagent is NEVER eliminated by
 *   that reagent.
 *
 * data/reagents.json distinguishes two things that look identical in most
 * reagent charts: `none: true`, meaning somebody tested it and it did not
 * react, and simple absence, meaning nobody published a result. There are 660
 * documented no-reactions in the file and a great many more gaps. If absence
 * were read as "no reaction", every gap would become a false elimination — and
 * a false elimination here removes the drug the person is actually holding from
 * a list they are using to decide what to do. That is the one failure this
 * cannot have, so unknown never counts against a candidate. It is recorded and
 * shown, and it lowers confidence rather than the substance's chances.
 *
 * WHAT A MATCH IS AND IS NOT. "Consistent with" — never "it is". Three reasons,
 * all of which the UI has to say out loud:
 *
 *   - A reagent reads the STRONGEST reactant present, so a mixture shows the
 *     colour of whatever dominates and hides the rest. Most street samples are
 *     mixtures.
 *   - Fentanyl at a dose that kills is far below what any reagent shows. No
 *     colour on this screen rules it out, and no combination of them does.
 *   - Colour is perceptual, reagent age and light change it, and SOURCES
 *     GENUINELY DISAGREE about faint reactions. The table behind this page is
 *     PsychonautWiki, which records cocaine as no reaction on Marquis and MDA
 *     as no reaction on Simon's; DanceSafe's 2023 chart records a light pink
 *     or peach Marquis for cocaine and a dark grey-green Simon's for MDA. A
 *     faint reaction is precisely what one chart calls a colour and another
 *     calls nothing.
 *
 * Because of that last point a disagreement is REPORTED, never dropped, and
 * the UI does not call the second list "ruled out". The reader sees which
 * observation conflicts and what was published, and decides for themselves
 * whether they read the colour the way the source did.
 */

/** One observation contradicts a documented result. */
const DISAGREE = "disagrees";
/** One observation matches a documented result. */
const AGREE = "agrees";
/** Nobody published a result for this pair. Never counts against. */
const UNKNOWN = "unknown";

/**
 * Compare one observation against one substance's published row.
 *
 * @param {{reagent:string, colors?:string[], none?:boolean}|undefined} row
 * @param {string} observed  a colour name, or "none" for no reaction
 */
export function compare(row, observed) {
  if (!row) return UNKNOWN;
  const colors = (row.colors || []).map((c) => String(c).toLowerCase());
  const mayBeNone = row.none === true;
  const observedNone = observed === "none";

  /* BOTH is a real state, not a contradiction.
   *
   * A faint reaction is what one observer records as nothing and another
   * records as a colour, and DanceSafe's own flowchart lists MDA on Simon's
   * both ways. A row carrying `none: true` AND colors means either reading is
   * a match — which is the only honest thing to do with a reaction that
   * genuinely presents both ways, and it means neither observation can
   * eliminate the substance. */
  if (mayBeNone && colors.length) {
    return observedNone || colors.includes(String(observed).toLowerCase())
      ? AGREE : DISAGREE;
  }

  if (mayBeNone) return observedNone ? AGREE : DISAGREE;
  if (observedNone) return DISAGREE;
  if (!colors.length) return UNKNOWN;
  return colors.includes(String(observed).toLowerCase()) ? AGREE : DISAGREE;
}

/**
 * Rank every substance against a set of observations.
 *
 * @param {Record<string,string>} observations  reagent name -> colour or "none"
 * @param {Record<string,Array>} table          data/reagents.json .reagents
 * @returns {{consistent:Array, ruledOut:Array, used:number}}
 */
export function match(observations, table) {
  const entries = Object.entries(observations || {})
    .filter(([, v]) => v && v !== "skip");
  if (!entries.length) return { consistent: [], ruledOut: [], used: 0 };

  const scored = [];
  for (const [id, rows] of Object.entries(table || {})) {
    const byReagent = new Map(rows.map((r) => [r.reagent, r]));
    let agrees = 0, disagrees = 0, unknown = 0;
    const detail = [];
    for (const [reagent, observed] of entries) {
      const verdict = compare(byReagent.get(reagent), observed);
      if (verdict === AGREE) agrees++;
      else if (verdict === DISAGREE) disagrees++;
      else unknown++;
      detail.push({ reagent, observed, verdict, documented: byReagent.get(reagent) || null });
    }
    scored.push({ id, agrees, disagrees, unknown, detail });
  }

  /* Most agreements first, then fewest gaps: between two substances that both
     fit, the one actually tested against these reagents is the better answer. */
  const rank = (a, b) => b.agrees - a.agrees || a.unknown - b.unknown
    || a.id.localeCompare(b.id);

  return {
    /* Nothing contradicted, and at least one thing positively matched. A
       candidate whose every reagent is unpublished is not evidence of
       anything and would otherwise sit at the top of the list looking like
       one. */
    consistent: scored.filter((s) => s.disagrees === 0 && s.agrees > 0).sort(rank),
    /* Kept and shown rather than discarded, because a single misread colour
       should not silently delete the right answer. */
    ruledOut: scored.filter((s) => s.disagrees > 0 && s.agrees > 0)
      .sort((a, b) => a.disagrees - b.disagrees || rank(a, b)),
    used: entries.length,
  };
}
