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

/* Paths the web is allowed to reach. Everything else must be 404'd. */
const PUBLIC = new Set([
  "site",                  // the app
  "data",                  // its bundles, loaded by relative path
  "feeds",                 // per-county RSS, for external readers
  "index.html",            // redirects into site/
  "404.html",              // the page the 404 rules point at
  "netlify.toml",          // read by the platform, not served meaningfully
]);

/* Never checked in, or unreachable by the platform regardless. */
const IGNORED = new Set([
  ".git", ".github", ".claude", ".attic", ".gitignore", ".DS_Store", "node_modules",
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
console.log("  ok   only the app is reachable; every other published path is 404'd");
console.log("\n1 passed, 0 failed");
