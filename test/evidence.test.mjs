/* Evidence grading.
 *
 * The rule under test: no information beats wrong information. Every check
 * here is a way a plausible-looking item could reach a reader without anyone
 * identifiable having actually found it out - or a way a real finding could be
 * lost to over-caution, which is the same rule read from the other side.
 */

import { grade, findOriginator, admit, independence, carrierClass } from "../src/evidence.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = JSON.parse(readFileSync(path.join(ROOT, "config/sources.json"), "utf8"));

const cases = [];
const check = (name, fn) => cases.push({ name, fn });

const gnews = (title, body = "") => ({
  sourceId: "google-news", sourceName: "Somewhere Times", title, body,
});
const scored = { confidence: 0.9, severity: "critical" };

/* ---------------------------------------------------------- the core rule */

check("a well-scored item naming nobody is dropped, not published", () => {
  /* This is the whole module. "Residents say" is not a source. */
  const g = grade(
    gnews("Residents say overdoses are up this month",
          "Locals report a bad batch of fentanyl going around the county."),
    scored, SOURCES);
  return g.verdict === "drop" && g.reason === "no_named_originator"
    ? null : JSON.stringify(g);
});

check("the same wording quoting a health department publishes", () => {
  const g = grade(
    gnews("Overdoses up this month, county health department warns",
          "The county health department reports a bad batch of fentanyl."),
    scored, SOURCES);
  return g.verdict === "publish" && g.klass === "media" && g.reason === "reports:official"
    ? null : JSON.stringify(g);
});

check("a medical examiner in the text grades as reporting a lab", () => {
  const g = grade(
    gnews("Medical examiner confirms xylazine in overdose deaths"),
    scored, SOURCES);
  return g.reason === "reports:lab" ? null : JSON.stringify(g);
});

check("the strongest originator wins when several are named", () => {
  const g = grade(
    gnews("Toxicology results confirm what residents feared, health officials say"),
    scored, SOURCES);
  return g.reason === "reports:lab" ? null : JSON.stringify(g);
});

/* --------------------------------------------------------- not-a-finding */

check("a sentencing story is dropped whatever it names", () => {
  const g = grade(
    gnews("Dealer sentenced after fentanyl deaths, medical examiner testified"),
    scored, SOURCES);
  return g.verdict === "drop" && g.reason === "not_a_supply_finding"
    ? null : JSON.stringify(g);
});

check("a memorial walk is not a supply finding", () => {
  const g = grade(
    gnews("Overdose awareness walk honors those lost to fentanyl, health department joins"),
    scored, SOURCES);
  return g.verdict === "drop" ? null : JSON.stringify(g);
});

/* ------------------------------------------------- announcements, official
 *
 * The regression these exist for: on 2026-08-15 "Delaware Hospitals Adopt
 * Statewide Emergency Department Guidance for Opioid Use Disorder Treatment"
 * published as a STATEWIDE ALERT. Trusted source, real substance, an event
 * word, and nothing whatsoever circulating.
 *
 * It got through because official feeds were exempt from the not-a-finding
 * filter, on the reasoning that a health department publishing an item has
 * already decided the item is about a drug supply. That holds for a dedicated
 * drug-alert feed. Most of these sources are departmental NEWSROOMS - WIC,
 * food stamps, tick safety - and there it does not hold at all.
 *
 * Both halves are load-bearing. The DROP list is what the reader should never
 * see under "what's showing up near you"; the KEEP list is every way a real
 * advisory could be worded, and losing one of those is the worse failure. */
const official = (title, body = "") => ({
  sourceId: "wv-oeps", sourceName: "WV OEPS", title, body,
});
const isAnnouncement = (g) =>
  g.verdict === "drop" && g.reason === "not_a_supply_finding";

for (const title of [
  "Delaware Hospitals Adopt Statewide Emergency Department Guidance for Opioid Use Disorder Treatment",
  "DHSS Announces Health Fund Applications Due August 31",
  "WCHD Adds More Naloxone Distribution Boxes",
  "State awarded $4.2 million grant to expand opioid treatment",
  "Department launches new overdose dashboard",
  "Free naloxone training now available statewide",
  "County opens new harm reduction center",
  "Health department hosts overdose awareness campaign",
  "New syringe services sites now open in three counties",
]) {
  check(`an announcement is not an alert: ${title.slice(0, 46)}…`, () => {
    const g = grade(official(title), scored, SOURCES);
    return isAnnouncement(g) ? null : JSON.stringify(g);
  });
}

for (const title of [
  "Health department warns of spike in overdoses linked to fentanyl-adulterated supply",
  "Public health advisory: carfentanil detected in local drug supply",
  "Cluster of overdoses in the county; residents should remain vigilant",
  "Xylazine now appearing in the majority of samples tested",
  "Alert: counterfeit pills containing fentanyl are circulating",
  "Drug checking service identifies nitazenes in three samples",
  "Bromazolam found in pressed pills sold as Xanax across the state",
  "Overdose spike alert: 14 in 48 hours, naloxone distributed at the scene",
  "Three deaths in 24 hours; samples returned positive for nitazenes",
  "Warning: blue pills stamped M30 contain 2.4 mg fentanyl",
  "Fentanyl test strips are failing to detect this batch, lab says",
]) {
  check(`a real advisory survives it: ${title.slice(0, 46)}…`, () => {
    const g = grade(official(title), scored, SOURCES);
    return isAnnouncement(g) ? JSON.stringify(g) : null;
  });
}

check("a medical examiner's own tally is exempt from the announcement filter", () => {
  /* preScored items are structured counts, not prose. A tally that happens to
     mention a distribution program must not be read as announcing one. */
  const g = grade(
    { sourceId: "cook-me", sourceName: "Cook County ME", preScored: true,
      title: "Acetyl fentanyl in 13 of 163 opioid-involved deaths",
      body: "Naloxone distribution boxes were installed countywide during the period." },
    scored, SOURCES);
  return isAnnouncement(g) ? JSON.stringify(g) : null;
});

/* ------------------------------------------------------------- carriers */

check("a tagged official feed publishes without naming itself in prose", () => {
  const item = { sourceId: "wv-oeps", sourceName: "WV OEPS", title: "Alert", body: "..." };
  const g = grade(item, scored, SOURCES);
  return g.verdict === "publish" && g.klass === "official" ? null : JSON.stringify(g);
});

check("a community feed publishes as community, ceiling elevated", () => {
  const item = { sourceId: "grassroots-hr", sourceName: "Grassroots HR", title: "Alert", body: "..." };
  const g = grade(item, scored, SOURCES);
  return g.klass === "community" && g.ceiling === "elevated" ? null : JSON.stringify(g);
});

check("every configured feed carries an evidence class", () => {
  const bad = SOURCES.feeds.filter((f) => !["lab", "official", "community"].includes(f.evidence));
  return bad.length ? bad.map((f) => f.id).join(", ") : null;
});

check("aggregators are carriers, never their own evidence", () => {
  const a = carrierClass({ sourceId: "google-news" }, SOURCES);
  const b = carrierClass({ sourceId: "gdelt" }, SOURCES);
  return a === "carrier" && b === "carrier" ? null : `${a}/${b}`;
});

/* ------------------------------------------------------- severity gates */

check("media alone cannot publish critical", () => {
  const g = grade(
    gnews("Police warn of deadly batch after multiple overdoses"),
    scored, SOURCES);
  /* police = official originator, but carried by media: ceiling is capped one
     step below official's. */
  return g.ceiling === "elevated" ? null : JSON.stringify(g);
});

check("a lone media cluster claiming critical is demoted", () => {
  const c = {
    severity: "critical",
    members: [{ evidenceClass: "media" }],
    sources: [{ url: "https://somewheretimes.com/a" }],
  };
  const a = admit(c);
  return a.severity === "elevated" ? null : JSON.stringify(a);
});

check("two independent publishers can hold critical", () => {
  const c = {
    severity: "critical",
    members: [{ evidenceClass: "media" }, { evidenceClass: "media" }],
    sources: [{ url: "https://somewheretimes.com/a" }, { url: "https://othernews.org/b" }],
  };
  return admit(c).severity === "critical" ? null : JSON.stringify(admit(c));
});

check("twenty copies of one wire story are one source", () => {
  const c = {
    severity: "critical",
    members: Array.from({ length: 20 }, () => ({ evidenceClass: "media" })),
    sources: Array.from({ length: 20 }, (_, i) => ({ url: `https://somewheretimes.com/copy${i}` })),
  };
  return independence(c) === 1 && admit(c).severity === "elevated"
    ? null : `independence=${independence(c)}, severity=${admit(c).severity}`;
});

check("an official member holds critical on its own", () => {
  const c = {
    severity: "critical",
    members: [{ evidenceClass: "official" }],
    sources: [{ url: "https://health.example.gov/alert" }],
  };
  return admit(c).severity === "critical" ? null : JSON.stringify(admit(c));
});

/* -------------------------------------------------------- class floors */

check("a marginal community item is dropped by its floor", () => {
  const item = { sourceId: "rebel-hr", sourceName: "Rebel HR", title: "maybe something", body: "" };
  const g = grade(item, { confidence: 0.5, severity: "advisory" }, SOURCES);
  /* grade() itself publishes; the floor is applied by the caller. Assert the
     floor is there for the caller to apply. */
  return g.floor > 0.5 ? null : `floor=${g.floor}`;
});

/* ------------------------------------------- borrowed permission attack */

check("a media item cannot borrow an official item's permission to be critical", () => {
  /* admit() took the max severity across the cluster and, separately, the max
     evidence class, then asked whether THAT class could hold critical. The two
     were computed independently, so an attacker-controlled media item supplied
     the critical reading while a genuine health-department item in the same
     cluster supplied the class that waived the demotion. Each member is now
     capped against its own class first. */
  const c = {
    rawSeverity: "critical", severity: "critical",
    evidenceClasses: ["official", "media"],
    memberGrades: [
      { severity: "critical", evidenceClass: "media" },
      { severity: "advisory", evidenceClass: "official" },
    ],
    sources: [
      { name: "Valley Herald", url: "https://news.google.com/rss/articles/X" },
      { name: "WV OEPS", url: "https://oeps.wv.gov/alert" },
    ],
  };
  const a = admit(c);
  return a.severity === "elevated" ? null : `published ${a.severity}`;
});

check("an official item claiming critical itself still publishes critical", () => {
  const a = admit({
    rawSeverity: "critical", severity: "critical",
    evidenceClasses: ["official"],
    memberGrades: [{ severity: "critical", evidenceClass: "official" }],
    sources: [{ name: "WV OEPS", url: "https://oeps.wv.gov/alert" }],
  });
  return a.severity === "critical" ? null : `demoted to ${a.severity}`;
});

check("two invented mastheads on an aggregator are not two publishers", () => {
  /* For a Google News item, sourceName is whatever followed the last " - " in
     the article title — the masthead the author chose at signup. Two pages
     under two invented names scored as independent corroboration, which is the
     only thing standing between a media item and a critical publication. */
  const g = (n) => ({ name: n, url: "https://news.google.com/rss/articles/X" });
  const c = {
    rawSeverity: "critical", severity: "critical",
    evidenceClasses: ["media"],
    memberGrades: [
      { severity: "critical", evidenceClass: "media" },
      { severity: "critical", evidenceClass: "media" },
    ],
    sources: [g("Valley Herald"), g("County Post")],
  };
  const a = admit(c);
  return independence(c) === 0 && a.severity === "elevated"
    ? null : `independence=${independence(c)}, severity=${a.severity}`;
});

check("two real hosts still corroborate", () => {
  const c = {
    rawSeverity: "critical", severity: "critical",
    evidenceClasses: ["media"],
    memberGrades: [
      { severity: "critical", evidenceClass: "media" },
      { severity: "critical", evidenceClass: "media" },
    ],
    sources: [
      { name: "Tribune", url: "https://tribune.com/a" },
      { name: "Sun-Times", url: "https://suntimes.com/b" },
    ],
  };
  return admit(c).severity === "critical" ? null : `demoted to ${admit(c).severity}`;
});

/* ------------------------------------------------------------------- run */

console.log("\nEVIDENCE");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
