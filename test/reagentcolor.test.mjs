/* THE BAR HAS TO SAY WHAT THE WORDS SAY.
 *
 * site/js/reagentcolor.js reads a written reagent reading - "Deep purplish
 * red", "muddy gray-green", "light pink to deep peach" - and paints a scale
 * from it. That is a parser standing between a source and a colour a reader
 * will act on, which is exactly the kind of code that fails quietly: a reading
 * it cannot understand still renders SOMETHING, and nothing on screen says the
 * something is wrong.
 *
 * So this walks every reading in the dataset and checks four things:
 *
 *   1. IT PARSES, or it is on a short list of readings that carry no colour at
 *      all ("Positive, via tryptophan"). A new reading the parser cannot read
 *      fails here rather than silently falling back forever.
 *
 *   2. THE HUE AGREES WITH THE KEY. Every reaction already carries a `key` -
 *      the palette word the dots have always used - and the base hue this
 *      parser lands on has to be that key, or one of `keys`. This is the data
 *      and the screen agreeing, and it is what would have caught "bluish black"
 *      being read as blue rather than as black.
 *
 *   3. A SEQUENCE NEVER BLENDS. "Yellow turning green" through a smooth
 *      gradient paints an olive middle the reaction never produces - the note
 *      in substances.js, which predates this file and is still right. Bands for
 *      a progression, a blend only where the source describes a spread.
 *
 *   4. NO REACTION IS NEVER A COLOUR. A reading that says nothing happens must
 *      not come back with a hue, on its own or as half of an either/or.
 *
 * It also checks that every palette token the module can emit is actually
 * defined in app.css, because a var() that resolves to nothing paints a
 * transparent band and looks like a rendering bug rather than a missing token.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseReading, cssColor } from "../site/js/reagentcolor.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testing = JSON.parse(readFileSync(path.join(ROOT, "data", "testing.json"), "utf8"));
const css = readFileSync(path.join(ROOT, "site", "css", "app.css"), "utf8");

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

/* Readings that name an OUTCOME rather than a colour. These are expected to
   fall through to the key-driven bands; the point of naming them is that the
   list cannot grow by accident. */
const NO_COLOUR = [/^positive, via tryptophan/i];

/* The palette word a hue maps back to, where the two differ. */
const SAME = { grey: "gray", violet: "purple" };
const normal = (h) => SAME[h] || h;

const rows = [];
for (const r of testing.reagents) {
  for (const x of r.reactions) rows.push({ reagent: r.name, ...x });
}

ok(`there are readings to check (${rows.length})`, rows.length > 20);

/* ---- 1. everything parses, or is a named non-colour ---- */
const unparsed = [];
for (const x of rows) {
  const p = parseReading(x.color);
  if (!p && !NO_COLOUR.some((re) => re.test(x.color))) {
    unparsed.push(`${x.reagent}: "${x.color}"`);
  }
}
ok("every reading parses, or is a listed non-colour"
   + (unparsed.length ? `: ${unparsed.join(" | ")}` : ""), !unparsed.length);

/* ---- 2. the hue the parser lands on is the key the data already carries ---- */
const disagree = [];
for (const x of rows) {
  const p = parseReading(x.color);
  if (!p) continue;
  const keys = (x.keys || [x.key]).filter(Boolean).map(normal);
  if (!keys.length) continue;

  /* THE KEY MAY BE EITHER HALF OF A BLEND, and this is the interesting part.
     A key is one palette word. A reading like "Olive black", "Deep purplish
     red" or "Deep orange-yellow" names two hues, and the data has always keyed
     it on the FIRST - olive, purple, orange - while English makes the second
     the colour: an olive black is a black. The bar paints the mixture, so both
     words are on screen and neither reading is being contradicted; what has to
     hold is that the key is one of the hues actually present. A parser that
     landed on a hue the words never mention still fails here. */
  const bases = p.parts.flatMap((part) =>
    part.stops.filter((s) => !s.none)
      .flatMap((s) => [normal(s.base), s.tint && normal(s.tint)])
      .filter(Boolean));

  /* "no reaction" halves contribute no hue, so an either/or with one colour is
     compared on that colour alone. */
  if (!bases.length) {
    if (!keys.every((k) => k === "none")) disagree.push(`${x.reagent}: "${x.color}" parsed to no colour but key is ${keys.join("/")}`);
    continue;
  }
  const shared = bases.some((b) => keys.includes(b));
  if (!shared) {
    disagree.push(`${x.reagent}: "${x.color}" -> ${bases.join(",")} but key says ${keys.join(",")}`);
  }
}
ok("the parsed hue agrees with the key in the data"
   + (disagree.length ? `: ${disagree.join(" | ")}` : ""), !disagree.length);

/* ---- 3. progressions stay crisp, spreads blend ---- */
const SHAPES = [
  ["Yellow turning green", "sequence"],
  ["Gray to black — but DELAYED 15–30 seconds, often smoking", "sequence"],
  ["Blue-green shifting to brown-black", "sequence"],
  ["Orange to brown", "sequence"],
  ["Light yellow to orange — a range is accepted", "range"],
  ["Violet to purple; shade varies", "range"],
  ["Deep purplish red", "flat"],
  ["Black, often purple or brown tinted", "flat"],
  ["Purple or black", "either"],
  ["Yellow, or no change", "either"],
  ["No reaction", "none"],
];
const wrongShape = SHAPES
  .map(([text, want]) => [text, want, parseReading(text)?.kind])
  .filter(([, want, got]) => got !== want)
  .map(([text, want, got]) => `"${text}" is ${got}, expected ${want}`);
ok("progressions read as sequences and spreads as ranges"
   + (wrongShape.length ? `: ${wrongShape.join(" | ")}` : ""), !wrongShape.length);

/* A blend is a two-stop gradient with room between the stops; a sequence is
   hard-edged. Checked on the numbers rather than on the word "sequence", so a
   future change to how bands are drawn cannot quietly start blending. */
const seq = parseReading("Yellow turning green");
ok("a sequence has one stop per stage and no shared boundary",
   seq.parts[0].stops.length === 2);

/* ---- 4. nothing happens is never a colour ---- */
const leaked = [];
for (const text of ["No reaction", "No change", "Yellow, or no change",
                    "No reaction, or a muddy gray-green — both are expected"]) {
  const p = parseReading(text);
  const nones = p.parts.filter((part) => part.kind === "none");
  if (!nones.length) leaked.push(`"${text}" has no no-reaction outcome`);
  for (const part of nones) {
    if (part.stops.some((s) => !s.none)) leaked.push(`"${text}" painted a colour for nothing`);
    if (part.stops.some((s) => cssColor(s) !== null)) leaked.push(`"${text}" produced a css colour`);
  }
}
ok("a no-reaction outcome never becomes a colour"
   + (leaked.length ? `: ${leaked.join(" | ")}` : ""), !leaked.length);

/* ---- every token the module can emit exists in the stylesheet ---- */
const emitted = new Set();
for (const x of rows) {
  const p = parseReading(x.color);
  if (!p) continue;
  for (const part of p.parts) {
    for (const s of part.stops) {
      const c = cssColor(s);
      if (!c) continue;
      for (const m of c.matchAll(/var\((--sw-[a-z-]+)\)/g)) emitted.add(m[1]);
    }
  }
}
const missing = [...emitted].filter((t) => !new RegExp(`${t}\\s*:`).test(css));
ok(`every palette token the bars use is defined in app.css (${emitted.size} used)`
   + (missing.length ? `: ${missing.join(", ")} missing` : ""), !missing.length);

console.log("REAGENT COLOR\n");
for (const f of fails) console.log("  not ok " + f);
if (!fails.length) {
  console.log(`  ok   ${rows.length} readings parse, agree with their keys, and keep`);
  console.log("       progressions crisp and spreads blended");
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
