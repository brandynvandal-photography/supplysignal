/* A quiet line of warmth at the foot of each screen.
 *
 * Almost everyone opening this app has been treated badly by something -
 * an institution, a family, a doctor, a police officer, a version of the
 * internet that talks about them as a statistic. The information here is
 * clinical by necessity. It should not be the ONLY register the app speaks in.
 *
 * Rules these lines follow, all of which are easy to break by accident:
 *
 *   1. Never imply safety. Nothing warm may sound like reassurance about a
 *      substance. Warmth is about the PERSON, never about the drug supply.
 *   2. Never conditional. No "you can get better", no "there's still time",
 *      no nudge toward treatment or abstinence. Someone can use this app
 *      forever, still using, and that is a legitimate way to use it.
 *   3. Never hollow. "You've got this!" is the voice of a habit tracker and it
 *      reads as insulting to a person in withdrawal at 3am.
 *   4. Never a reward. These are not unlocked, earned, or streak-based. That
 *      would be a retention mechanic wearing kind clothes.
 *   5. Say it out loud first. If you would not say it to someone standing in
 *      front of you, cut it. An earlier set read like greeting cards - "your
 *      worth was never up for debate", "there is no version of you that
 *      deserves to be hurt" - balanced, abstract, and composed. Nobody talks
 *      like that, and a line that sounds written sounds like it was aimed at
 *      a demographic rather than at the person reading it. Prefer short,
 *      contracted, slightly plain. "Nobody deserves to get hurt. That includes
 *      you." is the same thought said by a human.
 *
 * The line is picked deterministically from the screen name and the calendar
 * day, so it does not flicker between renders and does not need anything
 * stored to stay stable. Nothing about the reader is involved in the choice -
 * there is nothing to profile with.
 *
 * These live here rather than in the locale files for now; translating them
 * needs a person who can carry tone, not a string swap. See i18n.js.
 */

const LINES = [
  "Glad you’re here.",
  "You don’t have to be doing well to deserve help.",
  "Nobody has to earn help. That includes you.",
  "You are loved.",
  "Thank you for taking care of yourself.",
  "You’re not a problem to be fixed.",
  "You’re welcome here.",
  "Nobody’s keeping score.",
  "Come back whenever you want to.",
  "You don’t have to explain why you’re here.",
  "Nobody deserves to get hurt. That includes you.",
  "You know your life better than anyone does.",
  "You matter today. Not once you change. Today.",
  "Whatever today’s been, you got through it.",
];

/* Warm, soft, and none of them alarming. Deliberately no ❤️ - the pure red
   heart reads as urgent next to overdose content, and 💔 or 🙏 would be
   pitying. These are the gentle end of the set. */
const DECOR = ["💛", "🤍", "💚", "💜", "🌷", "✨", "🌿", "🕊️"];

/* Small deterministic hash. Not security-relevant - it only needs to spread
   the strings evenly and give the same answer twice in a row. */
function hash(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const pick = (seed) => LINES[hash(seed) % LINES.length];

/** Matching pair, so a line is framed rather than bookended by two unrelated
 *  symbols. Same seed in, same pair out. */
function pickPair(seed) {
  const ch = DECOR[hash(`deco:${seed}`) % DECOR.length];
  return [ch, ch];
}

/**
 * @param {string} screen  route name, so the line varies from screen to screen.
 *   Twelve lines across six screens means two screens sometimes land on the
 *   same one; that is a collision, not a bug, and it is cheaper to live with
 *   than a de-duplication pass that would make the choice stateful.
 * @returns {HTMLElement}
 */
export function kindLine(screen) {
  const day = new Date().toISOString().slice(0, 10);
  const seed = `${screen}:${day}`;
  return lineEl(pick(seed), pickPair(seed));
}

/** One rendered line: decoration, sentence, decoration. */
function lineEl(text, [left, right]) {
  const el = document.createElement("p");
  el.className = "kind";

  /* The emoji are ARIA-HIDDEN and the sentence is not.
     A screen reader would otherwise announce "sparkling heart, You don't have
     to earn help, sparkling heart" - the decoration read aloud as though it
     were content. Sighted readers get the warmth; everyone gets the sentence. */
  const deco = (ch) => {
    const s = document.createElement("span");
    s.className = "kind__deco";
    s.setAttribute("aria-hidden", "true");
    s.textContent = ch;
    return s;
  };

  el.append(deco(left), document.createTextNode(text), deco(right));
  return el;
}

/**
 * The persistent bar at the top of every screen except Emergency, cycling
 * slowly through the lines.
 *
 * This is a ticker, which this project had previously ruled out - so the
 * things that made a ticker a bad idea are each handled rather than ignored:
 *
 *   - MOTION IS A CROSS-FADE, NOT A SCROLL. Nothing travels across the screen.
 *     Peripheral vision is drawn by movement far more than by a change of
 *     opacity, and this app gets used where someone else may be in the room.
 *   - SLOW. Twelve seconds a line. Long enough to read twice and forget about;
 *     short enough that a second line arrives while you are still on the page.
 *   - REDUCED MOTION IS RESPECTED ABSOLUTELY. Not "a faster fade" - no cycle at
 *     all. One line, chosen for the day, held.
 *   - IT DOES NOT SPEAK. The bar is aria-hidden while cycling, because a live
 *     region that re-announces a new sentence every twelve seconds would make
 *     the app unusable with a screen reader. The lines are decorative warmth,
 *     never information, so nothing is lost by not announcing them - and the
 *     first line IS announced once, on arrival.
 *   - IT STOPS WHEN NOBODY IS LOOKING. Paused on a hidden tab, so it costs no
 *     battery in a pocket.
 *
 * Returns a stop() for completeness; nothing calls it today.
 */
export function mountKindBar(host) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const day = new Date().toISOString().slice(0, 10);

  /* Start at the day's line so the bar is stable on arrival, then walk the
     list. Deterministic start, no storage, nothing about the reader. */
  let i = hash(`kind:${day}`) % LINES.length;

  const render = () => {
    const el = lineEl(LINES[i], pickPair(`deco:${i}:${day}`));
    host.replaceChildren(el);
    return el;
  };

  let current = render();

  if (reduce?.matches) return () => {};   // one line, held. No cycle at all.

  /* Once cycling, the bar stops being announced - see the note above. The
     first line was already in the DOM when the page was read. */
  host.setAttribute("aria-hidden", "true");

  const INTERVAL = 12000;
  const FADE = 600;
  let timer = null;

  const step = () => {
    current.classList.add("kind--out");
    setTimeout(() => {
      i = (i + 1) % LINES.length;
      current = render();
      current.classList.add("kind--in");
      requestAnimationFrame(() => current.classList.remove("kind--in"));
    }, FADE);
  };

  const start = () => { if (!timer) timer = setInterval(step, INTERVAL); };
  const stop = () => { clearInterval(timer); timer = null; };

  start();
  document.addEventListener("visibilitychange", () => {
    document.hidden ? stop() : start();
  });

  /* Someone who turns reduced-motion on mid-session should stop seeing motion
     immediately, not on next load. */
  reduce?.addEventListener?.("change", (e) => { if (e.matches) stop(); });

  return stop;
}
