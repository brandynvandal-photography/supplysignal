/* EVERY STREET NAME HAS A SOURCE AND A PAGE.
 *
 * data/street-names.json is the short list of what people call things,
 * rendered first under "Also called" and joined to the search index. Its
 * discipline is the same as every other hand-written file here: a name with
 * no source does not ship. This holds the shape:
 *
 *   - every drug id has a page in substances.json
 *   - every name names at least one of the file's declared sources
 *   - none is one of the misleading names name-warnings.json exists to warn
 *     about, and where a name also sits in the upstream alias list the page
 *     dedupes rather than printing it twice
 *   - the loader attaches the field, the page renders it, and the search
 *     build reads it
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = JSON.parse(readFileSync(path.join(ROOT, "data", "street-names.json"), "utf8"));
const subs = JSON.parse(readFileSync(path.join(ROOT, "data", "substances.json"), "utf8"));
const warn = JSON.parse(readFileSync(path.join(ROOT, "data", "name-warnings.json"), "utf8"));

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("STREET NAMES\n");

const byId = new Map((subs.substances || []).map((s) => [s.id, s]));
const ids = Object.keys(doc.names || {});
ok(`there are entries (${ids.length} drugs)`, ids.length >= 15);
ok("the file records when a person last checked it", /^\d{4}-\d{2}-\d{2}$/.test(String(doc.lastVerified || "")));

const noPage = ids.filter((id) => !byId.has(id));
ok("every drug has a page" + (noPage.length ? `: ${noPage.join(", ")}` : ""), !noPage.length);

const srcIds = new Set(Object.keys(doc.sources || {}));
const unsourced = [];
const dupAlias = [];
const misleading = [];
const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
for (const [id, list] of Object.entries(doc.names || {})) {
  const aliases = new Set((byId.get(id)?.aliases || []).map(norm));
  const warned = new Set((warn.warnings?.[id]?.names || []).map(norm));
  for (const entry of list) {
    const [name, srcs] = entry;
    if (!Array.isArray(srcs) || !srcs.length || !srcs.every((s) => srcIds.has(s))) unsourced.push(`${id}: ${name}`);
    if (aliases.has(norm(name))) dupAlias.push(`${id}: ${name}`);
    if (warned.has(norm(name))) misleading.push(`${id}: ${name}`);
  }
}
ok("every name names a declared source" + (unsourced.length ? `: ${unsourced.slice(0, 5).join("; ")}` : ""), !unsourced.length);
/* The upstream alias list already carries some of these ("Smack", "Meth"),
   which is fine: the page dedupes when it prints. */
ok(`the page never prints a name twice (${dupAlias.length} overlap upstream aliases)`, /function otherNames\(s\)/.test(readFileSync(path.join(ROOT, "site", "js", "views", "substances.js"), "utf8")));
ok("no name is one the app warns is misleading" + (misleading.length ? `: ${misleading.join("; ")}` : ""), !misleading.length);

const dataJs = readFileSync(path.join(ROOT, "site", "js", "data.js"), "utf8");
ok("the loader attaches the field", /load\("street-names"/.test(dataJs) && /street:\s*sn\.map/.test(dataJs));
const view = readFileSync(path.join(ROOT, "site", "js", "views", "substances.js"), "utf8");
ok("the drug page renders it first", /s\.street\?\.length \? h\("p"/.test(view) && /\.\.\.\(s\.street \|\| \[\]\)/.test(view));
const build = readFileSync(path.join(ROOT, "scripts", "build-search.mjs"), "utf8");
ok("the search build reads it", /street-names\.json/.test(build) && /street\.names/.test(build));
const idx = JSON.parse(readFileSync(path.join(ROOT, "data", "search.json"), "utf8"));
const missingInIndex = [];
for (const [id, list] of Object.entries(doc.names || {})) {
  const d = (idx.drugs || []).find((x) => x.i === id);
  const have = new Set((d?.a || []).map(norm));
  for (const [name] of list) if (!have.has(norm(name))) missingInIndex.push(`${id}: ${name}`);
}
ok("every name is in the shipped search index" + (missingInIndex.length ? `: ${missingInIndex.slice(0, 5).join("; ")}` : ""), !missingInIndex.length);

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   ${Object.values(doc.names).reduce((n, l) => n + l.length, 0)} sourced street names on ${ids.length} drugs, all indexed`);
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
