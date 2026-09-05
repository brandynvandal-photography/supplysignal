/* A countdown for a test strip, and nothing else.
 *
 * WHY THIS IS THE ONE PLACE A STEP-THROUGH EARNS ITS KEEP. Reading a strip is a
 * procedure carried out in real time with both hands busy and often wet. The
 * reader dips for fifteen seconds, then waits three or five minutes depending on
 * the brand, then reads. Right now the app prints those numbers and leaves the
 * counting to them - which means leaving the app for the phone's clock, at the
 * exact moment they are holding a wet strip.
 *
 * WHAT THIS DELIBERATELY IS NOT.
 *
 * No auto-advance. WCAG 2.2.1 allows a timer here only under the real-time
 * exception, which holds because the clock times a CHEMICAL REACTION rather than
 * the reader. Nothing on screen may move because time passed without the reader
 * pressing something; the moment it does, this becomes a timed interface for a
 * population that is impaired by definition, and the exception is gone.
 *
 * No wake lock. A screen held lit for five minutes is a disclosure event in this
 * app's own threat model - somebody walks past, the phone is picked up.
 *
 * No vibration and no sound. Both reach people who are not the reader.
 *
 * No persistence, therefore no resume. app.js wipes sessionStorage and every
 * cache on pagehide precisely so a seized phone carries nothing, and "resume
 * your fentanyl test" is itself the record. If the app is killed the count is
 * gone, which is why the card prints the WALL-CLOCK time to read at: a number
 * somebody read once still works when the software does not.
 *
 * DRIFT. The deadline is absolute - Date.now() + ms, computed once - and every
 * repaint recomputes the remainder from it. A decrementing counter loses time
 * whenever the tab is throttled, which a backgrounded phone browser does
 * aggressively, and losing time here means telling somebody to read early.
 *
 * LIFECYCLE. app.js clears the view on every navigation and there is no unmount
 * hook; pushState fires neither popstate nor hashchange, so nl:panic and
 * pagehide do NOT fire when somebody taps another tab. Every tick therefore
 * checks whether its element is still in the document and stops itself if not.
 * Without that an armed interval survives into the Emergency screen.
 *
 * TESTABILITY. `now` and `schedule` are injectable because the DOM shim in
 * test/views.test.mjs has no setInterval - the card has to build disarmed and
 * render its full text before anything starts.
 */

/** mm:ss, and never a bare number - "0:07" reads as time, "7" does not. */
export function mmss(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The wall-clock time a wait will end, as the reader's phone would show it.
 *
 * This is the single most useful thing on the card. It survives every failure
 * mode the countdown does not: the app being killed, the battery dying, the
 * phone being taken, the reader walking away and forgetting. A time they read
 * once - or write on their hand - still works when none of the software does.
 */
export function readAt(date, addSeconds) {
  const d = new Date(date.getTime() + addSeconds * 1000);
  let h = d.getHours();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
}

/**
 * A countdown that repaints from an absolute deadline.
 *
 * Returns { start, stop, tick, state } - no DOM of its own. The caller owns the
 * element and decides what the text says, because what it says is different for
 * a dip, a wait, and a strip that has been sitting too long.
 *
 * onPaint receives { remaining, elapsed, over } every repaint.
 */
/* Named rather than written inline as parameter defaults, for two reasons: the
   names say what each one is for, and test/refs.test.mjs collects parameter
   lists with a regex that cannot cross a nested paren - so a default of
   `() => Date.now()` made `now` look like an undefined global to it. Real
   constraint, honest fix. */
const wallClock = () => Date.now();
const everyQuarterSecond = (fn) => setInterval(fn, 250);
const stopTicking = (id) => clearInterval(id);

export function countdown(opts = {}) {
  /* Destructured WITHOUT defaults, then defaulted below. refs.test.mjs reads a
     destructuring pattern with a non-greedy match that stops at the first "=",
     so `el = null` inside the braces hid every name after it. Splitting the two
     steps is clearer to read and honest to the checker. */
  const { seconds, onPaint, el, now, schedule, cancel } = opts;
  const clockNow = now || wallClock;
  const arm = schedule || everyQuarterSecond;
  const disarm = cancel || stopTicking;
  let deadline = null;
  let handle = null;
  const state = { running: false, startedAt: null };

  const tick = () => {
    /* THE ELEMENT IS THE LIFETIME. See the header: there is no unmount hook and
       a tab tap fires nothing, so an interval that does not check this outlives
       the screen it belongs to. */
    if (el && !el.isConnected) { stop(); return; }
    const remaining = (deadline - clockNow()) / 1000;
    onPaint({
      remaining: Math.max(0, remaining),
      elapsed: (clockNow() - state.startedAt) / 1000,
      over: remaining <= 0,
    });
  };

  function start() {
    if (state.running) return;
    state.startedAt = clockNow();
    deadline = state.startedAt + seconds * 1000;
    state.running = true;
    tick();
    handle = arm(tick);
  }

  function stop() {
    if (handle != null) disarm(handle);
    handle = null;
    state.running = false;
  }

  return { start, stop, tick, state };
}
