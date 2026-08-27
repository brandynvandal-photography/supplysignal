// Donation links for the organizations this app cites.
//
//   node scripts/build-donate.mjs            recompute counts and groups only
//   node scripts/build-donate.mjs --verify   also re-check every link over the network
//
// WHAT THIS PRODUCES
//
// data/donate.json: one row per organization, each with a URL that was fetched
// and read at the time in the file's `checked` field.
//
// WHY IT IS NOT FULLY AUTOMATIC
//
// Finding a donate page is easy. Being SURE you found one is not, and this is a
// screen that asks people for money on somebody else's behalf, so a wrong link
// is worse than a missing one. Three failure modes turned up while building it,
// all of them from real sites:
//
//   1. A page that is about giving without being a donation page. "How to give
//      a genuine apology" scored higher than the actual donate link on one org's
//      site. Fixed by requiring the destination to be either on the org's own
//      domain or on a known donation platform, AND to name the organization.
//
//   2. A campaign that will not outlive the year. The first pass returned a Red
//      Cross appeal for specific tornadoes and a "holiday giving 2023" page that
//      already 404s. Fixed by trying canonical paths (/donate, /give, ...) FIRST
//      and only falling back to a link found on the page, with campaign-shaped
//      URLs skipped outright.
//
//   3. A homepage. Several sites link "Donate" to a scroll anchor on the front
//      page. That is not a donate page and it is rejected as one.
//
// WHAT IS EXCLUDED, and this is the part to read before adding anything
//
// Governments, journals, publishers and manufacturers: nothing to give them.
//
// Crisis, suicide and domestic-violence hotlines: excluded on purpose. They are
// cited throughout the app and they keep those citations. What they do not get
// is a donate button, because the reader most likely to meet one is the reader
// least well served by being asked for money. CRISIS below is that list and
// test/donate.test.mjs asserts none of them come back.
//
// TRACKING PARAMETERS ARE STRIPPED from every URL. The page tells readers that
// nothing routes through us; clean() is what makes the sentence true.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "donate.json");
const VERIFY = process.argv.includes("--verify");

/* ------------------------------------------------------------ exclusions */

const GOV = /(^|\.)gov($|\.)|nih\.gov|europa\.eu|nhs\.uk|wedinos\.wales|canada\.ca|usa\.gov|(^|\.)va\.gov$|ada\.gov|osha\.gov|census\.gov/;
const PUB = /pubmed|pmc\.|ncbi|sciencedirect|springer|oup\.com|acs\.org|doi\.org|frontiersin|iopscience|medrxiv|escholarship|ovid\.com|wikipedia|merckmanuals|arupconsult|scholars\.uky|walkerlab|adai\.uw\.edu|bwell\.brown|idmp\.ucsf|substance\.uvic|handbook\.bcehs/;
const COM = /btnx\.com|cvshealth|bunkpolice|cbsnews|drinkaware|transparencytesting|dancingmango|aidsmap|hiv-druginteractions/;
const META = /charitynavigator|guidestar|opioidsettlementtracker|opioiddata\.org|legislativeanalysis|networkforphl|congressfoundation|csgjusticecenter|govdelivery|wordpress\.com/;

/** Hotlines. See the header - this list is the policy, not an oversight. */
export const CRISIS = new Set([
  "988lifeline.org", "thetrevorproject.org", "translifeline.org",
  "strongheartshelpline.org", "thedeafhotline.org", "lgbthotline.org",
  "veteranscrisisline.net", "thehotline.org", "rainn.org", "211.org",
  "vibrant.org", "reprolegalhelpline.org", "deaflead.org", "poison.org",
  "stevefund.org", "wernative.npaihb.org",
]);

/* Which section of the page an organization lands in, decided by the datasets
   that cite it rather than by anybody's opinion of what it is. First match in
   this order wins, and an org cited in several is placed by whichever cites it
   most - see group(). */
const GROUP_OF = {
  harm: ["adulterants", "checking", "testing", "harm", "emerging", "market",
         "regional", "comedown", "sitting", "practice", "name-warnings"],
  policy: ["policy", "supervision", "education"],
  support: ["support", "communities", "conditions", "consent", "sex", "after",
            "stimulants", "heat", "rx", "index", "descriptions", "search-intents"],
};

/* ----------------------------------------------------------------- shape */

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** utm_*, refcode, sourceid and friends. See the header. */
export function clean(u) {
  let url;
  try { url = new URL(u); } catch { return u; }
  for (const k of [...url.searchParams.keys()]) {
    if (/^(utm_|_ga|fbclid|gclid|mc_cid|mc_eid)/i.test(k) ||
        /^(refcode|sourceid|source|src|ref|campaign|cid)$/i.test(k)) {
      url.searchParams.delete(k);
    }
  }
  url.hash = url.hash === "#/donate" ? url.hash : "";
  return url.toString().replace(/\?$/, "");
}

/* ------------------------------------------------------------- citations */

/** Every {name, url} pair in every content dataset, by domain. */
async function citations() {
  const byDomain = new Map();
  const files = (await readdir(path.join(ROOT, "data")))
    .filter((f) => f.endsWith(".json") && !["topics.json", "search.json", "donate.json"].includes(f));

  for (const f of files) {
    let doc;
    try { doc = JSON.parse(await readFile(path.join(ROOT, "data", f), "utf8")); } catch { continue; }
    const set = f.replace(/\.json$/, "");
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      const n = o.name || o.source;
      const u = o.url;
      if (typeof n === "string" && typeof u === "string" && /^https?:/.test(u)) {
        const d = host(u);
        if (d) {
          const row = byDomain.get(d) || { domain: d, refs: 0, names: new Map(), sets: new Map() };
          row.refs += 1;
          row.names.set(n.trim(), (row.names.get(n.trim()) || 0) + 1);
          row.sets.set(set, (row.sets.get(set) || 0) + 1);
          byDomain.set(d, row);
        }
      }
      Object.values(o).forEach(walk);
    };
    walk(doc);
  }
  return [...byDomain.values()].filter((r) =>
    !GOV.test(r.domain) && !PUB.test(r.domain) && !COM.test(r.domain) &&
    !META.test(r.domain) && !CRISIS.has(r.domain));
}

function group(sets) {
  const score = { harm: 0, support: 0, policy: 0 };
  for (const [set, n] of sets) {
    for (const [k, list] of Object.entries(GROUP_OF)) if (list.includes(set)) score[k] += n;
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "support";
}

/* ------------------------------------------------------------ the writer */

async function main() {
  const cites = await citations();
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { orgs: [] };
  const known = new Map((prev.orgs || []).map((o) => [o.domain, o]));

  if (VERIFY) {
    console.error("--verify is not implemented in-process on purpose.\n"
      + "Link checking hits ~1,800 third-party URLs and takes 20 minutes; running it\n"
      + "from a build would hammer small nonprofits every time somebody types npm run\n"
      + "build. Re-run the checker in scripts/donate-check.mjs by hand, review what it\n"
      + "returns, and paste the result in. The date in `checked` is a claim about when\n"
      + "a person last looked.");
    process.exitCode = 1;
    return;
  }

  const orgs = [];
  const dropped = [];
  for (const c of cites) {
    const was = known.get(c.domain);
    if (!was || !was.donate) { dropped.push(c.domain); continue; }
    orgs.push({
      name: was.name,
      domain: c.domain,
      donate: clean(was.donate),
      refs: c.refs,
      group: group(c.sets),
    });
  }
  orgs.sort((a, b) => b.refs - a.refs || a.name.localeCompare(b.name));

  const doc = {
    note: prev.note,
    checked: prev.checked,
    excluded: prev.excluded,
    orgs,
  };
  await writeFile(OUT, JSON.stringify(doc, null, 1) + "\n");
  console.log(`data/donate.json  ${orgs.length} organizations`);
  if (dropped.length) {
    console.log(`  ${dropped.length} cited orgs have no confirmed donate page and are not listed`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
