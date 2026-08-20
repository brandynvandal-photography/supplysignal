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
import { balance, classify, samplePatch, patchSpread, SPREAD_LIMIT, capturePlan } from "./scanner.js";

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
  let allowed = (step.colors || []).filter(Boolean);
  let shots = [];             // this step's samples, in order
  let phase = "white";        // white -> drop -> done
  let started = 0;
  let ticker = 0;
  /* THE WHITE REFERENCE SURVIVES THE STEP. It describes the light in the room,
     not the well, and the room does not change between wells. Re-tapping it per
     reagent asked for a step that could only produce the same answer. It is
     dropped the moment a correction fails against it. */
  let whiteRef = null;
  let stream = null;
  let raf = 0;
  const done = [];            // {reagent, color} in the order they were accepted

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

  function beginDrop() {
    phase = "drop";
    started = Date.now();
    say.textContent = `Now tap the middle of the ${label()} well.`;
    clock.textContent = plan.series
      ? `${mmss(plan.total)} window — tap it a few times as it develops`
      : `read within ${mmss(plan.total)}`;
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
    idx += 1;
    if (idx >= list.length) {
      close();
      if (onFinish) onFinish(done);
      return;
    }
    step = list[idx];
    plan = capturePlan(step);
    allowed = (step.colors || []).filter(Boolean);
    shots = [];
    started = 0;
    clear(out);
    paintStep();
    if (whiteRef) {
      beginDrop();
    } else {
      phase = "white";
      clock.textContent = "";
      say.textContent = "Tap the clean white part of the plate first — that is how it "
        + "corrects for the light you are standing in.";
    }
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

  function renderCandidates(rgb) {
    clear(out);
    const cands = classify(rgb, allowed.length ? allowed : null);
    if (!cands.length || cands[0].offPalette) {
      out.appendChild(h("p", { class: "scan__none" },
        "That does not look like any color this step can produce. Try again with the "
        + "drop filling more of the frame — or just answer it yourself below."));
      return;
    }
    const top = cands.slice(0, 3);
    out.appendChild(h("p", { class: "scan__lead" },
      cands[0].clipped
        ? "Too bright to be sure — the plate is reflecting. Closest, for what it is worth:"
        : top[0].confident
          ? "Closest match — check it against the plate before you accept it:"
          : "It is between these. You decide which:"));
    out.appendChild(h("div", { class: "chips" },
      top.map((c) => h("button", {
        type: "button", class: "chip",
        onClick: () => accept(c.name),
      }, h("span", { class: `swatch swatch--${c.name}`, "aria-hidden": "true" }), " ", c.name))));
    out.appendChild(h("p", { class: "sec__note" },
      idx + 1 < list.length
        ? "Nothing is filled in until you tap one. Tapping one records it and moves to the next reagent."
        : "Nothing is filled in until you tap one."));
  }

  function takeReading() {
    const rgb = shots.length ? shots[shots.length - 1] : null;
    if (!rgb) return;
    renderCandidates(rgb);
    if (plan.series && shots.length > 1) {
      /* Show what it DID, not just where it stopped. For a step the chart marks
         as a progression, the movement is the reading. */
      const seq = shots.map((s) => classify(s, allowed.length ? allowed : null)[0])
        .filter(Boolean).map((c) => c.name);
      const path = seq.filter((n, i) => i === 0 || n !== seq[i - 1]);
      out.insertBefore(
        h("p", { class: "scan__seq" },
          path.length > 1
            ? `It moved through ${path.join(" → ")}. The chart expects a progression here, so the movement is the reading.`
            : `It stayed ${path[0] || "the same"} across the window.`),
        out.firstChild,
      );
    }
  }

  function onTap(e) {
    if (phase === "done" || !canvas.width) return;
    const r = video.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * canvas.width;
    const py = ((e.clientY - r.top) / r.height) * canvas.height;
    const got = patchAt(ctx, px, py);
    if (!got || !got.rgb) return;
    const rgb = got.rgb;

    /* ONE WELL, NOT TWO. A spot plate is small and a full run has four to six
       wells going at once, so a tap that lands on a rim or between two of them
       averages two readings into a color that is in neither. Refused rather
       than blended - a blend is a confident wrong answer. */
    if (got.spread > SPREAD_LIMIT) {
      say.textContent = phase === "white"
        ? "That is not all plate — you caught an edge or a well. Tap a clear patch of white."
        : `That is not all one well — you caught a rim, or two wells at once. `
          + `Tap the middle of the ${label()} well.`;
      return;
    }

    if (phase === "white") {
      /* balance() refuses a reference that is too dark or plainly colored, and
         that refusal is the useful half of it. */
      const test = balance([128, 128, 128], rgb);
      if (!test) {
        say.textContent = "That is not a white surface — too dark, or too colored to "
          + "correct against. Tap the clean part of the plate.";
        return;
      }
      whiteRef = rgb;
      beginDrop();
      return;
    }

    const corrected = balance(rgb, whiteRef);
    if (!corrected) {
      say.textContent = "Lost the white reference. Tap the plate again.";
      whiteRef = null;
      phase = "white";
      return;
    }
    shots.push(corrected);
    const at = elapsed();
    if (at > plan.total) {
      say.textContent = "That was taken after the read window closed. The color has moved on; run it again.";
    } else {
      say.textContent = plan.series
        ? `Sampled at ${mmss(at)}. Tap again as it changes, or accept below.`
        : `Sampled at ${mmss(at)}.`;
    }
    takeReading();
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
    h("p", { class: "scan__fine" },
      "Nobody has tested whether a phone can read these reactions reliably. "
      + "Light, your camera and the moment you tap all change the color. "
      + "This narrows the choice — your eyes against the chart make the call, "
      + "and the dropdown below works without any of this."),
    h("p", { class: "scan__fine" },
      "The picture never leaves your phone. Nothing is saved."),
  );

  paintStep();
  say.textContent = "Tap the clean white part of the plate first — that is how it "
    + "corrects for the light you are standing in.";

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
