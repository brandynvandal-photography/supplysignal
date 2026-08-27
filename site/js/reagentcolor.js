/* Turning a written reagent reading into the bar that sits beside it.
 *
 * THE PROBLEM THIS SOLVES. The bar had one band per colour KEY, and a key is a
 * single palette word. So "Deep purplish red", "Moderate reddish brown" and
 * "Very pale yellow, sometimes nearly invisible" painted the same flat red,
 * brown and yellow as "Red", "Brown" and "Bright yellow". Every modifier the
 * source went to the trouble of writing - deep, pale, muddy, -ish, -tinted,
 * blue-green - was thrown away before it reached the screen, and two readings a
 * reader is being asked to TELL APART rendered identically.
 *
 * WHAT IS AND IS NOT A GRADIENT, because this is the part that can go wrong.
 *
 * There is a note in substances.js that has been right since it was written: a
 * smooth gradient across "yellow, then black" paints an olive middle the
 * reaction never produces. That still holds and nothing here changes it.
 *
 * The distinction is between three different things the words can mean:
 *
 *   A SEQUENCE - "yellow turning green", "gray to black", "blue-green shifting
 *   to brown-black". The drop is one colour and then another. Crisp bands, no
 *   blend, exactly as before: the midpoint is fiction.
 *
 *   A RANGE - "light pink to deep peach", "light yellow to orange - a range is
 *   accepted", "violet to purple; shade varies". The reaction genuinely lands
 *   anywhere between the two, and a reader holding a strip that came out in the
 *   middle should see that the middle is expected. A blend is what the words
 *   say here, and bands are what would be wrong.
 *
 *   A BLEND - "blue-green", "purplish red", "muddy gray-green", "bluish black".
 *   ONE colour, described as a mixture. It was being painted as its base hue
 *   alone. Mixing is not inventing anything; it is printing what was written.
 *
 * Sequence and range look identical in English - both use "to" - so they cannot
 * be told apart by grammar. RANGE_WORDS below is the list of readings whose
 * source describes a spread rather than a progression, and anything not on it
 * is treated as a sequence, which is the conservative direction: a wrong band
 * shows two colours that both occur, a wrong blend shows one that does not.
 *
 * WHAT HAPPENS WHEN THIS FAILS TO PARSE. It hands back null and the caller
 * paints the old key-driven bands. A reading this cannot read is not a reading
 * it may guess at - see test/reagentcolor.test.mjs, which walks every string in
 * the dataset and fails if one silently falls through.
 *
 * NO INLINE STYLE ATTRIBUTES. style-src is 'self' with no unsafe-inline, and a
 * style="" attribute is stripped - that trap already cost a table of empty
 * squares once, and the note in app.css records it. Setting the property
 * through the CSSOM is a different code path and is NOT blocked; verified in
 * the browser against the live meta CSP before this was written.
 */

/* The palette, by name. These are CSS custom properties rather than hex so the
   swatches, the bands and the blends cannot drift apart, and so the two colours
   that get a different value at band size - black and white, see app.css - are
   overridden in one place. */
const HUES = new Set([
  "yellow", "green", "blue", "purple", "violet", "black", "brown", "orange",
  "red", "pink", "gray", "white", "olive", "peach", "magenta", "slate",
]);

/* US spellings only, and that is enforced rather than assumed: the copy guard
   fails the build on a British spelling anywhere in reader-facing source, and
   accepting "grey" here as an input token tripped it. A source that ever writes
   "grey" falls back to the key-driven bands, which is the documented behaviour
   for anything this cannot read - not a silent misreading. */
const hueVar = (h) => `var(--sw-${h})`;

/* Modifiers, as a shift in lightness and in how much grey is mixed in. The
   numbers are deliberately coarse: the source words are coarse. "Deep" and
   "very dark" are not two points apart on a scale anybody measured, they are
   two words a chart used, and printing them as visibly different is the whole
   job. */
const MODS = {
  "very dark": { light: -42 },
  "very pale": { light: 52, desat: 30 },
  dark:        { light: -30 },
  deep:        { light: -20 },
  intense:     { light: -10 },
  strong:      { light: -6 },
  moderate:    {},
  bright:      { light: 10 },
  light:       { light: 26 },
  pale:        { light: 38, desat: 22 },
  muddy:       { desat: 40, light: -8 },
  "sea foam":  { light: 30, desat: 26 },
  dull:        { desat: 30 },
};

/* Readings whose source describes a SPREAD, not a progression. See the header:
   English cannot tell these apart from a sequence, so they are named. */
const RANGE_WORDS = [
  /light pink to deep peach/i,
  /light yellow to orange/i,
  /violet to purple/i,
  /a range is accepted/i,
  /shade varies/i,
];

const SEQ_SPLIT = /\s+(?:turning into|turning|shifting to|shifting|then|into|to)\s+/i;
const ALT_SPLIT = /\s*,?\s+or\s+/i;

/* Noise that is not colour: timing, caveats, and the clause after a dash. */
const TRAILING = /\s*[—–-]\s.*$/;
const ASIDES = /\s*;\s.*$|,\s*(near-instant|sometimes nearly invisible|often smoking).*$/i;

/** Does this fragment name a colour at all? */
function hasHue(s) {
  return [...HUES].some((h) => new RegExp(`\\b${h}`, "i").test(s)) || /no (reaction|change)/i.test(s);
}

/**
 * One colour, as base hue plus an optional tint and modifiers.
 *
 * The base is the LAST hue word, which is how English works here: in "purplish
 * red", "blue-tinted black", "olive green" and "gray-green" the second word is
 * the colour and the first says which way it leans. Getting that backwards
 * paints "bluish black" as blue, which is a different reading entirely.
 */
function parseStop(text) {
  let s = text.toLowerCase().replace(/[.]+$/, "").trim();
  if (!s) return null;
  if (/^no (reaction|change)$/.test(s) || /^nothing$/.test(s)) return { none: true };

  const mods = { light: 0, desat: 0 };
  for (const [word, shift] of Object.entries(MODS)) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(s)) {
      mods.light += shift.light || 0;
      mods.desat += shift.desat || 0;
      s = s.replace(re, " ");
    }
  }
  s = s.replace(/\b(a|an|the|of|often|sometimes|slightly|colou?r(ed)?)\b/gi, " ")
       .replace(/\s+/g, " ").trim();

  /* Hyphenated pairs - "blue-green", "brown-black", "yellow-green" - are an
     even mixture. -ish and -tinted are a lean, not a mixture, so they take less
     of the tint. Order matters: check the pair form first, or "blue-tinted"
     splits on the hyphen and reads as a hue called "tinted". */
  let base = null, tint = null, tintPct = 0;

  const pair = s.match(/\b([a-z]+)-([a-z]+)\b/);
  if (pair && HUES.has(pair[1]) && HUES.has(pair[2])) {
    tint = pair[1]; base = pair[2]; tintPct = 42;
  } else {
    const lean = s.match(/\b([a-z]+?)(?:ish|-tinted|-tinged)\b\s+([a-z]+)/);
    if (lean && HUES.has(lean[2])) {
      /* "reddish" -> redd -> red, "bluish" -> blu -> blue, "purplish" ->
         purpl -> purple. English drops or doubles the last letter before -ish
         and a stem that is not tried both ways silently loses the tint - which
         is how "Deep reddish orange" and "Moderate reddish brown" were coming
         out as plain orange and plain brown. */
      const stem = lean[1];
      const t = [stem, stem + "e", stem.slice(0, -1)].find((w) => HUES.has(w)) || null;
      if (t) { tint = t; base = lean[2]; tintPct = 26; }
    }
  }

  if (!base) {
    const found = s.split(/[^a-z]+/).filter((w) => HUES.has(w));
    if (!found.length) return null;
    base = found[found.length - 1];
    if (found.length > 1) { tint = found[found.length - 2]; tintPct = 34; }
  }

  return { base, tint, tintPct, light: mods.light, desat: mods.desat };
}

/** A stop as a CSS colour expression. */
export function cssColor(stop) {
  if (!stop || stop.none) return null;
  let c = hueVar(stop.base);
  if (stop.tint) c = `color-mix(in oklab, ${c}, ${hueVar(stop.tint)} ${stop.tintPct}%)`;
  if (stop.desat) c = `color-mix(in oklab, ${c}, var(--sw-gray) ${Math.min(60, stop.desat)}%)`;
  if (stop.light > 0) c = `color-mix(in oklab, ${c}, var(--sw-lift) ${Math.min(70, stop.light)}%)`;
  if (stop.light < 0) c = `color-mix(in oklab, ${c}, var(--sw-sink) ${Math.min(70, -stop.light)}%)`;
  return c;
}

/**
 * A written reading -> what to paint.
 *
 * Returns { kind, parts } or null when the words carry no colour this can read.
 *
 * `parts` is the outcomes the reading offers. Normally there is one. An
 * either/or reading has one per alternative, and each part carries its OWN
 * shape - which is why this is nested rather than a flat list of stops:
 * "no reaction, or light pink to deep peach" is one outcome with no colour and
 * one outcome that is a range, and flattening it painted a single invented
 * pinkish-peach for the pair.
 *
 * part = { kind: "flat" | "range" | "sequence" | "none", stops: [...] }
 */
export function parseReading(text) {
  if (!text) return null;
  let s = String(text).trim();

  /* "Disputed — no reaction, or light pink to deep peach": the colour lives
     after the dash, so the dash clause is only dropped when what comes before
     it names a colour of its own. */
  const head = s.replace(TRAILING, "");
  s = hasHue(head) ? head : s.replace(/^[^—–]*[—–]\s*/, "");
  s = s.replace(ASIDES, "").trim();

  /* "Black, often purple or brown tinted" is ONE reading - a black with a lean
     - and the "or" inside it belongs to the tint, not to the outcome. Split on
     it and the bar claims the drop comes out purple OR brown, which is not what
     the chart says and is the opposite of the point: the colour is black. */
  const tinted = s.match(/^([a-z]+),?\s+(?:often\s+)?([a-z]+)(?:\s+or\s+([a-z]+))?\s+tinted$/i);
  if (tinted && HUES.has(tinted[1].toLowerCase())) {
    const base = tinted[1].toLowerCase();
    const t = [tinted[2], tinted[3]].map((x) => x && x.toLowerCase()).filter((x) => x && HUES.has(x));
    if (t.length) {
      return { kind: "flat", parts: [{ kind: "flat",
        stops: [{ base, tint: t[0], tintPct: 22, light: 0, desat: 0 }] }] };
    }
  }

  const isRange = RANGE_WORDS.some((re) => re.test(text));

  /** One alternative, which may itself be flat, a range or a sequence. */
  const part = (fragment) => {
    const stops = fragment.split(SEQ_SPLIT).map((x) => x.trim()).filter(Boolean).map(parseStop);
    if (!stops.length || stops.some((x) => x === null)) return null;
    if (stops.length === 1) return { kind: stops[0].none ? "none" : "flat", stops };
    return { kind: isRange ? "range" : "sequence", stops };
  };

  const alts = s.split(ALT_SPLIT).map((x) => x.trim()).filter(Boolean);
  const parts = alts.map(part);
  if (!parts.length || parts.some((p) => p === null)) return null;

  if (parts.length > 1) return { kind: "either", parts };
  return { kind: parts[0].kind, parts };
}

/* The hatch a no-reaction outcome is painted with. Same two tokens the
   standalone .swatch--none uses, so "nothing happens" looks like itself
   wherever it appears - on its own, or as one half of an either. */
const HATCH = "repeating-linear-gradient(45deg, var(--sw-hatch-a) 0 4px, var(--sw-hatch-b) 4px 8px)";

/** One part, as the colour stops it contributes across a span of the bar. */
function partStops(p, from, to) {
  const span = to - from;
  if (p.kind === "none") return { hatch: [from, to], stops: [] };

  const cols = p.stops.map(cssColor);
  if (p.kind === "flat") return { stops: [`${cols[0]} ${from}% ${to}%`] };

  if (p.kind === "range") {
    /* A true blend: the reaction lands anywhere between the two ends, and the
       middle is a real outcome rather than an artefact of the drawing. */
    const a = from + span * 0.12, b = to - span * 0.12;
    return { stops: [`${cols[0]} ${from}% ${a.toFixed(1)}%`,
                     `${cols[cols.length - 1]} ${b.toFixed(1)}% ${to}%`] };
  }

  /* A sequence: crisp, deliberately. The midpoint of a progression is a colour
     that never appears - the note this file opens with. */
  const n = cols.length;
  return {
    stops: cols.map((c, i) => {
      const a = from + (span * i) / n, b = from + (span * (i + 1)) / n;
      return `${c} ${a.toFixed(1)}% ${b.toFixed(1)}%`;
    }),
  };
}

/**
 * Paint a bar element for a reading. Returns true if it painted.
 *
 * A caller that gets `false` back is left with exactly what it had before -
 * the key-driven bands - so a reading this cannot read loses nothing.
 */
export function paintBar(el, text) {
  /* NO CSSOM, NO PAINT, AND CERTAINLY NO THROW. The views test renders every
     screen against a small DOM shim that has no style object, and this threw
     there - taking the whole Test screen down with it, which is exactly the
     failure that test exists to catch. A bar that cannot be painted is a bar
     that keeps its bands; that is the documented fallback and it applies here
     as much as to a reading the parser cannot read. */
  if (typeof el?.style?.setProperty !== "function") return false;

  const p = parseReading(text);
  if (!p || p.kind === "none") return false;

  /* BUILT IN POSITIONAL ORDER, never sorted afterwards.
   *
   * This did sort, and it was wrong in a way worth recording: a stop looks like
   * "color-mix(in oklab, var(--sw-peach), var(--sw-sink) 20%) 94% 100%", and a
   * regex reaching for the first percentage in that string finds the 20% inside
   * the mix rather than the 94% that positions it. The "no reaction, or light
   * pink to deep peach" bar came out with its two halves transposed. Walking
   * the parts in order and emitting a transparent hole where a no-reaction
   * outcome sits removes the need to sort at all. */
  const n = p.parts.length;
  const stops = [];
  let anyColour = false;
  let anyHole = false;
  p.parts.forEach((part, i) => {
    const from = Math.round((100 * i) / n), to = Math.round((100 * (i + 1)) / n);
    const out = partStops(part, from, to);
    if (out.hatch) { stops.push(`transparent ${from}% ${to}%`); anyHole = true; return; }
    stops.push(...out.stops);
    anyColour = true;
  });

  if (!anyColour) return false;

  /* The hatch shows through the transparent hole from the layer underneath, so
     "nothing happens" looks the same here as it does on its own. */
  const bg = `linear-gradient(90deg, ${stops.join(", ")})`
    + (anyHole ? `, ${HATCH}` : "");

  el.style.setProperty("background", bg);
  el.classList.add("reagbar--painted");
  el.setAttribute("data-scale", p.kind);
  return true;
}
