/* A reagent test the way it is actually run.
 *
 * reagentmatch.js scores a bag of colours against a table of independent
 * facts: black is one of the colours Marquis gives MDMA. True, and not how
 * anybody tests anything. DanceSafe's charts are sequences — Marquis first,
 * and if it goes black then run Simon's, and royal blue there is the MDMA
 * result while no reaction is the MDA one. The order carries information the
 * table cannot: it is the SECOND reagent that separates the two, and which
 * second reagent to reach for depends on what the first one did.
 *
 * So this module answers the two questions the table cannot:
 *
 *   WHAT DO I NEED TO RUN. Given what it was sold as, the chart names the
 *   reagents and the order, so nobody is guessing which bottle comes next or
 *   buying one they do not need. A cocaine test starts with Morris, not
 *   Marquis, and somebody who owns only a Marquis should be told that before
 *   they use up a sample on it.
 *
 *   IS THIS THE EXPECTED RESULT. Not per-colour — per sequence, ending where
 *   the chart ends. Finishing matters: a black Marquis is on the way to both
 *   MDMA and MDA, and calling that "expected for MDMA" when the reader has not
 *   run Simon's yet would hand them a confirmation the chart does not give.
 *
 * FOUR STATES, because "expected or unexpected" cannot describe a test that
 * has been started and not finished:
 *
 *   expected   — every step run, every step agrees. The chart's endpoint.
 *   ontrack    — everything run so far agrees, steps remain. Names the next
 *                reagent, which is the whole point of a flowchart.
 *   unexpected — a step contradicts the chart.
 *   none       — nothing run yet against this flow.
 *
 * WHAT "EXPECTED" STILL DOES NOT MEAN, and the chart says this itself: a
 * reagent reads the strongest reactant present, so a mixture reacts as
 * whatever dominates, and no step on any of these charts sees fentanyl at a
 * dose that kills.
 *
 * Colour matching is deliberately generous. The charts say royal blue, peach,
 * magenta, ice blue; the picker offers ten plain colours because a spot plate
 * under a kitchen light is not a laboratory. Each step is stored widened to
 * those ten, and a step with no `colors` and no `none` matches nothing rather
 * than everything — a malformed row must not manufacture agreement.
 */

/** Does one observed reading satisfy one step of a chart? */
function stepAgrees(step, observed) {
  if (!step || !observed) return false;
  if (observed === "none") return step.none === true;
  const colors = (step.colors || []).map((c) => String(c).toLowerCase());
  return colors.includes(String(observed).toLowerCase());
}

/** The chart for one substance, or null if it is not on one. */
export function flowFor(id, charts) {
  if (!id) return null;
  return (charts?.flows || []).find((f) => f.id === id) || null;
}

/**
 * Walk a chart against what was actually observed.
 *
 * @param {object} flow                          from flowFor()
 * @param {Record<string,string>} observations   reagent key -> colour or "none"
 * @returns {{id:string, chart:string, status:string, next:string|null,
 *            done:number, total:number, steps:Array}|null}
 */
export function walk(flow, observations) {
  if (!flow) return null;
  const obs = observations || {};

  const steps = (flow.steps || []).map((s) => {
    const observed = obs[s.reagent];
    if (!observed || observed === "skip") {
      return { ...s, observed: null, verdict: "pending" };
    }
    return { ...s, observed, verdict: stepAgrees(s, observed) ? "agrees" : "disagrees" };
  });

  const done = steps.filter((s) => s.verdict !== "pending");
  const contradicted = steps.some((s) => s.verdict === "disagrees");
  /* The first step still outstanding, in chart order — which is the one to run
     next, not merely one of the ones missing. */
  const next = steps.find((s) => s.verdict === "pending") || null;

  const status = !done.length ? "none"
    : contradicted ? "unexpected"
    : next ? "ontrack"
    : "expected";

  return {
    id: flow.id, chart: flow.chart, status, steps,
    next: next ? next.reagent : null,
    done: done.length, total: steps.length,
  };
}

/**
 * Which other charts do these readings finish, cleanly?
 *
 * The reason this is worth showing is one case above all: sold as MDMA,
 * Marquis black, Simon's clear. That is not a vague mismatch — it is the
 * completed MDA path, on the same chart, one line down. Saying so is more use
 * than "unexpected" and it is what the chart is for.
 *
 * @param {Record<string,string>} observations
 * @param {object} charts
 * @param {string} [exceptId]  usually what it was sold as, already reported on
 */
export function completedBy(observations, charts, exceptId) {
  return (charts?.flows || [])
    .filter((f) => f.id !== exceptId)
    .map((f) => walk(f, observations))
    .filter((w) => w && w.status === "expected");
}

/**
 * No idea what it is — so run a Marquis and let it decide the rest.
 *
 * Chart 3 is a router, not a flow. It has no endpoint of its own: it reads a
 * Marquis and sends you to one of the tests on the other two charts. That is
 * the honest starting point for a ground score, and it is the one case where
 * the app can be genuinely useful without being told anything at all.
 *
 * ONE STEP AT A TIME, which is the whole reason a flowchart is a chart. The
 * branch names the reagent to run SECOND; what comes after that depends on
 * what the second one does. Loading four reagents up front because four
 * substances are still live would be the wall of dropdowns this picker started
 * as, and it would also be wrong — the chart does not ask for four.
 *
 * Charts 1 and 2 open on Marquis for substances chart 3 does not route —
 * heroin, oxycodone, 2C-B. Their own second step answers it, so it is read off
 * `flows` rather than restated here, and only when chart 3 has nothing to say
 * about the reading. Where chart 3 does route, chart 3 wins: it is the chart
 * written for exactly this situation.
 *
 * A reading no chart lists gets no next step and no candidates. DanceSafe's
 * own footer covers it, and it is carried in the data as `unknownRule`:
 * without knowing what something was sold as, differentiating further may be
 * misleading. Offering a next reagent there would be inventing a route.
 *
 * @param {string} reading   what Marquis did — a color, or "none"
 * @param {object} charts
 * @returns {{reading:string, next:string[], leads:string[], says:string[],
 *            matched:boolean, routed:boolean}|null}
 */
export function unknownNext(reading, charts) {
  if (!reading || reading === "skip") return null;
  const unknown = charts?.unknown || {};
  const first = unknown.first || "Marquis";

  const next = [], leads = [], says = [];
  const add = (list, v) => { if (v && !list.includes(v)) list.push(v); };

  for (const b of unknown.branches || []) {
    if (!stepAgrees(b, reading)) continue;
    add(says, b.says);
    (b.next || []).forEach((r) => add(next, r));
    (b.leads || []).forEach((id) => add(leads, id));
  }
  const routed = next.length > 0;

  for (const f of charts?.flows || []) {
    const opener = f.steps?.[0];
    if (!opener || opener.reagent !== first || !stepAgrees(opener, reading)) continue;
    add(leads, f.id);
    /* Only fills the gap. A substance chart 3 already routes to must not also
       drag its own second step in and turn a one-step instruction into three. */
    if (!routed) add(next, f.steps[1]?.reagent);
  }

  return { reading, next, leads, says, routed, matched: next.length > 0 };
}

/**
 * Reagents the reader reported that this chart never asks for.
 *
 * Not wrong and not wasted — reagentmatch.js scores them against the whole
 * 207-substance table, which is where the broader answer comes from. They are
 * simply outside what the chart can speak to, and the verdict must not appear
 * to have weighed them.
 */
export function offChart(flow, observations) {
  const on = new Set((flow?.steps || []).map((s) => s.reagent));
  return Object.entries(observations || {})
    .filter(([r, v]) => v && v !== "skip" && !on.has(r))
    .map(([r]) => r);
}
