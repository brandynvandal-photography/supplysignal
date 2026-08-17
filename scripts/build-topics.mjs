// Combine the content datasets into one bundle.
//
//   node scripts/build-topics.mjs
//
// WHY THIS EXISTS
//
// PRIVACY.md §1 promises that a server log reveals only that somebody loaded
// the site. That was true of COUNTY and SUBSTANCE lookups, which run entirely
// in memory against national bundles — and false of the pages themselves.
//
// site/js/data.js fetched one file per dataset, lazily, on the screen that
// needed it. So the access log recorded, per IP and timestamped:
//
//     GET /data/sex.json           this reader opened Sex and being out
//     GET /data/supervision.json   this reader is on probation or parole
//     GET /data/consent.json       this reader is reading about assault
//     GET /data/after.json         this reader just survived an overdose
//     GET /data/communities.json   this reader opened the LGBTQ+ / immigrant
//                                  / sex worker resource directory
//
// Path-based routing made the same disclosure in the request path (/sex,
// /supervision), which is a separate finding and separately fixed by the fact
// that only SECTION names are paths. But the data requests were finer-grained
// than the routes and outlived them in the browser's HTTP cache.
//
// For this audience that is the whole ballgame. A subpoena to the host, or an
// observer on shared wifi, could not learn which county someone checked — and
// could learn that they read the page about what probation can require.
//
// THE FIX: one file, fetched unconditionally by every reader on every visit,
// before anything is clicked. Every reader produces the identical request, so
// the log carries no signal at all. 26 datasets, 404 KB raw, about 133 KB over
// the wire compressed — roughly one photograph, once per release, and the
// service worker keeps it after that.
//
// WHAT IS DELIBERATELY NOT IN HERE, and the honest limit of this fix:
//
//   substances.json, combos.json, reagents.json, county-shapes.json and the
//   gazetteers are large (252 KB to 776 KB) and stay separate. Fetching one
//   still reveals something — "opened the Drugs tab", "opened the map" — but
//   that is a section, which the URL path already discloses by design, and
//   folding 2.6 MB into the boot path would cost every reader on a phone far
//   more than it buys them. The line is drawn at datasets whose SUBJECT is
//   sensitive, rather than at every dataset.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The datasets whose subject matter is itself sensitive.
 *
 * Keep this in step with TOPICS in site/js/data.js — a name in one and not the
 * other means either a dataset ships twice or a screen fetches a file that is
 * no longer deployed. test/privacy.test.mjs asserts they match.
 */
export const TOPICS = [
  "after", "adulterants", "checking", "comedown", "communities", "conditions",
  "consent", "descriptions", "education", "emerging", "heat", "index", "market",
  "name-warnings", "policy", "practice", "regional", "rx", "search-intents",
  "sex", "sitting", "stimulants", "supervision", "support", "testing",
];

async function main() {
  const bundle = {};
  const missing = [];
  for (const name of TOPICS) {
    const p = path.join(ROOT, "data", `${name}.json`);
    if (!existsSync(p)) { missing.push(name); continue; }
    bundle[name] = JSON.parse(await readFile(p, "utf8"));
  }
  if (missing.length) {
    throw new Error(`topic datasets missing: ${missing.join(", ")}`);
  }

  const json = JSON.stringify(bundle);
  await writeFile(path.join(ROOT, "data", "topics.json"), json + "\n");

  const raw = Buffer.byteLength(json);
  const gz = gzipSync(json).length;
  console.log(`data/topics.json  ${TOPICS.length} datasets`);
  console.log(`  raw        ${(raw / 1024).toFixed(0)} KB`);
  console.log(`  gzipped    ${(gz / 1024).toFixed(0)} KB   <- what a reader actually downloads`);

  /* A guardrail on the thing this trades away. If the bundle grows past a
     couple of hundred KB compressed, the honest answer is to split it by
     something that is NOT the reader's topic - never to go back to a file
     per page. */
  if (gz > 220 * 1024) {
    console.warn(`  WARNING: over 220 KB compressed. Do not solve this by splitting per topic.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
