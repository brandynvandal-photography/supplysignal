/* One session-scoped marker, and what it is no longer allowed to be.
 *
 * This module used to power "new since you last looked", backed by an ISO
 * timestamp in localStorage. That is gone, and the reason is worth writing
 * down so nobody rebuilds it.
 *
 * The app now keeps NOTHING across sessions (see app.js). A last-opened
 * timestamp that cannot outlive the tab cannot answer "since you last looked"
 * - on the first load of a session there is nothing to compare against, and on
 * a reload there is only a stamp from minutes ago, which would render "3 new
 * since you last looked" as a technically-true, functionally-useless line. A
 * count is only worth showing if its label is true, so the label is now always
 * the plain recency window and the count is computed from that.
 *
 * What remains is one value in sessionStorage, used for exactly one thing:
 * not showing the welcome card twice in the same session. It dies with the
 * tab. It never contained a county or a substance even when it persisted -
 * the obvious implementation of this feature is a map of county to timestamp,
 * which would be a written record of what someone checked and when, on a phone
 * that may be searched. That was never built and must not be.
 */

const KEY = "sc.seen";

/** Read once at load, BEFORE this visit overwrites it. */
const previous = (() => {
  try {
    const v = sessionStorage.getItem(KEY);
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;   // storage blocked or disabled - the welcome card just shows
  }
})();

/** Whether the app has already been opened in THIS session. */
export const lastVisit = () => previous;

/** Stamp this visit. Called once at boot, after `previous` is captured. */
export function markVisit() {
  try {
    sessionStorage.setItem(KEY, new Date().toISOString());
  } catch { /* nothing to do; the welcome card just shows again */ }
}

/** The recency window every "new" count is measured against. */
export const FALLBACK_DAYS = 7;

/**
 * How many of these clusters landed inside the recency window.
 *
 * Always a fixed window now - see the module note. The caller must use
 * wording that describes a period ("in the last 7 days"), never wording that
 * implies the app remembers the reader ("since you last looked"), because it
 * deliberately does not.
 */
export function countNew(items) {
  const since = Date.now() - FALLBACK_DAYS * 864e5;
  let count = 0;
  for (const it of items || []) {
    const t = Date.parse(it.eventDate);
    if (!Number.isNaN(t) && t >= since) count++;
  }
  return { count };
}
