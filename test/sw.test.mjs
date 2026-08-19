/* The service worker cache version must move when the code it caches moves.
 *
 * WHY THIS EXISTS
 *
 * site/sw.js serves stale-while-revalidate: a returning reader gets the CACHED
 * copy first and the fresh one lands for next time. That is the right trade
 * for data that updates hourly and must never block an emergency lookup on a
 * network. It is the wrong behaviour for a bug fix, because the fix does not
 * reach anybody who has opened the app before until the cache is dropped -
 * which only happens when VERSION changes.
 *
 * On 2026-08-13 that cost a whole feature. "Near me" was broken in production
 * because alerts.js imported ../../../src/locate.mjs and a 404 rule had been
 * added over /src/*. The import was fixed, deployed and verified live - and
 * Near me stayed broken, because the cached alerts.js still had the old path.
 * Confirmed by reading the live cache: the entry for alerts.js matched
 * /src\/locate\.mjs/ while the deployed file did not.
 *
 * sw.js had carried a comment saying to bump VERSION on any release that
 * changes the shell since the file was written. The comment did not work. A
 * test does.
 *
 * WHAT IS HASHED: every .js and .css under site/, plus site/index.html. That
 * is the set where a stale copy is a BUG rather than merely old content - a
 * stale dataset shows yesterday's alerts, which is the documented and accepted
 * behaviour, but stale code reintroduces bugs that were already fixed.
 * sw.js itself is excluded, or the hash could never settle: writing the new
 * value into the file would change the file.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const cached = walk(SITE)
  .filter((p) => /\.(js|css)$/.test(p) || p.endsWith(`${path.sep}index.html`))
  .filter((p) => path.basename(p) !== "sw.js")
  .sort();

const h = createHash("sha256");
for (const f of cached) {
  h.update(path.relative(ROOT, f));
  h.update(readFileSync(f));
}
const expected = `nl-${h.digest("hex").slice(0, 8)}`;

const sw = readFileSync(path.join(SITE, "sw.js"), "utf8");
const m = sw.match(/const VERSION = "([^"]+)"/);

const fails = [];
if (!m) {
  fails.push(`no \`const VERSION = "..."\` found in site/sw.js`);
} else if (m[1] !== expected) {
  fails.push(
    `site/sw.js VERSION is "${m[1]}" but the ${cached.length} cached files hash to "${expected}".\n` +
    `      Something under site/ changed without the cache being dropped, so returning\n` +
    `      users would keep the old copy. Set it to:  const VERSION = "${expected}";`
  );
}

/* THE PAGE'S WARM LIST IS THE WORKER'S SHELL LIST.
 *
 * app.js re-fetches the shell after its boot cache sweep (see warmShell there
 * for why the worker's own precache is not enough), and it has to name the
 * files itself because a classic worker script cannot be imported by the
 * page. Two copies of one list drift, and the drift is silent: a file added
 * to SHELL but not to WARM is precached on install and gone after the first
 * reload; a file in WARM but not in SHELL is a request the page makes for
 * nothing. Both arrays are read out of the source and compared as sets. */
const shellFails = [];
const listOf = (src, name, file) => {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) { shellFails.push(`no \`const ${name} = [...]\` found in ${file}`); return null; }
  return [...m[1].replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
};
const shell = listOf(sw, "SHELL", "site/sw.js");
const warm = listOf(readFileSync(path.join(SITE, "js", "app.js"), "utf8"), "WARM", "site/js/app.js");
if (shell && warm && shell.join("\n") !== warm.join("\n")) {
  shellFails.push(
    `site/sw.js SHELL and site/js/app.js WARM disagree.\n` +
    `      SHELL: ${shell.join(", ")}\n      WARM:  ${warm.join(", ")}`);
}
if (shell && !shell.includes("./js/views/help.js")) {
  shellFails.push("site/sw.js SHELL does not precache ./js/views/help.js - the emergency page would need the network on first open");
}

console.log("SW");
for (const f of [...fails, ...shellFails]) console.log(`  not ok ${f}`);
if (!fails.length) console.log(`  ok   cache version matches ${cached.length} cached files (${expected})`);
if (!shellFails.length) console.log(`  ok   SHELL precache and the page's WARM list agree (${shell.length} entries, emergency page included)`);
const failed = (fails.length ? 1 : 0) + (shellFails.length ? 1 : 0);
console.log(`\n${2 - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
