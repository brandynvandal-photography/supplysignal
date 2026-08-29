/* The weekly refresh must not rewrite a dataset that did not change.
 *
 * WHY THIS EXISTS, and the history is the argument.
 *
 * All six reference datasets ended with `generated: new Date().toISOString()`,
 * so every refresh rewrote all six whether or not upstream had published
 * anything. The weekly diff was six files, one line each, and the line was the
 * clock. Twice, a human commit about something else swept a stale working copy
 * of data/ along with it and reverted those stamps - on 2026-08-18 and again on
 * 2026-08-24 - and nothing caught either one, because a one-line timestamp
 * revert inside a 500KB JSON file is indistinguishable from the churn the
 * refresh produces on its own. A pipeline that writes a change carrying no
 * information every week cannot signal the week it loses one that does.
 *
 * So: identical payload, identical bytes. Two things are checked, because this
 * breaks in two different ways.
 *
 *   1. stableStamp itself does what it says, including every failure case -
 *      it must never block a build.
 *   2. Every refresh script actually routes its write through it. The helper
 *      being correct is worth nothing if the seventh dataset added next year
 *      writes a bare timestamp, and that is exactly the kind of omission no
 *      unit test of the helper can see.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stableStamp } from "../scripts/stable.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const cases = [];
const check = (name, fn) => cases.push({ name, fn });

const dir = mkdtempSync(path.join(tmpdir(), "stable-"));
const tmp = (name) => path.join(dir, name);

/* ------------------------------------------------------- 1. the helper */

check("an unchanged payload keeps the stamp already on disk", () => {
  const f = tmp("a.json");
  writeFileSync(f, JSON.stringify({ generated: "2026-01-01T00:00:00.000Z", items: [1, 2] }));
  const out = stableStamp(f, { generated: "2026-09-09T00:00:00.000Z", items: [1, 2] });
  return out.generated === "2026-01-01T00:00:00.000Z"
    ? null : `kept ${out.generated}`;
});

check("byte-identical output, which is the property that matters", () => {
  /* The point is not the field. It is that git sees nothing. */
  const f = tmp("b.json");
  const before = JSON.stringify({ generated: "2026-01-01T00:00:00.000Z", items: [1, 2] });
  writeFileSync(f, before);
  const after = JSON.stringify(stableStamp(f, { generated: new Date().toISOString(), items: [1, 2] }));
  return after === before ? null : "rewritten bytes differ from what is on disk";
});

check("a changed payload takes the new stamp", () => {
  const f = tmp("c.json");
  writeFileSync(f, JSON.stringify({ generated: "2026-01-01T00:00:00.000Z", items: [1, 2] }));
  const out = stableStamp(f, { generated: "2026-09-09T00:00:00.000Z", items: [1, 2, 3] });
  return out.generated === "2026-09-09T00:00:00.000Z"
    ? null : "a real content change kept the old stamp - the refresh would be invisible";
});

check("one changed byte deep in the payload still counts as a change", () => {
  const f = tmp("d.json");
  writeFileSync(f, JSON.stringify({
    generated: "2026-01-01T00:00:00.000Z",
    reagents: { marquis: { fentanyl: "no reaction" } },
  }));
  const out = stableStamp(f, {
    generated: "2026-09-09T00:00:00.000Z",
    reagents: { marquis: { fentanyl: "purple" } },
  });
  return out.generated === "2026-09-09T00:00:00.000Z" ? null : "a nested change was missed";
});

check("a missing file writes, so a first build is never blocked", () => {
  const out = stableStamp(tmp("nope.json"), { generated: "2026-09-09T00:00:00.000Z", items: [] });
  return out.generated === "2026-09-09T00:00:00.000Z" ? null : "first build did not write";
});

check("unparseable JSON on disk is rewritten rather than trusted", () => {
  const f = tmp("e.json");
  writeFileSync(f, "{ truncated");
  const out = stableStamp(f, { generated: "2026-09-09T00:00:00.000Z", items: [] });
  return out.generated === "2026-09-09T00:00:00.000Z" ? null : "a corrupt file blocked the build";
});

check("a previous copy with no stamp is rewritten", () => {
  const f = tmp("f.json");
  writeFileSync(f, JSON.stringify({ items: [1, 2] }));
  const out = stableStamp(f, { generated: "2026-09-09T00:00:00.000Z", items: [1, 2] });
  return out.generated === "2026-09-09T00:00:00.000Z" ? null : "borrowed a stamp that was not there";
});

check("an array or a non-object on either side is passed through untouched", () => {
  const f = tmp("g.json");
  writeFileSync(f, JSON.stringify([1, 2, 3]));
  const payload = { generated: "2026-09-09T00:00:00.000Z", items: [] };
  if (stableStamp(f, payload).generated !== "2026-09-09T00:00:00.000Z") return "array on disk";
  if (stableStamp(f, [1, 2, 3])[0] !== 1) return "array payload was rewritten";
  if (stableStamp(f, null) !== null) return "null payload was rewritten";
  return null;
});

check("the payload is not mutated in place", () => {
  const f = tmp("h.json");
  writeFileSync(f, JSON.stringify({ generated: "2026-01-01T00:00:00.000Z", items: [] }));
  const payload = { generated: "2026-09-09T00:00:00.000Z", items: [] };
  stableStamp(f, payload);
  return payload.generated === "2026-09-09T00:00:00.000Z"
    ? null : "caller's object was mutated";
});

/* ------------------------------------- 2. every refresh script uses it */

/* The six datasets refresh.yml rebuilds weekly. Anything added to that
   workflow belongs here too - which is the omission this check exists to
   catch, since a new script writing a bare timestamp would restore the exact
   condition described at the top of this file. */
const REFRESH_BUILDS = [
  "build-substances.mjs",
  "build-combos.mjs",
  "build-reagents.mjs",
  "build-emerging.mjs",
  "build-regional.mjs",
  "build-mortality.mjs",
];

check("every dataset refresh.yml rebuilds writes through stableStamp", () => {
  const bad = [];
  for (const f of REFRESH_BUILDS) {
    const src = readFileSync(path.join(ROOT, "scripts", f), "utf8");
    if (!/from "\.\/stable\.mjs"/.test(src)) bad.push(`${f}: does not import stable.mjs`);
    else if (!/stableStamp\s*\(/.test(src)) bad.push(`${f}: imports stableStamp but never calls it`);
  }
  return bad.length ? bad.join("; ") : null;
});

check("refresh.yml rebuilds exactly the datasets checked above", () => {
  /* Guards the list itself. A seventh build step added to the workflow without
     a line here would leave this file quietly checking six of seven. */
  const yml = readFileSync(path.join(ROOT, ".github/workflows/refresh.yml"), "utf8");
  const run = [...yml.matchAll(/npm run (build:[a-z]+)/g)].map((m) => m[1]);
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
  const scripts = new Set();
  for (const r of run) {
    for (const m of String(pkg[r] || "").matchAll(/scripts\/([a-z-]+\.mjs)/g)) scripts.add(m[1]);
  }
  if (!scripts.size) return "resolved no build scripts from refresh.yml - this check is not checking anything";
  const missing = [...scripts].filter((s) => !REFRESH_BUILDS.includes(s));
  return missing.length
    ? `refresh.yml builds ${missing.join(", ")}, which REFRESH_BUILDS does not list`
    : null;
});

/* --------------------------------------------------------------- run */

console.log("STABLE\n");
let failed = 0;
for (const c of cases) {
  let err = null;
  try { err = c.fn(); } catch (e) { err = e.message; }
  if (err) { failed++; console.log(`  not ok ${c.name}\n      ${err}`); }
  else console.log(`  ok   ${c.name}`);
}
rmSync(dir, { recursive: true, force: true });
console.log(`\n${cases.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
