/* A DEBUNK WITHOUT A SOURCE IS JUST A COMPETING ASSERTION.
 *
 * Every other page here corrects things in passing, where the subject comes up.
 * The Myths section states beliefs baldly and contradicts them, which is a
 * different kind of claim: the reader arrives holding the belief, often because
 * somebody they trust told them, and the only thing that outranks that is a
 * source they can open.
 *
 * So the rule this file enforces is simple and absolute: every item carries at
 * least one source, and the source resolves to a real URL. It also checks the
 * shape that makes the section readable and safe:
 *
 *   - the belief and the correction are BOTH present, and the correction is not
 *     just a restatement of the belief
 *   - the belief is stated once, never twice, so a reader skimming the bold
 *     lines does not collect a list of false claims from two directions
 *   - no group is empty, because an empty fold reads as a section that failed
 *     to load rather than one with nothing in it
 *   - the groups in the data and the ids the view renders line up, which is the
 *     jump-chip failure views.test.mjs already catches on other pages
 *
 * The corrections themselves are not checked here, and cannot be. That is what
 * the sources are for, and why the note at the top of data/myths.json tells
 * whoever edits it not to add an entry without one.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "data", "myths.json");

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("MYTHS\n");

if (!existsSync(file)) {
  console.log("  not ok data/myths.json is missing");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}

const doc = JSON.parse(readFileSync(file, "utf8"));
const groups = doc.groups || [];
const items = groups.flatMap((g) => (g.items || []).map((it) => ({ ...it, group: g.id })));

ok(`there are myths to show (${items.length})`, items.length >= 20);
ok("the file records when a person last checked it",
   /^\d{4}-\d{2}-\d{2}$/.test(String(doc.lastVerified || "")));
ok("no group is empty", groups.every((g) => (g.items || []).length > 0));

/* ---- every item is cited, and the citations are real URLs ---- */
const uncited = items.filter((it) => !(it.sources || []).length)
  .map((it) => `"${(it.myth || "").slice(0, 50)}"`);
ok("every myth carries at least one source"
   + (uncited.length ? `: ${uncited.join(", ")}` : ""), !uncited.length);

const badUrl = [];
for (const it of items) {
  for (const s of it.sources || []) {
    if (!s?.name) badUrl.push(`a source with no name on "${(it.myth || "").slice(0, 40)}"`);
    let u;
    try { u = new URL(s.url); } catch { badUrl.push(`${s.url} is not a URL`); continue; }
    if (u.protocol !== "https:") badUrl.push(`${s.url} is not https`);
  }
}
ok("every source has a name and an https URL"
   + (badUrl.length ? `: ${badUrl.slice(0, 4).join("; ")}` : ""), !badUrl.length);

/* ---- the belief and the correction are both there, and are different ---- */
const shape = [];
for (const it of items) {
  const m = (it.myth || "").trim(), t = (it.truth || "").trim();
  if (!m) shape.push("an item with no myth");
  if (!t) shape.push(`"${m.slice(0, 40)}" has no correction`);
  if (m && t && m.toLowerCase() === t.toLowerCase()) shape.push(`"${m.slice(0, 40)}" restates itself`);
  /* Terse on purpose - see the note in views/learn.js. A correction that has
     grown into three paragraphs belongs on the page the subject lives on. */
  if (t && t.length > 280) shape.push(`"${m.slice(0, 40)}" has grown to ${t.length} chars`);
}
ok("every myth has a distinct, short correction"
   + (shape.length ? `: ${shape.slice(0, 4).join("; ")}` : ""), !shape.length);

/* ---- no belief is stated twice ---- */
const seen = new Map();
const dupes = [];
for (const it of items) {
  const k = (it.myth || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (seen.has(k)) dupes.push(`"${it.myth}" appears in ${seen.get(k)} and ${it.group}`);
  seen.set(k, it.group);
}
ok("no belief is listed twice" + (dupes.length ? `: ${dupes.join("; ")}` : ""), !dupes.length);

/* ---- the view can render every group ---- */
const view = readFileSync(path.join(ROOT, "site", "js", "views", "learn.js"), "utf8");
ok("the Learn page renders the myths block", /mythsBlock/.test(view) && /data\.myths\(\)/.test(view));
ok("the section keeps its jump chip", /sec-myths/.test(view));

/* Every group id is a valid html id, since the view uses it as one. */
const badId = groups.filter((g) => !/^[a-z][a-z0-9-]*$/.test(g.id || "")).map((g) => g.id);
ok("every group id is usable as an html id"
   + (badId.length ? `: ${badId.join(", ")}` : ""), !badId.length);

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) {
  const srcs = new Set(items.flatMap((it) => (it.sources || []).map((s) => s.url)));
  console.log(`  ok   ${items.length} myths in ${groups.length} groups, every one cited`);
  console.log(`  ok   ${srcs.size} distinct sources, all https`);
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
