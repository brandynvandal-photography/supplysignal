/* THE SWEEP FINDS DATASETS AND NEVER TOUCHES A ROW.
 *
 * scripts/discover-sources.mjs is the weekly Socrata catalog sweep from
 * docs/ALERT-SOURCES.md step 7. It writes a list for a person; it ingests
 * nothing. Two things about it are worth holding with a test:
 *
 *   1. The ranking is the editorial part - what a reviewer sees first, and
 *      what never reaches them (the four datasets already ingested, anything
 *      they dismissed with a reason). Those rules are pure functions and are
 *      pinned here on fixtures shaped like real catalog responses.
 *   2. The date column it picks decides whether "latest" means anything. A
 *      death date beats an incident date beats a generic one, and a "year"
 *      aggregate column is never chosen, because max(year) says a dataset is
 *      current when it is an annual table.
 *
 * And one thing about its shape: the only request it makes to a dataset is
 * an aggregate ($select=max(...), count(*)). The source is checked for the
 * absence of any row-fetching query so that can never quietly change.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickDateColumn, rankCandidates, QUERIES } from "../scripts/discover-sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("DISCOVER\n");

ok(`there are catalog queries to run (${QUERIES.length})`, QUERIES.length >= 4);

/* ---- the date column ---- */
ok("a death date beats an incident date",
   pickDateColumn(["incident_date", "death_date", "age"], ["calendar_date", "calendar_date", "number"]) === "death_date");
ok("an incident date beats a generic one",
   pickDateColumn(["date_entered", "incident_date"], ["calendar_date", "calendar_date"]) === "incident_date");
ok("a text column named like a date is taken when nothing is typed as one",
   pickDateColumn(["death_date", "cause"], ["text", "text"]) === "death_date");
ok("a year column is never the freshness column",
   pickDateColumn(["year", "count"], ["number", "number"]) === null
   && pickDateColumn(["year", "date_updated"], ["number", "text"]) === null);

/* ---- the ranking ---- */
const hit = (id, domain, name, description = "", extra = {}) => ({
  resource: { id, name, description, columns_name: ["death_date", "cause"], columns_datatype: ["calendar_date", "text"], updatedAt: "2026-08-01T00:00:00.000Z", ...extra },
  metadata: { domain },
  permalink: `https://${domain}/d/${id}`,
  classification: { domain_category: "Public Health" },
});
const results = [
  hit("aaaa-0001", "data.example.gov", "Medical Examiner Overdose Deaths"),
  hit("aaaa-0001", "data.example.gov", "Medical Examiner Overdose Deaths"),          // duplicate across queries
  hit("cjeq-bs86", "datacatalog.cookcountyil.gov", "Medical Examiner Case Archive"),  // already ingested
  hit("bbbb-0002", "data.example.gov", "Naloxone administrations by EMS", "overdose responses"),
  hit("cccc-0003", "data.example.gov", "Library visits"),                             // not about this
  hit("dddd-0004", "data.example.gov", "Accidental overdose toxicology 2020-2026"),
  hit("eeee-0005", "data.example.gov", "Coroner overdose cases"),                     // dismissed by a person
];
const ranked = rankCandidates(results, { known: new Set(["cjeq-bs86"]), dismissed: new Set(["eeee-0005"]) });
const ids = ranked.map((c) => c.id);
ok("a dataset seen by two queries is listed once", ids.filter((i) => i === "aaaa-0001").length === 1);
ok("a dataset the app already ingests is never a candidate", !ids.includes("cjeq-bs86"));
ok("a dataset a reviewer dismissed stays dismissed", !ids.includes("eeee-0005"));
ok("a dataset that is not about overdose is dropped", !ids.includes("cccc-0003"));
ok("EMS naloxone counts are kept but flagged as noise",
   ranked.find((c) => c.id === "bbbb-0002")?.noisy === true
   && ranked.find((c) => c.id === "dddd-0004")?.noisy === false);
ok("every candidate carries a permalink, a date column and its column names",
   ranked.every((c) => c.permalink.startsWith("https://") && c.dateColumn === "death_date" && Array.isArray(c.columns)));

/* ---- shape: aggregates only ---- */
const src = readFileSync(path.join(ROOT, "scripts", "discover-sources.mjs"), "utf8");
const resourceCalls = [...src.matchAll(/\/resource\/\$\{[^}]+\}\.json\?([^`]+)`/g)].map((m) => m[1]);
ok(`the only dataset request is an aggregate (${resourceCalls.length} call site)`,
   resourceCalls.length === 1 && /\$select=max\(/.test(resourceCalls[0]) && /count\(\*\)/.test(resourceCalls[0]));
ok("no request asks for rows, columns or a $limit", !/\$limit|\$select=\*|SELECT \*/.test(src));
ok("the output goes to review/, which is never deployed", /review", "source-candidates\.json"/.test(src));

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   ${ranked.length} of ${results.length} fixture hits survive ranking; every dataset request is an aggregate`);
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
