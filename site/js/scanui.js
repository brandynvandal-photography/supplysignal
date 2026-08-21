/* The camera sheet for reading a reagent drop.
 *
 * The arithmetic lives in scanner.js and is tested without a camera. This file
 * is the part that has to touch hardware: open a stream, let somebody point at
 * two things, run a clock, and hand back a shortlist.
 *
 * WHAT THE READER IS TOLD, AND WHY IT IS WORDED THAT WAY.
 *
 * Reading a reagent from a phone photo has never been validated. Searched
 * 2026-08-19: every published study that reads these reactions digitally used
 * hardware to control the light - a 3D-printed enclosure, a light box, a fixed
 * camera and lamp - or quantified a drug already known to be present. The best
 * result found (Cruz et al., Talanta 2024, purpose-built device, pure reference
 * compounds) still missed about one positive in six. Nobody has published a
 * study of a bare phone held over a spot plate.
 *
 * It is also not competing with a perfect alternative, and the sheet says so
 * rather than pretending: trained operators reading reagents against GC-MS got
 * 12 of 91 confident calls wrong and found none of the adulterants in 63 of 120
 * samples (Fregonese et al., Front Psychiatry 2021). Fregonese, Harper 2017 and
 * the BCCSU review all independently suggest a camera reading as the fix for
 * exactly the subjectivity this is trying to help with.
 *
 * So: this offers a shortlist and the reader decides. It never fills the answer
 * in by itself, it is never the only way to answer, and the manual dropdown
 * stays where it was and keeps working with the camera untouched.
 *
 * NOTHING IS UPLOADED, STORED, OR KEPT. The stream goes to a <video>, one frame
 * at a time is drawn into a canvas that lives in this closure, a few pixels are
 * read, and the numbers are thrown away with the sheet. No file is written, no
 * request is made, and the stream's tracks are stopped on every exit path
 * including Quick Exit - a camera left running after somebody has fled the app
 * would be its own kind of harm.
 */

import { h, clear } from "./ui.js";
import { reagentLabel } from "./reagentnames.js";
import {
  balance, classify, samplePatch, patchSpread, SPREAD_LIMIT, capturePlan,
  autoWhite, matchesChart,
} from "./scanner.js";

/* How many pixels around the tap to average. A drop on a spot plate is much
   bigger than this at any sane distance; the radius is small so that a slightly
   off tap still lands inside the drop rather than half on the plate. */
const PATCH = 9;

/** Average the frame around a point, in the canvas's own pixel space. */
function patchAt(ctx, x, y) {
  const r = PATCH;
  const x0 = Math.max(0, Math.round(x - r));
  const y0 = Math.max(0, Math.round(y - r));
  const w = Math.min(ctx.canvas.width - x0, r * 2);
  const hgt = Math.min(ctx.canvas.height - y0, r * 2);
  if (w <= 0 || hgt <= 0) return null;
  const { data } = ctx.getImageData(x0, y0, w, hgt);
  const px = [];
  for (let i = 0; i < data.length; i += 4) px.push([data[i], data[i + 1], data[i + 2]]);
  return { rgb: samplePatch(px), spread: patchSpread(px) };
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;
/* Colour names come from the palette in lower case; the reading shows one as
   a label rather than mid-sentence, so it is capitalised for display only. */
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Is this a device somebody can hold over a spot plate?
 *
 * NOT A USER-AGENT TEST, because the obvious one is wrong on the device that
 * matters most: iPadOS Safari reports itself as macOS on purpose - platform
 * comes back "MacIntel" and the UA string says Macintosh - so sniffing for
 * "iPad" silently excludes every iPad. Desktop-mode Safari on an iPhone does
 * the same thing.
 *
 * So ask about the hardware instead, which is the thing actually being relied
 * on. Two signals together:
 *   - touch points. iPhone and iPad report 5; a Mac reports 0, including a
 *     Mac driving an iPad over Sidecar.
 *   - a coarse pointer. A finger is coarse, a trackpad is fine.
 *
 * Both must hold. That admits iOS, iPadOS and Android handhelds, and excludes
 * macOS and Windows desktops - where the camera is a webcam pointing at a face
 * and cannot be held over a plate anyway. A touchscreen Windows laptop passes,
 * which is the honest answer: it is a touch device, and if its camera is
 * useless here the sheet fails gracefully rather than lying.
 */
export function handheldCamera() {
  if (typeof navigator === "undefined") return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const coarse = typeof matchMedia === "function"
    && matchMedia("(pointer: coarse)").matches;
  return touch && coarse;
}

/**
 * Open the sheet.
 *
 * step  — the chart step: { reagent, colors, none, read, sequenceOrAny }
 * onPick(colorName) — called if the reader chooses one of the candidates.
 *
 * Returns a close function. Resolves nothing: the answer arrives through
 * onPick, or does not arrive, and both are fine.
 */
export function openScanner(steps, onPick, onFinish) {
  /* A RUN, NOT A READING. The tracker asks for one reagent per row and a full
   * run is two or three of them, so the camera used to be offered once per row
   * and opened cold each time: a fresh permission prompt, a fresh stream, and
   * the white balance tapped again for light that had not changed. It is one
   * button now and one stream, and it walks the run.
   *
   * Steps with no published read window are dropped rather than guessed at -
   * capturePlan() is the gate, and a reagent outside the eleven flowcharts has
   * no time this repo can stand behind. If that leaves nothing, there is no
   * scanner to open. */
  const list = (Array.isArray(steps) ? steps : [steps]).filter((st) => st && capturePlan(st));
  if (!list.length) return null;

  let idx = 0;
  let step = list[0];
  let plan = capturePlan(step);
  let phase = "reading";      // reading -> done
  let started = 0;
  let ticker = 0;
  let hop = 0;                // the pause between a verdict and the next well
  let stream = null;
  let raf = 0;
  const done = [];            // {reagent, color, expected} as accepted

  const video = h("video", { class: "scan__video", playsinline: "", muted: "", autoplay: "" });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const title = h("strong", null, `${reagentLabel(step.reagent)} — camera`);
  const progress = h("p", { class: "scan__step" });
  const which = h("p", { class: "scan__which" });
  const say = h("p", { class: "scan__say" });
  const clock = h("p", { class: "scan__clock", role: "timer", "aria-live": "off" });
  const out = h("div", { class: "scan__out" });

  const sheet = h("div", { class: "scan", role: "dialog", "aria-modal": "true" });

  function stop() {
    cancelAnimationFrame(raf);
    clearInterval(ticker);
    clearTimeout(hop);
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    video.srcObject = null;
  }
  function close() {
    stop();
    sheet.remove();
    window.removeEventListener("nl:panic", close);
    window.removeEventListener("pagehide", close);
    document.removeEventListener("keydown", onKey);
  }
  const onKey = (e) => { if (e.key === "Escape") close(); };

  /* Quick Exit and backgrounding must take the camera with them. */
  window.addEventListener("nl:panic", close);
  window.addEventListener("pagehide", close);
  document.addEventListener("keydown", onKey);

  function frame() {
    if (video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
    }
    raf = requestAnimationFrame(frame);
  }

  function elapsed() { return Math.round((Date.now() - started) / 1000); }

  /* ---------------------------------------------------------- the run */

  function label() { return reagentLabel(step.reagent); }

  function paintStep() {
    title.textContent = `${label()} — camera`;
    sheet.setAttribute("aria-label", `Read the ${label()} result with the camera`);
    progress.textContent = list.length > 1
      ? `Reagent ${idx + 1} of ${list.length} — ${label()}`
      : "";
    progress.hidden = list.length < 2;
    clear(which);
    which.append(
      "Reading the ", h("strong", null, label()), " well. ",
      "Other wells will be in shot — this reads only where you tap, so tap the right one.",
    );
  }

  /* THE CLOCK STARTS WHEN THE WELL IS PUT IN FRONT OF THE READER, which is the
   * best moment this can know about. The window belongs to the reaction - it
   * starts when the reagent meets the sample - and the app is not told when
   * that happened. It is shown rather than enforced for exactly that reason,
   * and a reading taken past it is labelled with the time it was taken instead
   * of being thrown away. */
  function beginStep() {
    phase = "reading";
    started = Date.now();
    say.textContent = `Tap the middle of the ${label()} well.`;
    clock.textContent = `read within ${mmss(plan.total)}`;
    clearInterval(ticker);
    ticker = setInterval(() => {
      const left = plan.total - elapsed();
      clock.textContent = left > 0
        ? `${mmss(left)} left in the read window`
        : "past the read window — this reading is no longer good";
      if (left <= 0) clearInterval(ticker);
    }, 1000);
  }

  /* ONE ACCEPTED READING, THEN STRAIGHT ON TO THE NEXT WELL. The reader has
     the plate in front of them and the next well is already developing, so
     stopping to re-open the camera is the wrong place to put a pause. */
  function advance() {
    clearInterval(ticker);
    clearTimeout(hop);
    idx += 1;
    if (idx >= list.length) {
      close();
      if (onFinish) onFinish(done);
      return;
    }
    step = list[idx];
    plan = capturePlan(step);
    clear(out);
    paintStep();
    beginStep();
  }

  function accept(name) {
    done.push({ reagent: step.reagent, color: name });
    /* Handed over one at a time rather than in a batch at the end: the tracker
       scores the run from whatever it has, so a reader who closes the camera
       half way keeps the readings already taken. */
    if (onPick) onPick(step.reagent, name);
    advance();
  }

  /* ----------------------------------------------------------- reading */

  /* EVERY UNIFORM PATCH IN THE FRAME EXCEPT THE ONE BEING READ.
   *
   * autoWhite() needs somewhere to find the plate. This walks a grid, keeps
   * only patches that are internally uniform - a rim or a gap between wells is
   * not plate - and drops everything near the tap.
   *
   * That exclusion is load-bearing. A no-reaction result is genuinely white,
   * and letting the drop supply its own reference corrects it to neutral grey:
   * a confident answer of "gray" for a well that is plainly white. */
  function framePatches(skipX, skipY) {
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return [];
    const keepOut = Math.max(W, H) / 8;
    const out = [];
    const N = 7;
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        const x = (W * i) / (N + 1);
        const y = (H * j) / (N + 1);
        if (Math.hypot(x - skipX, y - skipY) < keepOut) continue;
        const got = patchAt(ctx, x, y);
        if (got?.rgb && got.spread <= SPREAD_LIMIT) out.push(got.rgb);
      }
    }
    return out;
  }

  /* WHAT THE CAMERA COULD NOT DO, said as a thing to do next.
     The dropdown is the method the charts are written for; this is not a
     degraded mode, it is the normal one with a shortcut unavailable. */
  function cannotTell(why) {
    clear(out);
    out.appendChild(h("p", { class: "scan__none" }, why));
    out.appendChild(h("div", { class: "scan__acts" },
      h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: close },
        "Answer it myself")));
    out.appendChild(h("p", { class: "sec__note" },
      "Nothing was recorded for this reagent. Tap the well again to retry, or "
      + "answer it on the dropdown - that is the method the charts are written for."));
  }

  /* THE READING, AND THE CHART'S VERDICT ON IT.
   *
   * The colour is taken, not offered: the reader tapped the well and that is
   * the whole interaction. What is still theirs is the disagreement - the
   * reading is recorded either way, so a colour the chart does not expect is a
   * finding rather than a rejection, and "Read again" is there when the camera
   * has plainly got it wrong. */
  function showReading(name, ok) {
    clear(out);
    const expected = (step.colors || []).filter(Boolean);
    /* `says` is the chart's own wording for what it expects - "royal blue",
       "yellow, green, brown or black - any one of them". Quoted, never
       paraphrased. */
    const saysIt = step.says ? String(step.says) : expected.join(" or ");

    out.appendChild(h("p", { class: `scan__call scan__call--${ok === false ? "no" : "yes"}` },
      h("span", { class: "scan__mark", "aria-hidden": "true" }, ok === false ? "\u2715" : "\u2713"),
      h("span", { class: `swatch swatch--${name}`, "aria-hidden": "true" }),
      h("strong", null, cap(name)),
      ok === false ? " \u2014 not what the chart expects" : " \u2014 what the chart expects"));

    if (ok === false && saysIt) {
      out.appendChild(h("p", { class: "scan__seq" }, `On this chart ${reagentLabel(step.reagent)} should be ${saysIt}.`));
    }
    out.appendChild(h("p", { class: "sec__note" },
      idx + 1 < list.length
        ? `Recorded. Moving to ${reagentLabel(list[idx + 1].reagent)}.`
        : "Recorded."));
    out.appendChild(h("div", { class: "scan__acts" },
      h("button", { type: "button", class: "btn btn--ghost btn--sm",
        onClick: () => { clearTimeout(hop); phase = "reading"; clear(out);
                         say.textContent = `Tap the middle of the ${label()} well.`; } },
        "Read again")));
  }

  function onTap(e) {
    if (phase !== "reading" || !canvas.width) return;
    const r = video.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * canvas.width;
    const py = ((e.clientY - r.top) / r.height) * canvas.height;
    const got = patchAt(ctx, px, py);
    if (!got || !got.rgb) return;

    /* ONE WELL, NOT TWO. A spot plate is small and a full run has four to six
       wells going at once, so a tap that lands on a rim or between two of them
       averages two readings into a colour that is in neither. Refused rather
       than blended - a blend is a confident wrong answer. */
    if (got.spread > SPREAD_LIMIT) {
      say.textContent = `That is not all one well - you caught a rim, or two wells at once. `
        + `Tap the middle of the ${label()} well.`;
      return;
    }

    const whiteRef = autoWhite(framePatches(px, py));
    if (!whiteRef) {
      say.textContent = "";
      cannotTell("The camera cannot find the plate to judge the light against. Get more "
        + "of the white plate into the frame, or move somewhere less dim.");
      return;
    }
    const corrected = balance(got.rgb, whiteRef);
    if (!corrected) {
      say.textContent = "";
      cannotTell("The light here cannot be corrected for - too dim, or too strongly colored.");
      return;
    }

    /* AGAINST THE WHOLE PALETTE, not the step's own colours. Restricted to the
       chart's expectations it could only ever answer with one of them, which is
       how a pink drop got called black: the wrong answer was the only answer
       available. Naming it first and judging it second is what makes "not what
       the chart expects" a thing this can say at all. */
    const cands = classify(corrected);
    const top = cands[0];
    if (!top || !top.confident) {
      say.textContent = "";
      cannotTell(top?.clipped
        ? "Too bright to be sure - the plate is reflecting. Move out of the glare and tap again."
        : top?.offPalette
          ? "That is not a color any reagent produces - that may not be the well. Tap the drop itself."
          : "The camera cannot tell which color that is.");
      return;
    }

    const at = elapsed();
    phase = "done";
    say.textContent = at > plan.total
      ? `Read at ${mmss(at)}, past the ${mmss(plan.total)} window - the color has moved on since.`
      : `Read at ${mmss(at)}.`;
    clearInterval(ticker);

    const ok = matchesChart(top.name, step);
    showReading(top.name, ok);
    done.push({ reagent: step.reagent, color: top.name, expected: ok });
    if (onPick) onPick(step.reagent, top.name);
    /* Long enough to read the verdict, short enough that a plate of developing
       wells is not kept waiting. "Read again" cancels it. */
    hop = setTimeout(advance, 3200);
  }

  video.addEventListener("click", onTap);

  sheet.append(
    h("div", { class: "scan__bar" },
      title,
      h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: close }, "Close")),
    progress,
    video,
    which,
    say,
    clock,
    out,
    /* Said plainly, every time, because it is the truth and it is load-bearing. */
    /* THIS PARAGRAPH HAS TO KEEP UP WITH WHAT THE CAMERA ACTUALLY DOES.
       It used to say "this narrows the choice - your eyes against the chart
       make the call", which was true when the reader picked from a shortlist.
       The camera names the colour and records it now, so that sentence would
       be describing an older build. It says what happens instead, and the
       limits it always carried are unchanged and still true. */
    h("p", { class: "scan__fine" },
      "Nobody has tested whether a phone can read these reactions reliably. "
      + "Light, your camera and the moment you tap all change the color. "
      + "This names what it sees and writes it down — check it against the "
      + "plate yourself, change it on the dropdown if it is wrong, and know "
      + "the dropdown works without any of this."),
    h("p", { class: "scan__fine" },
      "The picture never leaves your phone. Nothing is saved."),
  );

  paintStep();
  beginStep();

  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
    .then((s) => {
      stream = s;
      video.srcObject = s;
      frame();
    })
    .catch(() => {
      clear(out);
      say.textContent = "No camera available, or permission was refused.";
      out.appendChild(h("p", { class: "sec__note" },
        "Answer it with the dropdown instead — that is the method the charts are written for."));
    });

  document.body.appendChild(sheet);
  return close;
}
