// Decide whether a commit is worth paying a production deploy for.
//
// Called from netlify.toml's `ignore`. Netlify's convention is inverted from
// the usual one: exit 0 means SKIP the build, non-zero means BUILD.
//
// WHY THIS EXISTS
//
// The ingest job runs every three hours and commits whenever `git diff` sees
// anything staged. It almost always sees something, because every run rewrites
// timestamps whether or not it found a single alert:
//
//   data/index.json          "generated" and 42 "t" fields
//   data/counties/*.json     "lastScan"
//   data/runs.json           one appended run record
//
// A run that publishes nothing still produces a commit whose entire diff is
// new clock readings. On 2026-08-13 three consecutive ingests each reported
// published: 0 and newClusters: 0, and each one triggered a full production
// deploy. Eight deploys a day to change nothing a reader can see - which is
// what exhausted the team's build credits and froze the site on a deploy from
// 02:18 while a day of real work sat unpublished.
//
// So: diff only the paths that are actually served, and where the change is
// confined to JSON whose only difference is a timestamp, skip it.
//
// CONSERVATIVE BY CONSTRUCTION. Every failure mode - no cached ref, a shallow
// clone that cannot reach it, unreadable JSON, an unparseable file, any
// non-data path touched - exits non-zero and builds. A missed deploy is worse
// than a wasted one, because a missed deploy means a county alert does not
// reach the person it is about.

import { execFileSync } from "node:child_process";

/* Paths a visitor can actually reach. Anything outside this list - tests,
   scripts, workflows, docs, the review queue - cannot change a byte anyone
   receives, and is not worth a deploy on its own. */
const SERVED = [
  "data", "site", "feeds", "index.html",
  "manifest.webmanifest", "netlify.toml", "_headers", "_redirects",
];

/* Fields that churn on every run without changing anything a reader can see.
   Verified against the real files - `t` appears 42 times in index.json alone.

   The first group is clock readings. The second is scan bookkeeping:
   sourcesChecked and sourcesFailed flip on every run because the ingest
   rotates which feeds it polls, and NEITHER IS RENDERED BY ANY VIEW - grep
   site/js, they appear only in data.js. If coverage is ever surfaced to a
   reader, take those two out of this list or their updates will stop shipping.

   If the ingest starts writing a new timestamp field, add it here, or every
   run will start paying for a deploy again. */
const VOLATILE = new Set([
  "generated", "t", "lastScan", "updated", "started", "finished",
  "at", "builtAt", "fetchedAt",
  "sourcesChecked", "sourcesFailed",
  "etag", "lastModified",
]);

/* Operational state, not content. None of these is fetched by the client -
   grep site/js and you will find runs.json referenced nowhere, and the dotfiles
   only inside unrelated words. They are HTTP etags, the source-rotation cursor,
   and the scan telemetry log (how many items were fetched, dropped, escalated),
   and every one of them changes on every single run.

   They are published at all only because publish = "." uploads the whole repo.
   Worth 404ing alongside the other server-side paths at some point; until then
   they must not be worth a deploy on their own. */
const INTERNAL = new Set([
  "data/.cache.json", "data/.rotation.json",
  "data/.medex.json", "data/runs.json",
]);

const BUILD = 1;
const SKIP = 0;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Recursively drop every volatile key, so two runs that differ only by when
 *  they ran compare equal. */
function stripVolatile(node) {
  if (Array.isArray(node)) return node.map(stripVolatile);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (VOLATILE.has(k)) continue;
      out[k] = stripVolatile(v);
    }
    return out;
  }
  return node;
}

function fileAt(ref, path) {
  try {
    return git(["show", `${ref}:${path}`]);
  } catch {
    return null;                       // added or deleted - a real change
  }
}

function main() {
  const before = process.env.CACHED_COMMIT_REF;
  const after = process.env.COMMIT_REF;
  if (!before || !after || before === after) return BUILD;

  let changed;
  try {
    changed = git(["diff", "--name-only", before, after, "--", ...SERVED])
      .split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return BUILD;                      // shallow clone cannot reach the ref
  }

  if (!changed.length) return SKIP;    // nothing served moved at all

  for (const path of changed) {
    if (INTERNAL.has(path)) continue;

    /* Anything that is not a JSON dataset is content by definition - CSS, a
       view, the shell, a redirect rule. Build. */
    if (!path.startsWith("data/") || !path.endsWith(".json")) return BUILD;

    const a = fileAt(before, path);
    const b = fileAt(after, path);
    if (a === null || b === null) return BUILD;   // added or removed

    let pa, pb;
    try {
      pa = stripVolatile(JSON.parse(a));
      pb = stripVolatile(JSON.parse(b));
    } catch {
      return BUILD;                    // unparseable - do not gamble
    }

    if (JSON.stringify(pa) !== JSON.stringify(pb)) return BUILD;
  }

  /* Every changed file was JSON whose only difference was a timestamp. */
  return SKIP;
}

let code;
try {
  code = main();
} catch {
  code = BUILD;                        // never let a crash suppress a deploy
}
process.exit(code);
