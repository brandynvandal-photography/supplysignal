/* Reading a reagent drop from a camera frame.
 *
 * WHAT THIS IS FOR, AND WHAT IT REFUSES TO BE.
 *
 * The tracker asks a reader to name the color they see. That is the validated
 * method - it is what the printed charts are for - and it stays the primary
 * path, because the conditions this app is used in are frequently terrible for
 * photography and a reader with a chart and their own eyes is never worse off.
 *
 * This module exists to make that judgement easier where it can, not to
 * replace it. It NARROWS the vocabulary to the two or three colors a
 * measurement is closest to and hands them back for a person to choose from.
 * It never returns "this is X". Three separate reasons, any one of which would
 * be sufficient:
 *
 *   1. COLOUR UNDER UNCONTROLLED LIGHT IS NOT A MEASUREMENT. A phone's auto
 *      white balance will happily render the same drop peach under tungsten
 *      and pink under daylight, and peach and pink route to different branches
 *      of the cocaine chart. That is why nothing here runs without a white
 *      reference the reader points at (see balance()).
 *   2. THE READING IS A PROGRESSION, NOT A POINT. The charts record colors in
 *      order - ["yellow","black"] means the drop turns yellow and THEN black -
 *      and one step is explicitly flagged sequenceOrAny: "any one of them, or
 *      the drop moving through them as it develops". A single frame samples
 *      one instant of a moving reaction and cannot know what came before it.
 *   3. THE APP'S OWN RULE. An inaccurate reading here is worse than no reading,
 *      so the failure mode is deliberately "I am not sure, you look" rather
 *      than a confident wrong answer.
 *
 * NOTHING LEAVES THE DEVICE. There is no upload, no request, no model. The
 * frame is drawn to a canvas, a few pixels are averaged, and the numbers are
 * compared against the palette below. The app ships connect-src 'self' and
 * tells the reader on screen that nothing they look up leaves the device;
 * sending a photograph of somebody's drugs to an inference API would break
 * both, and would put an image of a controlled substance on somebody else's
 * server. On-device is not a preference here, it is the only permissible
 * shape.
 */

/* THE PALETTE IS THE APP'S OWN SWATCHES, not a fresh set of color opinions.
 * These hexes are copied from .swatch--* in app.css, so a measurement that
 * lands on "peach" names the same peach the reader is looking at in the
 * chart and in the reagent bar. A second, prettier palette here would be a
 * second source of truth about what "olive" means. */
export const PALETTE = {
  yellow:  "#d4b106",
  green:   "#3f7d4e",
  blue:    "#2f5f98",
  purple:  "#6b4d9e",
  black:   "#26221c",
  brown:   "#7a5230",
  orange:  "#c67117",
  red:     "#b3301c",
  pink:    "#c76b8f",
  gray:    "#8a8076",
  peach:   "#e0a074",
  magenta: "#b0417a",
  white:   "#eee6d8",
  olive:   "#6f7d3f",
};

/* ------------------------------------------------------------ color space */

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* sRGB's transfer curve. Averaging or scaling gamma-encoded values is the
   classic color bug: it makes midtones drift and it makes the white-balance
   division below simply wrong, because the sensor's response is linear and
   the encoding is not. */
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/* D65, the white point sRGB is defined against. */
const WHITE_XYZ = [0.95047, 1, 1.08883];

function rgbToXyz([r, g, b]) {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  return [
    R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
    R * 0.2126729 + G * 0.7151522 + B * 0.0721750,
    R * 0.0193339 + G * 0.1191920 + B * 0.9503041,
  ];
}

const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB 0-255 to CIE Lab. Perceptual, so "how different do these look" is a
 *  distance rather than a guess. */
export function rgbToLab(rgb) {
  const [x, y, z] = rgbToXyz(rgb);
  const fx = f(x / WHITE_XYZ[0]), fy = f(y / WHITE_XYZ[1]), fz = f(z / WHITE_XYZ[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76. Crude next to CIEDE2000 and entirely adequate for "which of
 *  fourteen well-separated names is this nearest", which is the only question
 *  asked of it. */
export function labDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/* ---------------------------------------------------------- white balance */

/**
 * Correct a sample against a surface the reader has told us is white.
 *
 * THE ONE THING THAT MAKES THIS WORTH DOING AT ALL. A ceramic spot plate is
 * white, it is already in the frame, and it is under exactly the same light as
 * the drop - so it is a free reference, and the reader pointing at it is a
 * more reliable instrument than any auto white balance.
 *
 * Von Kries scaling in linear light: divide the sample by the reference and
 * multiply back up to the target white. Done on gamma-encoded values instead,
 * this over-corrects the midtones and turns a gray plate blue.
 *
 * Returns null when the reference cannot do the job - a reference that is too
 * dark to divide by, or so saturated it is plainly not a white surface. A
 * refusal is the correct output there; the alternative is amplifying noise
 * into a confident color.
 */
export function balance(sampleRgb, referenceRgb) {
  if (!sampleRgb || !referenceRgb) return null;
  const ref = referenceRgb.map(toLinear);
  /* Too dark to be a white reference: dividing by this multiplies sensor
     noise. 0.06 linear is roughly 22/255 encoded - a deep shadow. */
  if (ref.some((c) => c < 0.06)) return null;
  /* Not neutral enough to BE a reference. A strongly colored surface tells us
     nothing about the illuminant, and using it would rotate every reading. */
  const mx = Math.max(...ref), mn = Math.min(...ref);
  if (mx / mn > 2.2) return null;

  const gray = (ref[0] + ref[1] + ref[2]) / 3;
  const out = sampleRgb.map((c, i) => {
    const lin = toLinear(c) * (gray / ref[i]);
    const v = Math.min(1, Math.max(0, lin));
    const enc = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(enc * 255);
  });
  return out;
}

/* -------------------------------------------------------------- classify */

/**
 * Which palette names is this closest to?
 *
 * Returns every candidate sorted by distance, each with a `confident` flag
 * that is true only when the nearest name is clearly nearer than the runner
 * up. `confident` is advice to the UI about how loudly to speak - it is never
 * permission to skip asking.
 *
 * `allowed` narrows the palette to the colors a chart step can actually
 * produce. Scoring a cocaine Marquis step against "olive" is noise: the chart
 * does not offer it, and letting it win would invent a reading the step has
 * no branch for.
 */
export function classify(rgb, allowed = null) {
  if (!rgb) return [];
  const names = allowed && allowed.length
    ? allowed.filter((n) => PALETTE[n])
    : Object.keys(PALETTE);
  if (!names.length) return [];

  /* CLIPPED PIXELS CARRY NO COLOUR. A channel at the top of its range means
     the sensor saturated: the true value is "255 or anything brighter", and
     the hue that falls out of the other two channels is an artefact of where
     the exposure happened to land. This bites exactly where it is most
     dangerous - a glossy spot plate under a phone torch blows out, and the
     result reads as a confident, wrong, near-white.
     Note this is NOT the same as "the drop looks white": white is a real
     reading and stays in the palette. It is the measurement that is refused,
     not the color. */
  const clipped = rgb.some((c) => c >= 250);

  const lab = rgbToLab(rgb);
  const scored = names
    .map((name) => ({ name, distance: labDistance(lab, rgbToLab(hexToRgb(PALETTE[name]))) }))
    .sort((a, b) => a.distance - b.distance);

  /* A gap this size means the second candidate is a different color rather
     than a near neighbor. Set from the palette's own spacing: peach sits
     deliberately between orange and pink because that is the distinction the
     reader is being asked to make, and those neighbors are ~20 apart in Lab.
     Below that the honest answer is "these two, you choose". */
  const clear = scored.length < 2 || (scored[1].distance - scored[0].distance) > 12;
  /* Far from everything in the palette: not a reagent color at all - the
     bench, a fingertip, the sky.
     
     THE NUMBER IS MEASURED FROM THE PALETTE, not chosen. Its colors sit a
     median of 27.7 apart in Lab, closest pair pink/magenta at 16.6. So a
     sample further from its own nearest name than the names are from each
     other is not a near miss, it is something else in the frame. An earlier
     45 was loose enough to call a saturated cyan "green". */
  const tooFar = scored[0].distance > 28;

  return scored.map((s, i) => ({
    ...s,
    confident: i === 0 && clear && !tooFar && !clipped,
    offPalette: tooFar,
    clipped,
  }));
}

/* ------------------------------------------------------------- sampling */

/**
 * The average color of a small patch, with the outliers dropped.
 *
 * A plain mean over a circle is wrong in the way that matters here: a spot
 * plate is glossy, so the patch usually contains a specular highlight, and a
 * few blown-out pixels drag a dark reading toward white. Sorting by luminance
 * and keeping the middle discards the highlight and any shadow at the rim
 * without needing to find either.
 */
export function samplePatch(pixels) {
  const px = (pixels || []).filter((p) => Array.isArray(p) && p.length >= 3);
  if (!px.length) return null;
  if (px.length < 5) {
    const n = px.length;
    return [0, 1, 2].map((i) => Math.round(px.reduce((a, p) => a + p[i], 0) / n));
  }
  const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  const sorted = [...px].sort((a, b) => lum(a) - lum(b));
  const cut = Math.floor(sorted.length * 0.25);
  const mid = sorted.slice(cut, sorted.length - cut);
  const keep = mid.length ? mid : sorted;
  return [0, 1, 2].map((i) => Math.round(keep.reduce((a, p) => a + p[i], 0) / keep.length));
}

/**
 * How uniform was that patch?
 *
 * WELLS SIT NEXT TO EACH OTHER. A spot plate is small and a full run has four
 * to six wells filled at once, so the pixels around a tap can easily span two
 * different readings, or a well's rim, or the gap between them. Averaging
 * across that produces a color that is in neither well - a confident blend of
 * two answers, which is the worst possible output here.
 *
 * A single well of reagent is close to uniform, so spread is the tell. This
 * returns the mean distance from the patch's own average in Lab; a caller can
 * refuse anything above a threshold and ask for a tap nearer the middle.
 * Cheaper and more honest than trying to find the well's edges.
 */
export function patchSpread(pixels) {
  const px = (pixels || []).filter((p) => Array.isArray(p) && p.length >= 3);
  if (px.length < 4) return 0;
  const mean = [0, 1, 2].map((i) => px.reduce((a, p) => a + p[i], 0) / px.length);
  const meanLab = rgbToLab(mean);
  const total = px.reduce((a, p) => a + labDistance(rgbToLab(p), meanLab), 0);
  return total / px.length;
}

/* Above this the patch is not one color. Set against the palette's own
   spacing - its closest pair sits 16.6 apart in Lab - so a patch whose pixels
   scatter by more than about half that is straddling two things rather than
   sampling one. Glare and sensor noise inside a single well stay well under
   it; a tap on a rim or between two wells does not. */
export const SPREAD_LIMIT = 9;

/* ----------------------------------------------------------- read window */

/** "0:45" and "30:00" as seconds. The charts write them, the timer counts
 *  them, and they differ by forty times across six reagents. */
export function readSeconds(read) {
  const m = /^(\d+):(\d{2})$/.exec(String(read || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * When to capture, inside a step's read window.
 *
 * A single frame is right for a step whose colors are alternatives. It is
 * WRONG for a step the chart flags `sequenceOrAny` - "any one of them, or the
 * drop moving through them as it develops" - because there the progression is
 * the signal and one frame cannot see it. Those get a series across the
 * window so the reader is shown what it did, not just where it ended.
 *
 * The last capture sits a little inside the window rather than on its edge:
 * a reading taken at exactly 0:45 has already begun to be a reading taken
 * after 0:45.
 */
export function capturePlan(step) {
  const total = readSeconds(step?.read);
  if (!total) return null;
  const end = Math.max(1, Math.round(total * 0.9));
  const series = !!step?.sequenceOrAny;
  if (!series) return { total, series: false, at: [end] };
  /* Four points: the start of the window, two through it, and the end. Enough
     to show a direction without asking somebody to hold a phone still for
     thirty minutes of Ehrlich. */
  const at = [Math.max(1, Math.round(total * 0.15)),
              Math.round(total * 0.4),
              Math.round(total * 0.65),
              end];
  return { total, series: true, at: [...new Set(at)].sort((a, b) => a - b) };
}
