/* The reverse reagent lookup.
 *
 * Every case here is a claim about chemistry that can be checked against a
 * reagent chart, not a claim about the code. The feature tells somebody what
 * the colours in front of them are consistent with, and the failure that
 * matters is not a crash — it is quietly removing the drug they are actually
 * holding from the list, or naming one they are not.
 *
 * The rule under test above all others: a substance with NO PUBLISHED RESULT
 * for a reagent is never eliminated by that reagent. data/reagents.json marks
 * a tested no-reaction as `none: true` and simply omits the pair when nobody
 * published one. Reading absence as "no reaction" would turn every gap in the
 * literature into a false elimination.
 */

import { match, compare } from "../site/js/reagentmatch.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = JSON.parse(readFileSync(path.join(ROOT, "data/reagents.json"), "utf8")).reagents;

const cases = [];
const check = (name, fn) => cases.push({ name, fn });
const ids = (list) => list.map((x) => x.id);

/* ------------------------------------------------- the elimination rule */

check("a substance with no published result is never ruled out by it", () => {
  /* Fentanyl has Marquis, Mecke and Mandelin and nothing else. Somebody who
     ran Simon's and saw nothing must not have fentanyl removed from the list
     on the strength of a pair nobody ever tested. */
  const r = compare(undefined, "none");
  if (r !== "unknown") return `absence read as ${r}`;
  const out = match({ Simons: "none" }, TABLE);
  if (ids(out.ruledOut).includes("fentanyl")) return "fentanyl ruled out by an unpublished pair";
  return null;
});

check("a documented no-reaction DOES rule out a colour", () => {
  /* Cocaine is documented as no reaction with Marquis. Somebody whose Marquis
     went black does not have cocaine as the dominant substance. */
  const out = match({ Marquis: "black" }, TABLE);
  return ids(out.consistent).includes("cocaine")
    ? "cocaine listed as consistent with a black Marquis" : null;
});

check("a colour where none is documented is a disagreement", () => {
  const r = compare({ reagent: "Marquis", none: true }, "black");
  return r === "disagrees" ? null : `got ${r}`;
});

check("no reaction where a colour is documented is a disagreement", () => {
  const r = compare({ reagent: "Marquis", colors: ["black"] }, "none");
  return r === "disagrees" ? null : `got ${r}`;
});

/* --------------------------------------------- known chemistry, forwards */

check("Ehrlich pink finds LSD", () => {
  /* Ehrlich is the indole test and the reason it is in every kit. */
  const out = match({ Ehrlich: "pink" }, TABLE);
  return ids(out.consistent).includes("lsd") ? null : "LSD not consistent with a pink Ehrlich";
});

check("black Marquis plus blue Simon's reaches MDMA", () => {
  const out = match({ Marquis: "black", Simons: "blue" }, TABLE);
  const top = ids(out.consistent).slice(0, 12);
  return top.includes("mdma") ? null : `MDMA not in the top of ${top.join(", ")}`;
});

check("a blue Simon's still separates MDMA from MDA", () => {
  /* The classic use of Simon's: it reacts with secondary amines — MDMA,
     methamphetamine — and not with primary ones. MDA now carries BOTH a
     no-reaction and a dark gray/green, so this asserts the narrower thing that
     survives that: BLUE is still MDMA's and not MDA's. */
  const out = match({ Simons: "blue" }, TABLE);
  const got = ids(out.consistent);
  if (got.includes("mda")) return "MDA consistent with a blue Simon's";
  if (!got.includes("mdma")) return "MDMA not consistent with a blue Simon's";
  return null;
});

check("MDA's Simon's reaction matches BOTH nothing and gray", () => {
  /* The override. DanceSafe's flowchart lists MDA on Simon's both ways, so
     neither reading may eliminate it — which is what makes Simon's a weaker
     discriminator than it is usually given credit for. */
  const row = (TABLE.mda || []).find((r) => r.reagent === "Simons");
  if (!row) return "MDA lost its Simon's row";
  if (!row.none || !(row.colors || []).length) {
    return "the override did not survive a rebuild: " + JSON.stringify(row);
  }
  if (compare(row, "none") !== "agrees") return "no-reaction no longer matches";
  if (compare(row, "gray") !== "agrees") return "gray no longer matches";
  if (compare(row, "blue") !== "disagrees") return "blue wrongly matches";
  return null;
});

check("cocaine survives BOTH a blank Marquis and a faint pink one", () => {
  /* The other override, and the one that motivated the pair: PsychonautWiki's
     version alone eliminates cocaine for anybody reporting pink, DanceSafe's
     alone eliminates it for anybody reporting nothing. Carrying both means
     neither observation can. */
  const blank = ids(match({ Marquis: "none" }, TABLE).consistent);
  const pink = ids(match({ Marquis: "pink" }, TABLE).consistent);
  if (!blank.includes("cocaine")) return "cocaine lost on a blank Marquis";
  if (!pink.includes("cocaine")) return "cocaine lost on a pink Marquis";
  return null;
});

check("every override carries its source in the shipped data", () => {
  /* A divergence from upstream that is not attributable is indistinguishable
     from a hand-edit, which the file's own header forbids. */
  const bad = [];
  for (const [id, rows] of Object.entries(TABLE)) {
    for (const r of rows) {
      if (!r.override) continue;
      if (!r.override.source || !r.override.why) bad.push(`${id}/${r.reagent}`);
    }
  }
  return bad.length ? `unattributed override: ${bad.join(", ")}` : null;
});

check("a purple Marquis with a blue Mecke reaches heroin", () => {
  const out = match({ Marquis: "purple", Mecke: "blue" }, TABLE);
  return ids(out.consistent).includes("heroin") ? null : "heroin missing";
});

check("Marquis nothing plus Mandelin orange keeps ketamine and cocaine in", () => {
  /* Both are documented Marquis-none, and both react with Mandelin in that
     range. A tool that returned only one of them would be overconfident. */
  const out = match({ Marquis: "none", Mandelin: "orange" }, TABLE);
  const got = ids(out.consistent);
  const missing = ["ketamine", "cocaine"].filter((x) => !got.includes(x));
  return missing.length ? `missing ${missing.join(", ")}` : null;
});

/* -------------------------------------------------------- the guardrails */

check("nothing is consistent on unknowns alone", () => {
  /* A substance whose every observed reagent is unpublished has agreed with
     nothing. It must not sit at the top of the list looking like a match. */
  const out = match({ Foli: "orange" }, TABLE);
  const bad = out.consistent.filter((s) => s.agrees === 0);
  return bad.length ? `${bad.length} listed with zero agreements` : null;
});

check("no observations returns nothing rather than everything", () => {
  const out = match({}, TABLE);
  return out.consistent.length === 0 && out.used === 0 ? null : "empty input returned results";
});

check("skip is not an observation", () => {
  const out = match({ Marquis: "skip", Mecke: "blue" }, TABLE);
  return out.used === 1 ? null : `counted ${out.used} observations`;
});

check("a contradicted substance is kept and reported, not deleted", () => {
  /* One misread colour must not silently remove the right answer. MDMA is
     documented black on Marquis; somebody reporting yellow should still see
     it, in the ruled-out list, with the disagreement named. */
  const out = match({ Marquis: "yellow", Simons: "blue" }, TABLE);
  const row = out.ruledOut.find((s) => s.id === "mdma");
  if (!row) return "MDMA vanished rather than being reported as contradicted";
  const d = row.detail.find((x) => x.reagent === "Marquis");
  return d && d.verdict === "disagrees" ? null : "the disagreement was not recorded";
});

check("every substance in the table can be scored without throwing", () => {
  /* 207 substances, some with a single reagent, some with fifteen. */
  const out = match({ Marquis: "black", Mecke: "none", Simons: "blue" }, TABLE);
  const total = out.consistent.length + out.ruledOut.length;
  return total > 0 && total <= Object.keys(TABLE).length
    ? null : `scored ${total} of ${Object.keys(TABLE).length}`;
});

check("the colour vocabulary in the data is the one the UI offers", () => {
  /* If the data ever grows a colour the picker does not list, that colour
     becomes unreachable and every substance carrying it silently stops being
     findable. */
  const OFFERED = new Set(["yellow", "brown", "orange", "green", "black",
                           "pink", "purple", "red", "blue", "gray"]);
  const seen = new Set();
  for (const rows of Object.values(TABLE)) {
    for (const r of rows) for (const c of r.colors || []) seen.add(String(c).toLowerCase());
  }
  const missing = [...seen].filter((c) => !OFFERED.has(c));
  return missing.length ? `data uses colours the picker does not offer: ${missing.join(", ")}` : null;
});

/* ------------------------------------------------------------------- run */

console.log("\nREAGENT MATCH");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
