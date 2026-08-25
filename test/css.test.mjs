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

/* Focus rings under clipping containers are drawn INSIDE the box.
 *
 * details.disc, details.acc, .list and .jump .chips all clip their children
 * (overflow: hidden, or overflow-x: auto under a mask), so the default ring -
 * 3px outside the element, 2px out - was painted into the clip and never seen.
 * Closed disclosures are most of the controls on Test, Support and Learn, so
 * tabbing through those pages looked like focus had been lost. The fix is one
 * declaration, outline-offset: -3px, on exactly the controls those containers
 * hold - and one declaration is exactly the kind of thing that gets tidied out
 * of a 4,000-line stylesheet by someone who cannot see what it was for. So the
 * selectors are named here and each has to carry it. */
const INSET = [
  "details.disc > summary",
  "details.acc > summary",
  ".list > .nbr",
  ".jump .chip",
  ".nav a",
];
const insetFails = [];
for (const sel of INSET) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /* The selector, optionally suffixed :focus-visible, anywhere in a rule's
     selector list, whose block sets outline-offset to -3px. */
  const re = new RegExp(`(^|[,\\s])${esc}(:focus-visible)?\\s*[^{}]*\\{[^}]*outline-offset:\\s*-3px`, "m");
  if (!re.test(code)) insetFails.push(`\`${sel}\` does not carry outline-offset: -3px — its focus ring is clipped by its container`);
}

/* The smallest text comes from the token, never from a literal.
 *
 * --fs-xs is the floor for anything a reader has to read: 12.5px at the
 * default size. Before it existed the small tiers were typed out by hand -
 * .72rem here, .74 there, .76 in a third place - and the smallest of them sat
 * at 12.24px. A literal below the token is how that creeps back one rule at
 * a time, so every bare rem font-size in the file has to clear it. Only bare
 * literals are checked: a capped value like the tab bar's min(.72rem, 13px)
 * is chrome that deliberately stops scaling and is not a reading size. */
const fsFails = [];
{
  const floor = parseFloat(code.match(/--fs-xs:\s*([\d.]+)rem/)?.[1]);
  if (!Number.isFinite(floor)) fsFails.push("--fs-xs is not declared as a rem value in the token block");
  else {
    code.split("\n").forEach((raw, n) => {
      const m = raw.match(/font-size:\s*([\d.]+)rem/);
      if (m && parseFloat(m[1]) < floor) {
        fsFails.push(`line ${n + 1}: font-size ${m[1]}rem is below --fs-xs (${floor}rem) - use the token`);
      }
    });
  }
}

/* THE hidden ATTRIBUTE MUST BEAT A COMPONENT'S OWN display.
 *
 * `[hidden] { display: none }` is a user-agent rule, and any author rule that
 * sets display at all outranks it. So a component declaring its own display
 * stays on screen with hidden="" set. That shipped as an empty white pill
 * beside "add another reagent" on the tracker, and had already been patched
 * three separate times per-component before that (tr, details, .totop), which
 * is the shape of a rule that wants to be global. This fails if the global one
 * is ever removed. */
const hiddenFails = [];
{
  const rule = /(^|[},;\s])\[hidden\]\s*\{[^}]*display:\s*none\s*!important/m;
  if (!rule.test(code)) {
    hiddenFails.push(
      "no global `[hidden] { display: none !important }`. Without it, any component "
      + "that sets its own display ignores the hidden attribute and renders as an "
      + "empty control.",
    );
  }
}

/* THE FOOT MUST RESERVE THE FLOATING BUTTON'S BAND.
 *
 * .totop is fixed --totop-bottom from the bottom and --totop-size tall, so it
 * covers that whole band at the foot of every handheld page. .foot is the last
 * element on the page - a SIBLING of main, so main's own padding does nothing
 * for it - and twice now its bottom padding has been computed from the tab bar
 * alone, leaving "About this site" underneath the button. The second time, the
 * reserve was added to main instead and only moved the gap above the footer.
 *
 * Both numbers come from --totop-bottom now. This asserts they still do: the
 * button's `bottom` and the footer's reserve must each name that token, so a
 * future edit to one cannot silently walk away from the other. */
const reserveFails = [];
{
  const block = (sel) => {
    const i = src.indexOf(sel + " {");
    return i === -1 ? "" : src.slice(i, src.indexOf("}", i));
  };
  const foot = block(".foot");
  const totop = block(".totop");
  if (!foot) reserveFails.push("no .foot rule found to check the button's reserve against.");
  else if (!/padding:[^;]*--totop-bottom/.test(foot) && !/padding-bottom:[^;]*--totop-bottom/.test(foot)) {
    reserveFails.push(
      ".foot does not reserve the floating button's band. Its bottom padding must "
      + "be derived from --totop-bottom plus --totop-size, or the last element on "
      + "the page sits under the back-to-top button on every phone.",
    );
  } else if (!/--totop-size/.test(foot)) {
    reserveFails.push(
      ".foot clears where the button starts but not its height: the reserve needs "
      + "--totop-size as well as --totop-bottom.",
    );
  }
  if (totop && !/bottom:\s*var\(--totop-bottom\)/.test(totop)) {
    reserveFails.push(
      ".totop computes its own bottom instead of reading --totop-bottom. The "
      + "footer's reserve is measured from that token; if the button stops using "
      + "it the two drift apart, which is exactly how this broke before.",
    );
  }
}

/* THE AGE FADE MUST DRAIN COLOUR, NOT CONTRAST.
 *
 * The severity rail is mixed toward a neutral as a finding ages. Mixing toward
 * --line-2 was the first attempt and it was wrong: that colour sits near the
 * card behind it, so each step spent luminance as well as chroma and the
 * oldest band measured 2.71:1 in the light theme, under the 3:1 that 1.4.11
 * asks of non-text. It passed in dark, which is where it was measured first.
 *
 * --ink-3 is body-text ink, so a mix bounded by it is legible by construction
 * in both themes. This asserts the mix target, because the failure it prevents
 * is invisible in one theme and silent in the other. */
const fadeFails = [];
{
  const i = src.indexOf(".card--critical, .card--elevated, .card--advisory {");
  const rule = i === -1 ? "" : src.slice(i, src.indexOf("}", i));
  if (!rule) {
    fadeFails.push("no combined severity-rail rule found to check the age fade against.");
  } else if (!/--sev-strength/.test(rule)) {
    fadeFails.push("the severity rail no longer reads --sev-strength, so alert cards cannot age.");
  } else if (/color-mix/.test(rule) && /--line-2/.test(rule)) {
    fadeFails.push(
      "the age fade mixes toward --line-2, which sits near the card background: "
      + "every step spends contrast as well as colour and the oldest band drops "
      + "under 3:1 in the light theme. Mix toward --ink-3.",
    );
  } else if (!(/color-mix/.test(rule) && /--ink-3/.test(rule))) {
    fadeFails.push("the age fade should mix toward --ink-3, which is legible by construction in both themes.");
  }
}

console.log("CSS\n");
if (fails.length) {
  for (const f of fails) console.log("  not ok " + f);
}
if (insetFails.length) {
  for (const f of insetFails) console.log("  not ok " + f);
}
if (fsFails.length) {
  for (const f of fsFails) console.log("  not ok " + f);
}
if (hiddenFails.length) {
  for (const f of hiddenFails) console.log("  not ok " + f);
}
if (reserveFails.length) {
  for (const f of reserveFails) console.log("  not ok " + f);
}
if (fadeFails.length) {
  for (const f of fadeFails) console.log("  not ok " + f);
}
const total = 6;
const failed = (fails.length ? 1 : 0) + (insetFails.length ? 1 : 0) + (fsFails.length ? 1 : 0)
  + (hiddenFails.length ? 1 : 0) + (reserveFails.length ? 1 : 0) + (fadeFails.length ? 1 : 0);
if (!fails.length) console.log("  ok   app.css parses: comments balanced, braces balanced, no loose prose");
if (!insetFails.length) console.log(`  ok   inset focus rings on ${INSET.length} clipped controls`);
if (!fsFails.length) console.log("  ok   no font-size literal below --fs-xs");
if (!hiddenFails.length) console.log("  ok   the hidden attribute is enforced globally");
if (!reserveFails.length) console.log("  ok   the foot reserves the floating button's band, from the same token");
if (!fadeFails.length) console.log("  ok   the age fade drains chroma toward --ink-3, not contrast toward the background");
console.log(`\n${total - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
