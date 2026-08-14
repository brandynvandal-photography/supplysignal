/* Nothing but the app may be reachable on the web.
 *
 * netlify.toml publishes the repository root, because site/ loads
 * ../data/*.json and the two have to stay siblings. The cost is that every
 * other directory is uploaded too - and they were live:
 *
 *   /review/pending.json  200  UNREVIEWED classifier output, whose first item
 *                              named a real person and their drug test result
 *   /src/store.mjs        200  ingest internals
 *   /config/settings.json 200  feed configuration
 *   /package.json         200  dependency inventory
 *
 * That is a PII leak on a harm reduction site, from a repo whose README
 * promises no PII is ever stored or displayed.
 *
 * The deploy config uses a DENYLIST, because Netlify cannot express a real
 * allowlist here - a forced catch-all would swallow /site and /data with it.
 * A denylist fails open: add a top-level directory, and it ships public unless
 * somebody remembers. This test is what remembers.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";

const toml = readFileSync("netlify.toml", "utf8");

/* Paths the web is allowed to reach.
 *
 * This list used to be checked against a DENYLIST of 404 rules over a
 * whole-repo deploy. That control was bypassable by changing one letter's case
 * (Netlify matches redirects case-sensitively — /Src/ingest.mjs returned 200
 * in production), so the deploy now publishes a staged dist/ containing only
 * the allowlist in scripts/build-site.mjs. This file checks the two lists
 * agree, which is the property that now matters. */
const PUBLIC = new Set([
  "site",                  // the app
  "data",                  // its bundles, loaded by relative path
  "feeds",                 // per-county RSS, for external readers
  "index.html",            // redirects into site/
  "404.html",              // the page the 404 rules point at
  "netlify.toml",          // read by the platform, not served meaningfully

  /* Required by App Store Connect, which will not accept a submission without
     a working privacy policy URL and a support URL, and a reviewer opens both.
     These two are the ONLY pages in the repo that are deliberately indexable -
     the app itself is noindex, because a search result for it outs the reader.
     Self-contained: their own CSP, no stylesheet, no font, no script. */
  "privacy",
  /* Was "support" until 2026-08-14, when the app's own Support TAB took that
     path. netlify.toml 301s the old URL here so an already-submitted App Store
     Connect Support URL keeps working. */
  "app-support",
]);

/* The deploy's real allowlist. If these two ever disagree, either something
   server-side is about to ship or something the app needs is about to vanish. */
import { PUBLIC as STAGED, SKIP_IN_DATA } from "../scripts/build-site.mjs";

/* Never checked in, or unreachable by the platform regardless. */
const IGNORED = new Set([
  ".git", ".github", ".claude", ".attic", ".gitignore", ".DS_Store", "node_modules",
  "www",   // build output of scripts/build-app.mjs, gitignored, never deployed
  "dist",  // build output of scripts/build-site.mjs — this IS the deploy, staged
]);

const blocked = new Set();
for (const m of toml.matchAll(/from\s*=\s*"\/([^"*]*)\*?"[\s\S]{0,120}?status\s*=\s*404/g)) {
  blocked.add(m[1].replace(/\/$/, ""));
}
/* Markdown is blocked file by file, not by wildcard: Netlify's splat matches
   path segments, so "/*.md" never matched /README.md. Verified live - it kept
   returning 200 while every other rule worked. So each doc must appear by
   name, and this test checks for exactly that rather than for the pattern. */

const fails = [];
for (const entry of readdirSync(".")) {
  if (IGNORED.has(entry) || PUBLIC.has(entry)) continue;
  const isDir = statSync(entry).isDirectory();
  if (!blocked.has(entry)) {
    fails.push(
      `${isDir ? "directory" : "file"} "${entry}" is published but has no 404 rule in netlify.toml ` +
      `— add one, or add it to PUBLIC here if it is genuinely meant to be on the web`);
  }
}

/* The check that replaces the old denylist reasoning.
 *
 * The denylist was the mechanism until 2026-08-14, when production answered
 * /Src/ingest.mjs with 200 — Netlify matches redirects case-sensitively, so
 * one capital letter reached every server-side file. The deploy now publishes
 * a staged dist/ built from an explicit allowlist, and the property worth
 * testing is that this file's idea of what is public and the build script's
 * are the same list. The 404 rules stay as defence in depth and are still
 * checked below. */
{
  const staged = new Set(STAGED);
  const documented = new Set(PUBLIC);
  documented.delete("netlify.toml");        // read by the platform, never served
  for (const x of staged) {
    if (!documented.has(x)) fails.push(`build-site stages "${x}" but PUBLIC here does not list it`);
  }
  for (const x of documented) {
    if (!staged.has(x)) fails.push(`PUBLIC lists "${x}" but build-site never stages it`);
  }
  for (const n of [".cache.json", ".rotation.json", ".medex.json", "runs.json"]) {
    if (!SKIP_IN_DATA.has(n)) fails.push(`internal data/${n} would be staged into the deploy`);
  }
}

/* Forced, or Netlify serves the real file and ignores the rule entirely. */
for (const m of toml.matchAll(/\[\[redirects\]\]([\s\S]*?)(?=\[\[|$)/g)) {
  const b = m[1];
  if (/status\s*=\s*404/.test(b) && !/force\s*=\s*true/.test(b)) {
    fails.push(`a 404 rule is missing force = true — Netlify serves the file on disk instead: ${b.trim().split("\n")[0]}`);
  }
}

console.log("PUBLISH\n");
if (fails.length) {
  for (const f of fails) console.log("  not ok " + f);
  console.log(`\n0 passed, ${fails.length} failed`);
  process.exit(1);
}
console.log("  ok   the deploy stages an allowlist, and it matches the documented one");
console.log("\n1 passed, 0 failed");
