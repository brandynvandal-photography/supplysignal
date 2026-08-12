/* "New since you last looked."
 *
 * This module exists to make one thing impossible to get wrong.
 *
 * The obvious implementation of a since-last-visit marker is a map of county
 * to timestamp: {"47065": "2026-08-10T..."}. That is a written record of which
 * counties a person checked and when, sitting in localStorage on a phone that
 * may be searched, shared, or taken. It would be one of the most sensitive
 * things this app could possibly store, and it would exist purely to render a
 * small grey line of text.
 *
 * So this stores ONE ISO timestamp and nothing else: when the app was last
 * opened. Every county's "new" count is derived from that single value at
 * render time. The stored data cannot reveal a county, a substance, or a
 * search, because it does not contain one.
 *
 * A deliberately static feature, too - no ticker, no motion, no polling. A
 * moving feed would imply real-time coverage this app does not have (the cold
 * rotation takes about a week to sweep every county), and movement draws the
 * eye of whoever else is in the room.
 *
 * Quick Exit clears it along with everything else.
 */

const KEY = "sc.seen";

/** Read once at load, BEFORE this visit overwrites it. */
const previous = (() => {
  try {
    const v = localStorage.getItem(KEY);
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;   // storage blocked or disabled - fall back to a fixed window
  }
})();

/** When this reader last opened the app, or null if unknown. */
export const lastVisit = () => previous;

/** Stamp this visit. Called once at boot, after `previous` is captured. */
export function markVisit() {
  try {
    localStorage.setItem(KEY, new Date().toISOString());
  } catch { /* nothing to do; the feature just degrades to a fixed window */ }
}

/** Fallback window when there is no previous visit to compare against. */
export const FALLBACK_DAYS = 7;

/**
 * How many of these clusters are new to this reader?
 *
 * `windowStart` is the beginning of the time range already on screen. If the
 * last visit was longer ago than that, "since you last looked" would silently
 * mean "everything shown" - the same number the heading already gives, dressed
 * up as news. In that case this falls back to a plain recency window and says
 * so, because a count is only worth showing if its label is true.
 *
 * Returns `{ count, sinceVisit }`; `sinceVisit === false` means the UI must use
 * the fixed-window wording rather than implying a memory it does not have.
 */
export function countNew(items, windowStart = 0) {
  const sinceVisit = previous !== null && previous > windowStart;
  const since = sinceVisit ? previous : Date.now() - FALLBACK_DAYS * 864e5;

  let count = 0;
  for (const it of items || []) {
    const t = Date.parse(it.eventDate);
    if (!Number.isNaN(t) && t >= since) count++;
  }
  return { count, sinceVisit };
}
