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

import { match, compare, checkSoldAs } from "../site/js/reagentmatch.js";
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

check("a gap keeps fentanyl on the screen instead of deleting it", () => {
  /* THE CASE THAT DECIDES THE WHOLE DESIGN. The full-match list is now exactly
     that — every reading or nothing — so fentanyl, which has no Simon's row at
     all, cannot appear in it once Simon's is one of the readings. It must
     therefore appear in `partial`. Anywhere else and the screen has quietly
     told somebody they do not have the thing most likely to kill them. */
  const out = match({ Marquis: "orange", Simons: "none" }, TABLE);
  if (ids(out.consistent).includes("fentanyl")) return "an untested pair counted as a match";
  if (ids(out.ruledOut).includes("fentanyl")) return "fentanyl ruled out by an unpublished pair";
  if (!ids(out.partial).includes("fentanyl")) return "fentanyl vanished from all three lists";
  return null;
});

check("a full match means EVERY reading matched, with nothing assumed", () => {
  /* The rule the picker promises: 2 of 2 for two reagents, 1 of 1 for one. A
     single unpublished pair is a gap, not a match, and may not be counted as
     one however well the rest agrees. */
  for (const obs of [{ Marquis: "black", Simons: "blue" },
                     { Marquis: "none", Mandelin: "orange" },
                     { Ehrlich: "pink" },
                     { Marquis: "purple", Mecke: "blue", Simons: "none" }]) {
    const out = match(obs, TABLE);
    const used = out.used;
    const bad = out.consistent.filter((s) => s.agrees !== used || s.unknown > 0);
    if (bad.length) {
      return `${bad.length} partial match listed as full on ${JSON.stringify(obs)}`
        + ` (e.g. ${bad[0].id}: ${bad[0].agrees} of ${used}, ${bad[0].unknown} untested)`;
    }
  }
  return null;
});

check("the three lists never disagree about the same substance", () => {
  /* Full, partial and contradicted are meant to be exclusive. A substance in
     two of them means one of the filters is wrong, and the reader would see
     the same name in two places saying different things. */
  const out = match({ Marquis: "black", Simons: "blue" }, TABLE);
  const seen = new Map();
  for (const [list, name] of [[out.consistent, "consistent"],
                              [out.partial, "partial"], [out.ruledOut, "ruledOut"]]) {
    for (const s of list) {
      if (seen.has(s.id)) return `${s.id} is in both ${seen.get(s.id)} and ${name}`;
      seen.set(s.id, name);
    }
  }
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

/* ------------------------------------------------ sold as, and was it that */

check("sold as MDMA, and it behaved like MDMA", () => {
  /* Black Marquis and blue Simon's is the textbook pair. */
  const r = checkSoldAs("mdma", { Marquis: "black", Simons: "blue" }, TABLE);
  return r?.status === "expected" ? null : `got ${r?.status}`;
});

check("sold as MDMA, Simon's did nothing — the MDA case", () => {
  /* THE REASON ANYBODY OWNS SIMON'S. Marquis cannot separate MDMA from MDA;
     Simon's is the one that can, because it reacts with the secondary amine
     and not the primary one. Somebody sold MDMA whose Simon's stays clear must
     be told that is not the published reaction, and the list underneath has to
     reach MDA — which is a real drug with a real dose difference, not a
     harmless substitution. */
  const obs = { Marquis: "black", Simons: "none" };
  const sold = checkSoldAs("mdma", obs, TABLE);
  if (sold?.status !== "unexpected") return `sold-as verdict was ${sold?.status}`;
  if (checkSoldAs("mda", obs, TABLE)?.status !== "expected") {
    return "the same readings are not expected for MDA";
  }
  const full = ids(match(obs, TABLE).consistent);
  if (!full.includes("mda")) return "MDA missing from the full-match list";
  if (full.includes("mdma")) return "MDMA listed as a full match for its own contradiction";
  return null;
});

check("one contradiction outweighs any number of agreements", () => {
  /* A verdict that averaged would call one match and one miss a half-success,
     and the miss is the only part carrying information. */
  const r = checkSoldAs("mdma", { Marquis: "black", Simons: "none", Mecke: "black" }, TABLE);
  if (r?.status !== "unexpected") return `got ${r?.status} on 2 agreements and 1 miss`;
  return r.disagrees > 0 && r.agrees > 0 ? null : "the detail lost the disagreement";
});

check("an untested reagent gives no verdict rather than a false clean one", () => {
  /* Fentanyl has no Simon's row. "Expected" here would read as reassurance
     manufactured out of a gap in the literature. */
  const r = checkSoldAs("fentanyl", { Marquis: "orange", Simons: "none" }, TABLE);
  if (r?.status !== "partial") return `got ${r?.status}`;
  return r.unknown === 1 ? null : `counted ${r.unknown} unpublished`;
});

check("the cocaine override answers both ways for a sold-as check too", () => {
  /* Whichever chart the reader's eye agrees with, cocaine sold as cocaine must
     not be called unexpected on a faint Marquis. */
  for (const seen of ["none", "pink"]) {
    const r = checkSoldAs("cocaine", { Marquis: seen, Mandelin: "orange" }, TABLE);
    if (r?.status !== "expected") return `Marquis ${seen} gave ${r?.status}`;
  }
  return null;
});

check("a substance with no reagent data at all returns nothing to show", () => {
  if (checkSoldAs("not-a-real-id", { Marquis: "black" }, TABLE) !== null) {
    return "an unknown substance produced a verdict";
  }
  if (checkSoldAs("mdma", {}, TABLE) !== null) return "no readings produced a verdict";
  return null;
});

check("the sold-as verdict and the lists never contradict each other", () => {
  /* Two ways of saying the same thing about the same substance, on the same
     screen, at the same moment. If they can disagree, one of them is lying. */
  const obs = { Marquis: "purple", Mecke: "blue" };
  const { consistent, partial, ruledOut } = match(obs, TABLE);
  const bucket = (id) =>
    ids(consistent).includes(id) ? "expected"
      : ids(partial).includes(id) ? "partial"
      : ids(ruledOut).includes(id) ? "unexpected" : null;
  for (const id of ["heroin", "mdma", "cocaine", "fentanyl", "ketamine", "lsd"]) {
    const sold = checkSoldAs(id, obs, TABLE);
    const seen = bucket(id);
    if (!sold || !seen) continue;            // scored zero either way
    if (sold.status !== seen) return `${id}: verdict ${sold.status}, list ${seen}`;
  }
  return null;
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
  return out.consistent.length === 0 && out.partial.length === 0 && out.used === 0
    ? null : "empty input returned results";
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
