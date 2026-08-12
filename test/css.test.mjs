/* The stylesheet must parse.
 *
 * Written after a rule silently stopped applying. An edit ate the opening
 * delimiter of a comment, leaving three lines of English prose sitting in the
 * stylesheet as raw CSS. The browser did what browsers do - discarded tokens
 * until it found something it recognised - and took the next rule with it. The
 * page looked fine, nothing errored, no test failed, and the affected numbers
 * quietly rendered as body text for two commits.
 *
 * CSS never throws. That is exactly why it needs a check of its own.
 */

import { readFileSync } from "node:fs";

const src = readFileSync("site/css/app.css", "utf8");
const fails = [];
const OPEN = "/" + "*";
const CLOSE = "*" + "/";

/* Comments, checked by walking rather than by regex - a regex cannot tell an
   orphaned closing delimiter from a legitimate one. */
let i = 0, line = 1, openedAt = -1;
while (i < src.length) {
  if (src[i] === "\n") line++;
  if (src.startsWith(OPEN, i)) {
    if (openedAt !== -1) fails.push(`line ${line}: comment opened inside an open comment`);
    openedAt = line; i += 2; continue;
  }
  if (src.startsWith(CLOSE, i)) {
    if (openedAt === -1) fails.push(`line ${line}: comment closed with nothing open — orphaned tail`);
    openedAt = -1; i += 2; continue;
  }
  i++;
}
if (openedAt !== -1) fails.push(`line ${openedAt}: comment opened and never closed`);

/* Braces, counted outside comments and strings. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"/g, '""');
const depth = [...code].reduce((d, c) => d + (c === "{") - (c === "}"), 0);
if (depth !== 0) fails.push(`brace balance is ${depth > 0 ? "+" : ""}${depth} — a block is unclosed`);

/* Prose loose in the stylesheet. A line outside a comment should carry a
   colon, a brace, an at-rule or a selector character. Bare English is what an
   eaten comment opener leaves behind. */
code.split("\n").forEach((raw, n) => {
  const t = raw.trim();
  if (!t) return;
  /* Continuation lines of a multi-line declaration look like prose to a
     naive check - "transform var(--t-tap) var(--ease-float)," has no colon of
     its own. Real prose carries none of CSS's punctuation at all. */
  if (/[(){};:]/.test(t) || t.includes("--") || t.endsWith(",")) return;
  if (/^[a-zA-Z][a-zA-Z ,'"-]{25,}$/.test(t)) {
    fails.push(`line ${n + 1}: prose outside a comment — "${t.slice(0, 52)}…"`);
  }
});

console.log("CSS\n");
if (fails.length) {
  for (const f of fails) console.log("  not ok " + f);
  console.log(`\n0 passed, ${fails.length} failed`);
  process.exit(1);
}
console.log("  ok   app.css parses: comments balanced, braces balanced, no loose prose");
console.log("\n1 passed, 0 failed");
