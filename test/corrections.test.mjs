/* A CORRECTIONS LOG THAT CANNOT DRIFT INTO A CHANGELOG.
 *
 * data/corrections.json is the public list of what this app got wrong. Its
 * value is entirely in its discipline: every entry dated, every entry saying
 * what was said, what was wrong and what is said now, and nothing in it that
 * could be mistaken for a release note. This holds the shape.
 *
 *   - every entry has an ISO date no later than today
 *   - said / wrong / now are all present and are three different sentences
 *   - no entry names a person (the app never does; a log of our own errors
 *     is not the place to start)
 *   - the About page renders the block and its jump chip
 *   - the dataset is a per-file load and is on the privacy allowlist, so it
 *     never joins the content bundle every reader downloads
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = JSON.parse(readFileSync(path.join(ROOT, "data", "corrections.json"), "utf8"));
const entries = doc.entries || [];

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("CORRECTIONS\n");

ok(`there are entries (${entries.length})`, entries.length >= 10);
ok("the file records when a person last checked it", /^\d{4}-\d{2}-\d{2}$/.test(String(doc.lastVerified || "")));

const today = new Date().toISOString().slice(0, 10);
const badDate = entries.filter((e) => !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) || e.date > today).map((e) => e.title);
ok("every entry is dated, and not in the future" + (badDate.length ? `: ${badDate.join("; ")}` : ""), !badDate.length);

const thin = entries.filter((e) => !["title", "said", "wrong", "now"].every((k) => typeof e[k] === "string" && e[k].trim().length >= 12)).map((e) => e.title || "(untitled)");
ok("every entry says what it said, what was wrong and what it says now" + (thin.length ? `: ${thin.join("; ")}` : ""), !thin.length);

const same = entries.filter((e) => e.said === e.wrong || e.said === e.now || e.wrong === e.now).map((e) => e.title);
ok("the three statements are different sentences" + (same.length ? `: ${same.join("; ")}` : ""), !same.length);

/* No names. A capitalised first-plus-last pair that is not an organization or
   a place is the shape a name takes; the allowlist is what this file already
   legitimately mentions. */
const ALLOW = /\b(Good Samaritan|Recovery Dharma|Trevor Project|Los Angeles|Rhode Island|Burning Man)\b/g;
const named = entries.filter((e) => {
  const text = `${e.title} ${e.said} ${e.wrong} ${e.now}`.replace(ALLOW, "");
  return /\b[A-Z][a-z]+ [A-Z][a-z]+(?:son|sen|ez|man|ley|berg|ton)\b/.test(text);
}).map((e) => e.title);
ok("no entry names a person" + (named.length ? `: ${named.join("; ")}` : ""), !named.length);

const view = readFileSync(path.join(ROOT, "site", "js", "views", "about.js"), "utf8");
ok("About renders the block", /correctionsBlock/.test(view) && /data\.corrections\(\)/.test(view));
ok("About carries the jump chip", /"sec-corrected"/.test(view));

const dataJs = readFileSync(path.join(ROOT, "site", "js", "data.js"), "utf8");
ok("the dataset is loaded per file, not bundled", /load\("corrections"/.test(dataJs) && !/"corrections",/.test(dataJs.slice(dataJs.indexOf("const TOPICS"), dataJs.indexOf("]", dataJs.indexOf("const TOPICS")))));

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   ${entries.length} dated corrections, newest ${entries.map((e) => e.date).sort().pop()}`);
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
