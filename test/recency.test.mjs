/* HOW OLD A FINDING LOOKS MUST MATCH HOW OLD IT SAYS IT IS.
 *
 * An alert card carries its age twice: in words, from relTime(), and in how
 * strongly its severity rail is drawn, from ageBand(). Those are two functions
 * with two sets of thresholds, and if they ever disagree the card says "1 month
 * ago" beside a rail drawn for a year-old finding. On a page whose whole claim
 * is what is circulating NOW, that is the app contradicting itself about the
 * one thing it exists to tell you.
 *
 * So: the boundaries are pinned here, and the two are checked against each
 * other across a year of dates.
 *
 * The fade itself is checked in css.test.mjs - that it mixes toward --ink-3
 * (body-text ink, legible by construction) and not toward the rule colour,
 * which drained contrast as well as chroma and put the oldest band under 3:1
 * in the light theme. */

import { ageBand, relTime } from "../site/js/ui.js";

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();

/* The bands, at and either side of every boundary. */
const bounds = [
  [0,   "fresh"],  [1,   "fresh"],  [30,  "fresh"],
  [31,  "recent"], [90,  "recent"],
  [91,  "older"],  [364, "older"],
  [365, "stale"],  [900, "stale"],
];
for (const [d, want] of bounds) {
  const got = ageBand(daysAgo(d));
  ok(`${d} days ago is ${want} (got ${got})`, got === want);
}

/* A DATE WE CANNOT READ IS NOT AN OLD DATE. Dimming a card whose date failed
 * to parse would assert an age we do not have - the same class of mistake as
 * publishing a finding we cannot source. Both fall back to full strength. */
ok("undefined date stays fresh", ageBand(undefined) === "fresh");
ok("empty date stays fresh", ageBand("") === "fresh");
ok("garbage date stays fresh", ageBand("not a date") === "fresh");
ok("future date stays fresh", ageBand(daysAgo(-10)) === "fresh");

/* THE WORDS AND THE COLOUR AGREE. relTime switches to months at 31 days and
 * to years at 365; ageBand's boundaries are placed to match, so nothing ever
 * reads "29 days ago" on a rail that has already started to fade. */
for (let d = 0; d <= 400; d++) {
  const words = relTime(daysAgo(d));
  const band = ageBand(daysAgo(d));
  if (/day|today|yesterday/.test(words) && band !== "fresh") {
    fails.push(`"${words}" (${d}d) is drawn as ${band}, not fresh`);
    break;
  }
  if (/year/.test(words) && band !== "stale") {
    fails.push(`"${words}" (${d}d) is drawn as ${band}, not stale`);
    break;
  }
}
ok("relTime's words never contradict the band", !fails.some((f) => f.includes("drawn as")));

/* Four bands, all reachable. A ramp with an unreachable step is a ramp with
 * fewer steps than it claims. */
const seen = new Set([0, 45, 200, 500].map((d) => ageBand(daysAgo(d))));
ok("all four bands are reachable", seen.size === 4);

console.log("RECENCY\n");
for (const f of fails) console.log("  not ok " + f);
if (!fails.length) console.log(`  ok   ${pass} age-band checks: boundaries, unreadable dates, and words vs colour`);
console.log(`\n${fails.length ? pass : pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
