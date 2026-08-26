/* THE MENU BAR IS LOCKED.
 *
 * Asked for on 2026-08-26, after an evening in which the tab bar was changed
 * eleven times chasing one report and ended up somewhere the reader is happy
 * with. The point of this file is that the next change to it has to be
 * deliberate: nobody edits those rules by accident, or as a side effect of
 * touching something near them, without the suite saying so.
 *
 * HOW IT WORKS. Every rule in app.css whose selector mentions .nav is hashed -
 * selector and declarations, whitespace normalised so reformatting is not a
 * failure - and compared with the digest below. Any edit, addition or deletion
 * moves the digest and fails this test with the rule that moved.
 *
 * WHEN YOU MEANT IT. Run `node test/navlock.test.mjs --update`, read what it
 * prints, and paste the new digest in. That is deliberately a manual step: the
 * whole value here is that it cannot happen silently.
 *
 * WHAT IT DOES NOT DO. It pins the CSS, not the rendering. A change to --ink,
 * --ident or the class tokens still moves what the bar looks like without
 * moving this digest, because those live outside these rules and belong to the
 * whole app. The colours the bar actually resolves to are checked in
 * css.test.mjs, which is the right place for them.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = new URL("../site/css/app.css", import.meta.url);
const css = readFileSync(path, "utf8");

/* Comments out first, so rewording a note is not a "change to the menu bar" -
   the rules are what is locked, not the prose around them. */
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

/* Every rule whose selector names .nav, flattened and normalised. Media
   queries are transparent here: their contents are matched as ordinary rules,
   which is what we want - a rule moving between breakpoints IS a change. */
const rules = [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, sel, body]) => ({
    sel: sel.trim().replace(/\s+/g, " "),
    body: body.trim().replace(/\s+/g, " ").replace(/;\s*$/, ""),
  }))
  .filter((r) => /(^|[\s,>+~])\.nav\b/.test(r.sel) && r.body)
  .map((r) => `${r.sel}{${r.body}}`)
  .sort();

const digest = createHash("sha256").update(rules.join("\n")).digest("hex").slice(0, 16);

/* The locked state. Update ONLY with --update, and only when the change was
   intended - see the header. */
const LOCKED = "bdba6201b4cb552a";
const LOCKED_COUNT = 53;

if (process.argv.includes("--update")) {
  console.log(`\n  ${rules.length} nav rules, digest ${digest}\n`);
  console.log("  Paste these into test/navlock.test.mjs:\n");
  console.log(`    const LOCKED = "${digest}";`);
  console.log(`    const LOCKED_COUNT = ${rules.length};\n`);
  process.exit(0);
}

const fails = [];
if (rules.length !== LOCKED_COUNT) {
  fails.push(`the menu bar has ${rules.length} rules, locked at ${LOCKED_COUNT}`);
}
if (digest !== LOCKED) {
  fails.push(
    `the menu bar stylesheet changed (digest ${digest}, locked ${LOCKED}). `
    + "If that was deliberate, run: node test/navlock.test.mjs --update",
  );
}

console.log("NAV LOCK\n");
for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   ${rules.length} menu bar rules unchanged (${digest})`);
console.log(`\n${fails.length ? 0 : 1} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
