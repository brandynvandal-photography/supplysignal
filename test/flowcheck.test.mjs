/* The DanceSafe flowcharts, walked.
 *
 * Every case is a claim about a published chart that can be checked against
 * the artwork, not a claim about the code. The chart is a sequence, and the
 * two failures that matter are both about sequence: calling a test finished
 * when a step has not been run, and calling a result expected when the reader
 * is standing at a fork the next reagent decides.
 *
 * The MDMA/MDA pair is the case the whole feature exists for. Marquis goes
 * black for both. Simon's is what separates them, royal blue against nothing
 * or gray-green, and a tool that answered before Simon's was run would be
 * handing somebody a confirmation the chart does not give.
 */

import { flowFor, walk, completedBy, offChart, unknownNext } from "../site/js/flowcheck.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHARTS = JSON.parse(readFileSync(path.join(ROOT, "data/flowcharts.json"), "utf8"));
const TABLE = JSON.parse(readFileSync(path.join(ROOT, "data/reagents.json"), "utf8")).reagents;

const cases = [];
const check = (name, fn) => cases.push({ name, fn });
const status = (id, obs) => walk(flowFor(id, CHARTS), obs)?.status;

/* ------------------------------------------------- the sequence is the point */

check("a black Marquis alone does not confirm MDMA", () => {
  /* THE CASE THIS FEATURE EXISTS FOR. Black is the first step of BOTH the MDMA
     and the MDA path. Answering "expected" here would confirm a drug on
     evidence the chart itself says is not sufficient. */
  const r = walk(flowFor("mdma", CHARTS), { Marquis: "black" });
  if (r.status !== "ontrack") return `got ${r.status}`;
  if (r.next !== "Simons") return `pointed at ${r.next} instead of Simon's`;
  return status("mda", { Marquis: "black" }) === "ontrack"
    ? null : "MDA did not stay open on the same reading";
});

check("Simon's finishes it, and finishes it differently for each", () => {
  const blue = { Marquis: "black", Simons: "blue" };
  const clear = { Marquis: "black", Simons: "none" };
  if (status("mdma", blue) !== "expected") return "royal blue is not MDMA's endpoint";
  if (status("mda", blue) !== "unexpected") return "royal blue was allowed for MDA";
  if (status("mda", clear) !== "expected") return "no reaction is not MDA's endpoint";
  if (status("mdma", clear) !== "unexpected") return "no reaction was allowed for MDMA";
  return null;
});

check("MDA's gray-green also finishes MDA", () => {
  /* The chart lists MDA's Simon's both ways — no reaction OR gray/green. */
  return status("mda", { Marquis: "black", Simons: "gray" }) === "expected"
    ? null : "gray was not accepted for MDA";
});

check("sold as MDMA and clear on Simon's names MDA, from the chart", () => {
  /* Not "unexpected, good luck". The readings complete the path one line down
     on the same chart, and saying which is the entire use of the thing. */
  const obs = { Marquis: "black", Simons: "none" };
  if (status("mdma", obs) !== "unexpected") return "MDMA was not marked unexpected";
  const done = completedBy(obs, CHARTS, "mdma").map((w) => w.id);
  return done.includes("mda") ? null : `completed flows were ${done.join(", ") || "none"}`;
});

check("a step out of order still counts — only the reading matters", () => {
  /* The chart's ORDER is advice about which bottle to open next. It is not a
     requirement that somebody who already ran both re-run them in sequence. */
  return status("mdma", { Simons: "blue", Marquis: "black" }) === "expected"
    ? null : "the same two readings failed when entered in the other order";
});

/* ------------------------------------------------ the rest of the charts */

check("methamphetamine and amphetamine split on Simon's, then Froehde", () => {
  /* Chart 2 side 2: orange Marquis for both; Simon's royal blue is meth, and
     no reaction there sends you on to Froehde for amphetamine. */
  const meth = { Marquis: "orange", Simons: "blue" };
  if (status("methamphetamine", meth) !== "expected") return "meth endpoint missed";

  const partial = { Marquis: "orange", Simons: "none" };
  const amp = walk(flowFor("amphetamine", CHARTS), partial);
  if (amp.status !== "ontrack") return `amphetamine was ${amp.status} before Froehde`;
  if (amp.next !== "Froehde") return `amphetamine pointed at ${amp.next}`;
  if (status("amphetamine", { ...partial, Froehde: "none" }) !== "expected") {
    return "amphetamine did not finish on a clear Froehde";
  }
  return status("methamphetamine", partial) === "unexpected"
    ? null : "a clear Simon's was allowed for meth";
});

check("cocaine and ketamine start on Morris, not Marquis", () => {
  /* The reason the picker had to learn Morris. Somebody who assumed
     Marquis-first has spent a sample on a reagent the chart never asks for. */
  const coke = flowFor("cocaine", CHARTS);
  if (coke.steps[0].reagent !== "Morr") return `cocaine opens on ${coke.steps[0].reagent}`;
  const ket = flowFor("ketamine", CHARTS);
  if (ket.steps.length !== 1 || ket.steps[0].reagent !== "Morr") {
    return "ketamine is not the single Morris step the chart shows";
  }
  return status("ketamine", { Morr: "purple" }) === "expected" ? null : "ketamine endpoint missed";
});

check("LSD is one reagent and it is Ehrlich's", () => {
  if (status("lsd", { Ehrlich: "purple" }) !== "expected") return "Ehrlich purple is not LSD's endpoint";
  return status("lsd", { Ehrlich: "none" }) === "unexpected" ? null : "a clear Ehrlich passed";
});

check("heroin runs three deep and each step is required", () => {
  const full = { Marquis: "purple", Froehde: "brown", Liebermann: "black" };
  if (status("heroin", full) !== "expected") return "the full heroin path did not finish";
  const two = walk(flowFor("heroin", CHARTS), { Marquis: "purple", Froehde: "brown" });
  if (two.status !== "ontrack") return `two of three steps reported ${two.status}`;
  return two.next === "Liebermann" ? null : `pointed at ${two.next}`;
});

/* ------------------------------------ chart 3, the unknown-substance router */

check("a black Marquis on an unknown routes to Simon's, for MDMA or MDA", () => {
  /* Chart 3's own instruction: "go to flowchart 1 and complete the MDMA or MDA
     test, starting with step 2 (Simon's)". */
  const r = unknownNext("black", CHARTS);
  if (!r.routed) return "chart 3 did not claim the black branch";
  if (r.next.join() !== "Simons") return `next was ${r.next.join(", ")}`;
  const missing = ["mdma", "mda"].filter((x) => !r.leads.includes(x));
  return missing.length ? `leads missing ${missing.join(", ")}` : null;
});

check("a clear Marquis routes to Liebermann, and keeps ketamine live", () => {
  /* Ketamine is the case a naive version drops. Its own flow OPENS on Morris,
     so matching the reading against flow openers alone would never reach it —
     chart 3 is what routes a no-reaction Marquis toward it. */
  const r = unknownNext("none", CHARTS);
  if (r.next.join() !== "Liebermann") return `next was ${r.next.join(", ")}`;
  return r.leads.includes("ketamine") && r.leads.includes("cocaine")
    ? null : `leads were ${r.leads.join(", ")}`;
});

check("a routed branch does not also drag in every flow's own second step", () => {
  /* An orange Marquis leaves cocaine, meth, amphetamine and mescaline live.
     Following each of their flows would load Morris, Liebermann, Simon's AND
     Froehde — four dropdowns, and more than the chart asks for. Chart 3 says
     run Liebermann; the peach/orange widening adds Morris. That is the cap. */
  const r = unknownNext("orange", CHARTS);
  if (r.next.length > 2) return `loaded ${r.next.length} reagents: ${r.next.join(", ")}`;
  if (!r.next.includes("Liebermann")) return "the chart's own next step is missing";
  const want = ["cocaine", "methamphetamine", "amphetamine", "mescaline"];
  const missing = want.filter((x) => !r.leads.includes(x));
  return missing.length ? `leads missing ${missing.join(", ")}` : null;
});

check("a reading chart 3 skips still routes, off the other charts", () => {
  /* Chart 3 branches four ways. Heroin's magenta and 2C-B's yellow are not
     among them, and both are on charts 1 and 2 opening with Marquis — so the
     second step comes off their own flows rather than being restated. */
  const purple = unknownNext("purple", CHARTS);
  if (purple.routed) return "chart 3 wrongly claimed the purple branch";
  if (!purple.leads.includes("heroin")) return "purple did not reach heroin";
  if (!purple.next.includes("Froehde")) return `purple next was ${purple.next.join(", ")}`;

  const yellow = unknownNext("yellow", CHARTS);
  return yellow.leads.includes("2c-b") && yellow.next.includes("Froehde")
    ? null : `yellow gave next ${yellow.next.join(", ")} / leads ${yellow.leads.join(", ")}`;
});

check("a reading no chart lists invents no next step", () => {
  /* DanceSafe's own footer: without knowing what it was sold as, further
     differentiation may be misleading. Offering a reagent here would be
     inventing a route, which is worse than saying there is not one. */
  for (const c of ["blue", "red"]) {
    const r = unknownNext(c, CHARTS);
    if (r.matched) return `${c} produced next: ${r.next.join(", ")}`;
    if (r.leads.length) return `${c} produced candidates: ${r.leads.join(", ")}`;
  }
  return CHARTS.unknownRule ? null : "the footer rule is not in the data to show";
});

check("no reading, no route", () => {
  if (unknownNext("", CHARTS) !== null) return "an empty reading produced a route";
  return unknownNext("skip", CHARTS) === null ? null : "a skipped reading produced a route";
});

check("every reagent chart 3 routes to is one the picker can express", () => {
  const OFFERED = new Set(["Marquis", "Mecke", "Mandelin", "Froehde", "Liebermann",
                           "Simons", "Morr", "Ehrlich", "Hofmann", "Zimmermann", "Scott"]);
  const bad = [];
  for (const b of CHARTS.unknown?.branches || []) {
    for (const r of b.next || []) if (!OFFERED.has(r)) bad.push(r);
    for (const id of b.leads || []) {
      if (!CHARTS.flows.some((f) => f.id === id)) bad.push(`lead with no flow: ${id}`);
    }
  }
  if (!OFFERED.has(CHARTS.unknown?.first)) bad.push(`opener ${CHARTS.unknown?.first}`);
  return bad.length ? bad.join(", ") : null;
});

/* ------------------------------------------------------------ guardrails */

check("nothing run is not a verdict", () => {
  const r = walk(flowFor("mdma", CHARTS), {});
  if (r.status !== "none") return `empty observations gave ${r.status}`;
  return walk(null, { Marquis: "black" }) === null ? null : "a missing flow produced a walk";
});

check("a reagent the chart does not ask for is not counted against it", () => {
  /* Running a Mecke on suspected MDMA is not an error and must not turn a
     clean chart result into a contradiction. It is scored by the broad table
     instead, which is what offChart() is for. */
  const obs = { Marquis: "black", Simons: "blue", Mecke: "yellow" };
  if (status("mdma", obs) !== "expected") return "an off-chart reading broke the verdict";
  const extra = offChart(flowFor("mdma", CHARTS), obs);
  return extra.length === 1 && extra[0] === "Mecke" ? null : `offChart gave ${extra.join(", ")}`;
});

check("every reagent a chart names is one the picker can express", () => {
  /* A chart step whose reagent is not in the picker is a test the reader is
     told to run and then cannot report. That is how Morris was found missing. */
  const OFFERED = new Set(["Marquis", "Mecke", "Mandelin", "Froehde", "Liebermann",
                           "Simons", "Morr", "Ehrlich", "Hofmann", "Zimmermann", "Scott"]);
  const bad = [];
  for (const f of CHARTS.flows) {
    for (const s of f.steps) if (!OFFERED.has(s.reagent)) bad.push(`${f.id}/${s.reagent}`);
  }
  return bad.length ? `picker cannot express: ${bad.join(", ")}` : null;
});

check("every colour a chart names is one the picker offers", () => {
  const OFFERED = new Set(["yellow", "orange", "red", "pink", "purple", "blue",
                           "green", "brown", "gray", "black"]);
  const bad = [];
  for (const f of CHARTS.flows) {
    for (const s of f.steps) {
      for (const c of s.colors || []) if (!OFFERED.has(c)) bad.push(`${f.id}/${s.reagent}: ${c}`);
      if (!(s.colors || []).length && s.none !== true) bad.push(`${f.id}/${s.reagent}: no accepted reading`);
    }
  }
  return bad.length ? bad.join("; ") : null;
});

check("every charted substance is one the app can name and reach", () => {
  /* A flow for an id nothing else knows about is a dead end. It does NOT need
     a row in the reagent table — mescaline has a full DanceSafe flow and no
     PsychonautWiki reagent data at all, which is why the sold-as list is the
     union of the two rather than the table alone — but it must exist as a
     substance, or the option would render as a raw slug. */
  const SUBS = JSON.parse(readFileSync(path.join(ROOT, "data/substances.json"), "utf8"));
  const known = new Set((SUBS.substances || []).map((s) => s.id));
  const missing = CHARTS.flows.map((f) => f.id).filter((id) => !known.has(id));
  return missing.length ? `not a known substance: ${missing.join(", ")}` : null;
});

check("every step carries the chart's own wording", () => {
  /* `says` is what the reader compares a real spot plate against. The generic
     colours are for matching; "royal blue" is for looking at. */
  const bad = CHARTS.flows.flatMap((f) =>
    f.steps.filter((s) => !s.says).map((s) => `${f.id}/${s.reagent}`));
  return bad.length ? `no wording for ${bad.join(", ")}` : null;
});

check("the flows do not contradict the reagent table", () => {
  /* Two sources for the same chemistry, and where the table has published a
     row it must not flatly exclude the chart's own expected colour. Overrides
     already reconcile the two known divergences (cocaine on Marquis, MDA on
     Simon's); this catches a third appearing unnoticed. */
  const clash = [];
  for (const f of CHARTS.flows) {
    for (const s of f.steps) {
      const row = (TABLE[f.id] || []).find((r) => r.reagent === s.reagent);
      if (!row) continue;                       // no published row, nothing to clash with
      const tableColors = new Set((row.colors || []).map((c) => c.toLowerCase()));
      const shared = (s.colors || []).some((c) => tableColors.has(c))
        || (s.none === true && row.none === true);
      if (!shared) clash.push(`${f.id}/${s.reagent}: chart says ${s.says}`);
    }
  }
  return clash.length ? clash.join("; ") : null;
});

check("the transcription carries its source", () => {
  const s = CHARTS.source || {};
  if (!s.title || !s.edition) return "no attribution on a hand-transcribed file";
  return CHARTS.unknownRule ? null : "the chart's own unknown-substance rule was dropped";
});

/* ------------------------------------------------------------------- run */

console.log("\nFLOWCHARTS");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
