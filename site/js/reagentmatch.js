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
 * SO THERE ARE THREE ANSWERS, NOT TWO. A gap is neither a match nor a miss, and
 * collapsing it into either one is a lie in a different direction:
 *
 *   consistent — every reading you gave matched something published. Two of
 *                two, one of one. Nothing assumed.
 *   partial    — nothing contradicts, but one of your reagents has never been
 *                published against it. It cannot be confirmed AND IT CANNOT BE
 *                DISMISSED. Fentanyl is the reason this list exists: the file
 *                has Marquis, Mecke and Mandelin for it and nothing else, so
 *                anybody who ran Simon's has a gap, and fentanyl must not
 *                disappear off a harm-reduction screen because of one.
 *   ruledOut   — something you saw contradicts something published.
 *
 * 86 of the 207 substances here are missing at least one of the two default
 * reagents, so "partial" is not an edge case, it is two fifths of the table.
 * The screen shows the full matches as the answer and keeps the partials one
 * tap away, named for what they are.
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

/* THE PICKER KNOWS MORE COLOURS THAN THE TABLE DOES.
 *
 * data/reagents.json normalises PsychonautWiki to ten words — yellow, brown,
 * orange, green, black, pink, purple, red, blue, gray. DanceSafe's charts name
 * readings that fork BETWEEN those, and the forks are load-bearing: peach goes
 * to Morris and toward cocaine while bright orange goes to Liebermann and
 * toward amphetamine, so rounding peach to orange merges two different tests.
 * The picker therefore offers peach, magenta and olive as well.
 *
 * Which leaves a gap. A reader who picks peach has said something the table
 * has no word for, and scoring it literally would match nothing at all in 207
 * substances — the chart would answer and the table would go silent, which is
 * the failure this file exists to avoid.
 *
 * So each of the extra colours carries the table words it falls between, and
 * agrees with a row holding EITHER. Precision where the chart forks, and the
 * table's generosity everywhere else. The charts match on the exact word and
 * do not use this map: peach must not satisfy a step that asks for orange, or
 * the fork it was added for stops existing. */
const TABLE_ALIAS = {
  peach: ["orange", "pink"],
  magenta: ["pink", "purple"],
  olive: ["green", "yellow"],
};

/** Every table word an observed reading could reasonably be recorded as. */
const asTableColors = (observed) => {
  const v = String(observed).toLowerCase();
  return TABLE_ALIAS[v] || [v];
};

/**
 * Compare one observation against one substance's published row.
 *
 * @param {{reagent:string, colors?:string[], none?:boolean}|undefined} row
 * @param {string} observed  a colour name, or "none" for no reaction
 */
export function compare(row, observed) {
  if (!row) return UNKNOWN;
  const colors = (row.colors || []).map((c) => String(c).toLowerCase());
  const seen = asTableColors(observed);
  const hit = () => seen.some((c) => colors.includes(c));
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
  if (mayBeNone && colors.length) return (observedNone || hit()) ? AGREE : DISAGREE;

  if (mayBeNone) return observedNone ? AGREE : DISAGREE;
  if (observedNone) return DISAGREE;
  if (!colors.length) return UNKNOWN;
  return hit() ? AGREE : DISAGREE;
}

/**
 * Was that the reaction you should have got for what you were sold?
 *
 * The list below answers "what could this be". This answers the question
 * somebody actually walked up with — I bought MDMA, is this MDMA — by scoring
 * the readings against that one substance instead of all 207.
 *
 * WHAT THE THREE ANSWERS MEAN, and the limits are load-bearing in both
 * directions:
 *
 *   expected   — every reading matches what is published for it. NOT a
 *                confirmation and NOT a purity result. A reagent reads the
 *                strongest reactant present, so a sample that is mostly what it
 *                was sold as plus something else reacts like the majority and
 *                hides the rest. Fentanyl is invisible here at a dose that
 *                kills.
 *   unexpected — at least one reading contradicts what is published. The
 *                honest reading is "this did not do what that is supposed to
 *                do", which is worth acting on, and not "this is definitely
 *                something else": reagent age, light and a faint reaction all
 *                move a colour, and mixtures react as whatever dominates.
 *   partial    — nothing contradicts, and at least one of those reagents has
 *                never been published against it. No verdict either way.
 *
 * @param {string} id                            substance id in the table
 * @param {Record<string,string>} observations   reagent name -> colour or "none"
 * @param {Record<string,Array>} table           data/reagents.json .reagents
 * @returns {{id:string, status:string, agrees:number, disagrees:number,
 *            unknown:number, used:number, detail:Array}|null}
 */
export function checkSoldAs(id, observations, table) {
  const rows = (table || {})[id];
  const entries = Object.entries(observations || {})
    .filter(([, v]) => v && v !== "skip");
  if (!rows || !entries.length) return null;

  const byReagent = new Map(rows.map((r) => [r.reagent, r]));
  let agrees = 0, disagrees = 0, unknown = 0;
  const detail = [];
  for (const [reagent, observed] of entries) {
    const documented = byReagent.get(reagent) || null;
    const verdict = compare(documented, observed);
    if (verdict === AGREE) agrees++;
    else if (verdict === DISAGREE) disagrees++;
    else unknown++;
    detail.push({ reagent, observed, verdict, documented });
  }

  /* One contradiction outweighs any number of agreements. Two reagents where
     one matched and one did not is the classic sold-as-MDMA-but-it-is-MDA
     result, and calling that a half-match would bury the only part of it that
     tells you anything. */
  const status = disagrees > 0 ? "unexpected"
    : agrees === entries.length ? "expected" : "partial";

  return { id, status, agrees, disagrees, unknown, used: entries.length, detail };
}

/**
 * Rank every substance against a set of observations.
 *
 * @param {Record<string,string>} observations  reagent name -> colour or "none"
 * @param {Record<string,Array>} table          data/reagents.json .reagents
 * @returns {{consistent:Array, partial:Array, ruledOut:Array, used:number}}
 */
export function match(observations, table) {
  const entries = Object.entries(observations || {})
    .filter(([, v]) => v && v !== "skip");
  if (!entries.length) return { consistent: [], partial: [], ruledOut: [], used: 0 };

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
    /* EVERY reading matched — two of two, one of one. No gaps and no
       contradictions, so nothing here rests on an assumption about a pair
       nobody published. This is the answer the screen leads with. */
    consistent: scored
      .filter((s) => s.disagrees === 0 && s.agrees === entries.length)
      .sort(rank),
    /* Fits as far as anyone has tested, with at least one reagent never
       published against it. Not confirmed, and — the point — not dismissed. */
    partial: scored
      .filter((s) => s.disagrees === 0 && s.agrees > 0 && s.unknown > 0)
      .sort(rank),
    /* Kept and shown rather than discarded, because a single misread colour
       should not silently delete the right answer. */
    ruledOut: scored.filter((s) => s.disagrees > 0 && s.agrees > 0)
      .sort((a, b) => a.disagrees - b.disagrees || rank(a, b)),
    used: entries.length,
  };
}
