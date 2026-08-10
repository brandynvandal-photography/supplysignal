/**
 * Recency gates. This is the module that exists because a 2023 advisory
 * surfaced as current is worse than returning nothing at all.
 *
 * G1  ingest      - resolve a publish date or drop the item outright
 * G2  event date  - reject retrospectives about older incidents
 * G3  query time  - re-filter on read and on the nightly aging pass
 */

const DAY = 86400000;

/** Gate 1. Resolve a publish date from the least-unreliable field available. */
export function resolvePublishedAt(item) {
  const candidates = [
    item.pubDate,
    item.published,
    item.updated,
    item.dcDate,
    item.lastModified,
    item.pageAge, // web search results expose this
  ];
  for (const c of candidates) {
    if (!c) continue;
    const t = Date.parse(c);
    if (!Number.isNaN(t) && t <= Date.now() + 2 * DAY) return new Date(t);
  }
  return null;
}

export function gate1(item, settings) {
  const published = resolvePublishedAt(item);
  if (!published) {
    // Never default an undated item to "now". This is the single biggest
    // vector for old content resurfacing as current.
    return settings.recency.dropUndated
      ? { pass: false, reason: "undated" }
      : { pass: true, published: null };
  }
  const age = Date.now() - published.getTime();
  if (age > settings.recency.windowDays * DAY) {
    return { pass: false, reason: "outside_window" };
  }
  return { pass: true, published };
}

/**
 * Gate 2. A 2026 article recounting a 2023 spike passes every publish-date
 * check, so look at the text itself. Two signals:
 *   a) a year mentioned that is neither this year nor last
 *   b) retrospective phrasing near a substance term
 */
export function gate2(item, vocab, settings) {
  const text = `${item.title} ${item.body || ""}`.toLowerCase();
  const nowYear = new Date().getUTCFullYear();

  if (settings.recency.dropForeignYears) {
    const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
    const foreign = years.filter((y) => y < nowYear - 1 && y > 1980);
    if (foreign.length) {
      return { pass: false, reason: `foreign_year:${foreign[0]}` };
    }
  }

  const retro = vocab.retrospectivePhrases.filter((p) => text.includes(p));
  if (retro.length >= 2) {
    return { pass: false, reason: `retrospective:${retro[0]}` };
  }

  return { pass: true };
}

/** Gate 3. Applied on read and by the nightly aging job. */
export function withinWindow(isoDate, days) {
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * DAY;
}

export function clampWindow(requested, settings) {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return settings.recency.defaultWindowDays;
  return Math.min(n, settings.recency.windowDays);
}
