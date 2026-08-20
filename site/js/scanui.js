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
 * Open the sheet.
 *
 * step  — the chart step: { reagent, colors, none, read, sequenceOrAny }
 * onPick(colorName) — called if the reader chooses one of the candidates.
 *
 * Returns a close function. Resolves nothing: the answer arrives through
 * onPick, or does not arrive, and both are fine.
 */
export function openScanner(step, onPick) {
  const plan = capturePlan(step);
  /* No published read window, no scanner. The charts carry one for every step
     they define; a reagent outside them has no time we can stand behind, and
     guessing one would be inventing procedure. */
  if (!plan) return null;

  const allowed = (step.colors || []).filter(Boolean);
  let stream = null;
  let raf = 0;
  let phase = "white";        // white -> drop -> done
  let whiteRef = null;
  let ticker = 0;
  let started = 0;
  const shots = [];           // for a sequenceOrAny step

  const video = h("video", { class: "scan__video", playsinline: "", muted: "", autoplay: "" });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const say = h("p", { class: "scan__say" });
  const clock = h("p", { class: "scan__clock", role: "timer", "aria-live": "off" });
  const out = h("div", { class: "scan__out" });

  const sheet = h("div", { class: "scan", role: "dialog", "aria-modal": "true",
                           "aria-label": `Read the ${step.reagent} result with the camera` });

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
        onClick: () => { onPick(c.name); close(); },
      }, h("span", { class: `swatch swatch--${c.name}`, "aria-hidden": "true" }), " ", c.name))));
    out.appendChild(h("p", { class: "sec__note" },
      "Nothing is filled in until you tap one."));
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
          + `Tap the middle of the ${step.reagent} well.`;
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
      phase = "drop";
      started = Date.now();
      say.textContent = `Now tap the middle of the ${step.reagent} well.`;
      clock.textContent = plan.series
        ? `${mmss(plan.total)} window — tap it a few times as it develops`
        : `read within ${mmss(plan.total)}`;
      ticker = setInterval(() => {
        const left = plan.total - elapsed();
        clock.textContent = left > 0
          ? `${mmss(left)} left in the read window`
          : "past the read window — this reading is no longer good";
        if (left <= 0) clearInterval(ticker);
      }, 1000);
      return;
    }

    const corrected = balance(rgb, whiteRef);
    if (!corrected) {
      say.textContent = "Lost the white reference. Tap the plate again.";
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
    if (!plan.series) phase = "done";
  }

  video.addEventListener("click", onTap);

  sheet.append(
    h("div", { class: "scan__bar" },
      h("strong", null, `${step.reagent} — camera`),
      h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: close }, "Close")),
    video,
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

  say.textContent = "Tap the clean white part of the plate first — that is how it "
    + "corrects for the light you are standing in.";

  /* Said once, up front, because the plate in frame will have other wells on
     it and the app cannot tell which is which. */
  sheet.insertBefore(
    h("p", { class: "scan__which" },
      `Reading the `, h("strong", null, step.reagent), ` well. `,
      `Other wells will be in shot — this reads only where you tap, so tap the right one.`),
    say,
  );

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
