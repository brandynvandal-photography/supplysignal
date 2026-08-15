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
