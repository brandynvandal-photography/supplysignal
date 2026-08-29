/* Keep a rebuilt dataset byte-identical when the upstream content has not moved.
 *
 * WHY THIS EXISTS, and it is worth being precise about it because the symptom
 * and the cause look nothing alike.
 *
 * The six reference datasets - substances, combos, reagents, emerging, regional,
 * mortality - each end with `generated: new Date().toISOString()`. So every
 * weekly refresh rewrote all six, even on a week when PsychonautWiki, TripSit,
 * CFSRE and Health Canada had all published nothing new. The diff was six files,
 * one line each, and the line was the clock.
 *
 * That is not merely noise. It is a standing invitation to lose real data:
 *
 *   2026-08-17 05:57  bot     refresh: emerging.json generated -> 08-17
 *   2026-08-18 14:32  human   a commit about ship.mjs           -> back to 08-11
 *   2026-08-24 05:59  bot     refresh: emerging.json generated -> 08-24
 *   2026-08-24 14:33  human   a commit about a workflow         -> back to 08-11
 *
 * Both human commits were about something else entirely and swept a stale
 * working copy of data/ along with them. Nobody noticed, and nothing could have
 * noticed, because a one-line timestamp revert inside a 500KB JSON file looks
 * exactly like the churn the refresh produces on its own. Every week the bot
 * wrote a change that carried no information, so a week where it reverted one
 * that did would have read the same.
 *
 * The fix is to make the refresh honest: if the payload is identical apart from
 * the stamp, keep the OLD stamp, and the file is byte-identical, and git has
 * nothing to commit. `generated` then means "when this content last changed"
 * rather than "when a script last ran" - which is the more useful of the two
 * readings anyway, and the only one a reader could act on.
 *
 * Byte-stability is already the stated property of build-topics.mjs ("run this
 * script twice and diff data/topics.json; it must be identical"). This extends
 * the same rule to the six files that feed it.
 *
 * NOT A UI CHANGE. Nothing reader-facing renders these six stamps - the "data
 * updated" badge and the footer both read alerts.json, which the hourly ingest
 * writes and which genuinely does change hourly. Checked before writing this.
 */

import { existsSync, readFileSync } from "node:fs";

/**
 * Return `payload` with its timestamp reverted to the one already on disk,
 * when nothing else about it has changed.
 *
 * Conservative in every failure case: a missing file, unreadable JSON, a
 * non-object, or a previous copy with no stamp all return the payload
 * untouched, so a build can never be blocked by this and a first build always
 * writes. The caller serializes and writes exactly as it did before - the six
 * scripts do not agree on indentation or trailing newlines, and this is not the
 * place to change that.
 *
 * @param {string} file  Path this payload is about to be written to.
 * @param {object} payload
 * @param {string} stamp Key holding the build time.
 */
export function stableStamp(file, payload, stamp = "generated") {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!existsSync(file)) return payload;

  let prev;
  try {
    prev = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return payload;                     // unparseable or truncated: rewrite it
  }
  if (!prev || typeof prev !== "object" || Array.isArray(prev)) return payload;
  if (typeof prev[stamp] !== "string") return payload;

  /* Compared with the stamp removed from BOTH sides, on the serialized form.
     Key order is part of the comparison on purpose: the same generator emits
     the same order run to run, so a reordering means the builder itself
     changed, and that is a change worth writing. */
  const without = (o) => {
    const c = { ...o };
    delete c[stamp];
    return JSON.stringify(c);
  };

  return without(prev) === without(payload)
    ? { ...payload, [stamp]: prev[stamp] }
    : payload;
}
