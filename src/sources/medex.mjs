/**
 * County medical-examiner adapters.
 *
 * WHY THIS EXISTS
 *
 * Every other source in this project is somebody writing prose about drugs —
 * a health department press release, a local news story. That is why the
 * alerts came up empty for most of the country: 27 state feeds and a Google
 * News query per county, and the overwhelming majority of counties simply
 * never have an article written about their drug supply.
 *
 * A handful of county medical examiners publish their toxicology as open
 * data. That is a different kind of source. It does not depend on anyone
 * deciding a thing is newsworthy. It names the actual compounds — medetomidine,
 * N-pyrro protonitazene, bromazolam, ortho-methylfentanyl — on a lag of weeks
 * rather than the months a surveillance report takes.
 *
 * WHAT THIS IS NOT
 *
 * Mortality data is a lagging indicator, and it is only a handful of counties
 * (docs/ALERT-SOURCES.md has the full survey). This can say "medetomidine has
 * been turning up in this county's supply recently". It cannot say "there is a
 * bad batch right now". Nothing free and public can say that — the one national
 * real-time spike layer, ODMAP, is restricted to government agencies. So every
 * item this produces carries its lag in the body text, and severity is capped
 * at "elevated": "critical" in this project means an active ongoing spike, and
 * a toxicology report from three weeks ago is not evidence of one.
 *
 * PRIVACY
 *
 * These datasets carry age, race, sex, street, ZIP and lat/lon. None of it is
 * ever requested. The Socrata adapter names its columns in `$select`, so the
 * identifying fields are not merely discarded — they are never transferred.
 * The CKAN adapter goes further and aggregates server-side, so what comes back
 * is a substance and a count, with no row for any individual at all.
 *
 * What this module emits is a count over a county over a window. That carries
 * the same shape as everything else the app publishes: no person in it.
 */

const DAY = 86400000;

/**
 * The watchlist: adulterants and novel synthetics whose arrival in a supply
 * changes something for the person using it.
 *
 * Deliberately NOT here: fentanyl, cocaine, heroin, methamphetamine, ethanol.
 * They are present in nearly every record in every one of these datasets, so
 * an alert saying "fentanyl found in county" is both true and useless — it
 * would fire everywhere, every run, and teach people to ignore the feed.
 *
 * Also not here: despropionyl fentanyl / 4-ANPP. It is a fentanyl precursor
 * and metabolite that co-occurs with nearly every fentanyl finding, so it
 * tracks fentanyl rather than telling you anything fentanyl did not.
 *
 * The patterns run against two very different text shapes: Cook County's
 * free-text cause of death ("COMBINED DRUG (HEROIN, FENTANYL, ... AND PROBABLE
 * MEDETOMIDINE/DEXMEDETOMIDINE) TOXICITY") and Allegheny's clean per-column
 * names ("Para-Fluorofentanyl"). They are written to match both.
 */
export const WATCH = [
  ["medetomidine",     /\b(dex)?medetomidine\b/i],
  ["xylazine",         /\bxylazine\b/i],
  ["nitazenes",        /\b[a-z-]*nitazene\b/i],
  ["carfentanil",      /\bcarfentanil\b/i],
  ["fluorofentanyl",   /\b(para|ortho|meta|[opm])-?\s?fluorofentanyl\b/i],
  ["methylfentanyl",   /\b(para|ortho|meta|[opm])-?\s?methylfentanyl\b/i],
  ["acetylfentanyl",   /\bacetyl[\s-]?fentanyl\b/i],
  ["bromazolam",       /\bbromazolam\b/i],
  ["novel benzos",     /\b(flualprazolam|flubromazolam|clonazolam|etizolam)\b/i],
  ["BTMPS",            /\bbtmps\b/i],
  ["levamisole",       /\blevamisole\b/i],
];

/* Display names, for the alert text. Keyed by the canonical id above. */
export const LABEL = {
  medetomidine: "Medetomidine",
  xylazine: "Xylazine",
  nitazenes: "Nitazenes",
  carfentanil: "Carfentanil",
  fluorofentanyl: "Fluorofentanyl",
  methylfentanyl: "Methylfentanyl",
  acetylfentanyl: "Acetyl fentanyl",
  bromazolam: "Bromazolam",
  "novel benzos": "Novel benzodiazepines",
  BTMPS: "BTMPS",
  levamisole: "Levamisole",
};

const iso = (d) => new Date(d).toISOString().slice(0, 19);

/**
 * A date literal in the form this source's column can actually be compared to.
 *
 * Santa Clara stores EVERY column as text, dates included, and the values are
 * space-separated ("2026-07-06 22:37:00"). A 'YYYY-MM-DDTHH:MM:SS' literal
 * then compares wrong rather than erroring: at index 10 the data has a space
 * and the literal has a 'T', and ' ' sorts below 'T', so same-day records fall
 * on the wrong side of the bound. A date-only literal has no such index to
 * disagree at, and sorts correctly against the ISO prefix either way.
 *
 * Every bound in this module is therefore half-open - `> since` and
 * `< until` - because with a date-only literal `<= '2026-06-30'` would drop
 * everything that happened during 30 June.
 */
const dlit = (src, ms) =>
  src.dateType === "text" ? new Date(ms).toISOString().slice(0, 10) : iso(ms);

/** Year-month bucket expression. date_trunc_ym is a type error on text. */
const monthExpr = (src) =>
  src.dateType === "text"
    ? `substring(${src.dateField},1,7)`
    : `date_trunc_ym(${src.dateField})`;
const dayOnly = (s) => String(s || "").slice(0, 10);
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "0%");

/** "20 July" — no year, deliberately. See the gate2 note in emit(). */
const MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
/* Weeks, because "about 25 days behind" claims a precision this does not
   have - the lag moves as cases clear - and "about 1 days" is what the naive
   version printed the first time a source was fresher than expected. */
export function humanLag(days) {
  if (days <= 10) return "a week";
  const weeks = Math.round(days / 7);
  if (weeks >= 8) return `${Math.round(days / 30)} months`;
  return `${weeks} weeks`;
}

function niceDate(isoStr) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * One request, with a retry, because the first three production runs lost Cook
 * twice and Santa Clara once to "The operation was aborted due to timeout".
 *
 * Not rate limiting - a 429 is handled separately below and none appeared.
 * Socrata is simply slow from a GitHub Actions runner sometimes, and the
 * queries here are the expensive kind: a filtered aggregate over a few hundred
 * thousand rows. 30s was optimistic; Allegheny, whose whole tally runs
 * server-side and returns a dozen rows, never once timed out.
 *
 * The retry matters more than the longer ceiling. These are idempotent reads,
 * a county that fails goes quiet for the run, and a quiet county is
 * indistinguishable from one with nothing to report - so a transient failure
 * here is invisible rather than loud, which is the kind worth spending a
 * second attempt on.
 */
async function getJson(url, settings, attempt = 0) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": settings.polling.userAgent,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    if (attempt === 0) return getJson(url, settings, 1);
    throw e;
  }
  if (res.status === 429 || res.status === 503) {
    throw Object.assign(new Error(`rate limited`), { rateLimited: true });
  }
  if (res.status >= 500 && attempt === 0) return getJson(url, settings, 1);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Tally watchlist hits across a set of free-text strings, one record each. */
export function tally(texts) {
  const counts = new Map();
  for (const t of texts) {
    if (!t) continue;
    for (const [id, re] of WATCH) {
      if (re.test(t)) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Socrata (Cook County, Santa Clara). Free text, so the parsing happens here.
 * `$select` is the privacy boundary — only the date and the cause-of-death
 * columns are named, so nothing identifying crosses the wire.
 */
async function fetchSocrata(src, settings, since, until) {
  const cols = [src.dateField, ...src.textFields].join(",");
  const where = [
    src.where,
    `${src.dateField} > '${dlit(src, since)}'`,
    /* Upper bound, or the 9999-09-09 record lands in every window. */
    `${src.dateField} < '${dlit(src, until)}'`,
  ].filter(Boolean).join(" AND ");

  const url =
    `${src.url}?$select=${encodeURIComponent(cols)}` +
    `&$where=${encodeURIComponent(where)}` +
    `&$limit=50000`;

  const rows = await getJson(url, settings);
  return rows.map((r) => ({
    date: dayOnly(r[src.dateField]),
    text: src.textFields.map((f) => r[f] || "").join(" | "),
  }));
}

/**
 * CKAN with a SQL endpoint (Allegheny). The drugs are already in their own
 * columns, so the whole tally runs server-side and the response is a list of
 * (drug, count) pairs — no record for any individual is transferred.
 *
 * Returned in the same shape as fetchSocrata's rows so the caller does not
 * branch, with one synthetic row per death-with-that-drug. That is a count
 * standing in for records, which is all anything downstream uses it for.
 */
async function fetchCkanSql(src, settings, since, until) {
  const arr = src.drugColumns.join(",");
  const sql =
    `SELECT drug, COUNT(*) AS n FROM (` +
    `SELECT unnest(ARRAY[${arr}]) AS drug FROM "${src.resource}" ` +
    `WHERE ${src.dateField} > '${dlit(src, since)}' AND ${src.dateField} < '${dlit(src, until)}'` +
    `) t WHERE drug IS NOT NULL AND drug <> '' GROUP BY drug`;

  const data = await getJson(
    `${src.endpoint}?sql=${encodeURIComponent(sql)}`, settings
  );
  if (!data?.success) throw new Error(data?.error?.message || "CKAN query failed");

  const rows = [];
  for (const r of data.result.records || []) {
    const n = Number(r.n) || 0;
    for (let i = 0; i < n; i++) rows.push({ date: null, text: r.drug });
  }
  return rows;
}

/**
 * A separate count of DEATHS (not drug-mentions) in the window, for the
 * denominator. The unnest above counts one row per drug per death, so it
 * cannot supply it.
 */
async function ckanTotal(src, settings, since, until) {
  const sql =
    `SELECT COUNT(*) AS n FROM "${src.resource}" ` +
    `WHERE ${src.dateField} > '${dlit(src, since)}' AND ${src.dateField} < '${dlit(src, until)}'`;
  const data = await getJson(`${src.endpoint}?sql=${encodeURIComponent(sql)}`, settings);
  return Number(data?.result?.records?.[0]?.n) || 0;
}

/**
 * Latest record date in the dataset. This is the anchor for both windows and
 * for the staleness guard, so it has to be right.
 *
 * BOUNDED TO TODAY ON PURPOSE. Cook County's archive contains at least one
 * record dated 9999-09-09 — a sentinel, or a typo nobody caught. Taking the
 * unbounded max put the anchor five figures into the future, which made the
 * lag come out at -2,912,104 days and would have printed "the 90 days to 9
 * September" on every alert. Any dataset this size has a few of these.
 */
async function latestDate(src, settings) {
  const today = dlit(src, Date.now() + DAY);
  let v;
  if (src.kind === "socrata") {
    /* src.where MUST be applied here too. Without it, Cook anchored on the
       most recent death of any cause - a record from yesterday - while the
       windows below counted only opioid-flagged ones. Toxicology takes weeks,
       so the newest opioid record is weeks older than the newest record. The
       anchor sat a month ahead of the data it was anchoring, which quietly
       truncated the recent window and reported the lag as 1 day. */
    const where = [src.where, `${src.dateField} < '${today}'`]
      .filter(Boolean).join(" AND ");
    const url =
      `${src.url}?$select=max(${src.dateField})` +
      `&$where=${encodeURIComponent(where)}&$limit=1`;
    const r = await getJson(url, settings);
    v = Object.values(r?.[0] || {})[0];
  } else {
    const sql =
      `SELECT MAX(${src.dateField}) AS d FROM "${src.resource}" ` +
      `WHERE ${src.dateField} < '${today}'`;
    const data = await getJson(`${src.endpoint}?sql=${encodeURIComponent(sql)}`, settings);
    v = data?.result?.records?.[0]?.d;
  }
  if (!v) return null;
  const d = dayOnly(v);
  return Date.parse(d) > Date.now() ? null : d;
}

/**
 * Is `rc` hits out of `recentTotal` more than the baseline rate would throw up
 * by chance? Normal approximation to the binomial, one-sided.
 *
 * This exists because the first live run wanted to publish "medetomidine is
 * turning up more often, 6% against 3%" off 5 records out of 83. Doubling
 * sounds like a finding and at that count it is noise — the standard error on
 * 5/83 is nearly 3 points. Publishing it would spend the reader's attention on
 * a coin flip, and an alert feed that cries wolf gets ignored, including on
 * the day it is right.
 *
 * The same run found acetyl fentanyl at 11 of 83 against 14 of 751: z = 7.7.
 * That is the kind of change worth interrupting somebody for.
 */
export function zScore(rc, recentTotal, baseShare) {
  const expected = baseShare * recentTotal;
  const sd = Math.sqrt(recentTotal * baseShare * (1 - baseShare));
  if (!(sd > 0)) return Infinity;
  return (rc - expected) / sd;
}

/**
 * Monthly record counts, for the completeness check below.
 */
async function monthlyCounts(src, settings, since) {
  if (src.kind === "socrata") {
    const where = [src.where, `${src.dateField} > '${dlit(src, since)}'`,
                   `${src.dateField} < '${dlit(src, Date.now() + DAY)}'`]
      .filter(Boolean).join(" AND ");
    const url =
      `${src.url}?$select=${encodeURIComponent(`${monthExpr(src)} AS m, count(*) AS n`)}` +
      `&$where=${encodeURIComponent(where)}` +
      `&$group=${encodeURIComponent(monthExpr(src))}&$limit=200`;
    const rows = await getJson(url, settings);
    return rows.map((r) => ({ m: String(r.m).slice(0, 7), n: Number(r.n) || 0 }))
      .sort((a, b) => a.m.localeCompare(b.m));
  }
  const sql =
    `SELECT to_char(${src.dateField}, 'YYYY-MM') AS m, COUNT(*) AS n FROM "${src.resource}" ` +
    `WHERE ${src.dateField} > '${dlit(src, since)}' ` +
    `AND ${src.dateField} < '${dlit(src, Date.now() + DAY)}' ` +
    `GROUP BY 1 ORDER BY 1`;
  const data = await getJson(`${src.endpoint}?sql=${encodeURIComponent(sql)}`, settings);
  return (data?.result?.records || [])
    .map((r) => ({ m: r.m, n: Number(r.n) || 0 }))
    .sort((a, b) => a.m.localeCompare(b.m));
}

/** Last day of a YYYY-MM, as YYYY-MM-DD. */
function endOfMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * How recent can this county's data actually be trusted to be complete?
 *
 * NOT the same question as "what is the newest record", and getting them
 * confused is the trap this whole function exists to avoid. A medical
 * examiner's file fills in for months after the death: a few fast cases post
 * quickly and the bulk arrive as toxicology clears. Measured 2026-08-14:
 *
 *   Cook        steady near 60/month, then Jun 46, Jul 16
 *   Allegheny   steady near 26/month, then Feb 18, Mar 13, Apr 10, May 10, Jun 1
 *
 * Allegheny's newest record was 65 days old, which looks like a two-month lag
 * and is not one — it is still filling in April. Anchoring on the newest
 * record compared a 40%-complete recent window against a complete baseline.
 *
 * Worse than the noise is the direction of the bias: a case with an unusual
 * adulterant needs confirmatory testing and clears SLOWER than a routine one,
 * so the incomplete tail systematically under-represents exactly what this
 * module is looking for.
 *
 * So: take the median month over the span, walk back from the newest, and
 * anchor at the end of the first month holding at least `completeness` of it.
 * Self-calibrating, because every county's fill-in rate is different and each
 * one drifts.
 */
export function completeThrough(months, completeness) {
  if (months.length < 6) return null;
  /* Median over everything but the newest three, which are always partial and
     would drag the median down toward them. */
  const settled = months.slice(0, -3).map((x) => x.n).sort((a, b) => a - b);
  if (!settled.length) return null;
  const median = settled[Math.floor(settled.length / 2)];
  if (!median) return null;

  for (let i = months.length - 1; i >= 0; i--) {
    if (months[i].n >= median * completeness) {
      return { through: endOfMonth(months[i].m), median, month: months[i] };
    }
  }
  return null;
}

/**
 * Turn one comparison into an alert item.
 *
 * NOTE ON YEARS: the body must not contain a four-digit year. gate2 drops any
 * item mentioning a year that is not this one or last, as a retrospective —
 * which is right for a news article and would be wrong here, but the cheapest
 * fix is to not print years at all. "the 90 days to 20 July" is also simply
 * better copy for this than a full date.
 */
function emit(src, sub, r, b, totals, asOf, lagDays) {
  const label = LABEL[sub] || sub;
  const isNew = b.count === 0;
  const when = niceDate(asOf);

  const title = isNew
    ? `${label} is turning up in ${src.county}'s drug supply`
    : `${label} is turning up more often in ${src.county}'s drug supply`;

  const found =
    `${src.name} identified ${label.toLowerCase()} in ${r.count} of the ` +
    `${totals.recent} ${src.denominator || "overdose deaths"} it examined in the ` +
    `${src.recentDays} days` + (when ? ` to ${when}` : "") + ".";

  const versus = isNew
    ? ` It did not appear in the ${totals.base} it examined over the year before that.`
    : ` That is ${pct(r.count, totals.recent)} of them, against ` +
      `${pct(b.count, totals.base)} over the year before that.`;

  /* No time of day. "What is in it tonight" was written picturing someone
     reading this before going out, which is one reader among many - it lands
     wrong at eight in the morning, and an alert has no idea when it is being
     read. "Right now" makes the same point and is true whenever it is read. */
  const lag =
    ` Toxicology runs about ${humanLag(lagDays)} behind, so this describes what has` +
    ` been in the supply recently rather than what is in it right now.`;

  return {
    title,
    body: found + versus + lag,
    url: src.landing,
    pubDate: asOf,
    sourceId: src.id,
    sourceName: src.name,
    trust: src.trust ?? 1,
    hintFips: src.fips,
    hintState: src.state,

    /* Pre-scored: this is a structured fact from a named public dataset, not
       prose that needs interpreting. It skips the keyword classifier and the
       retrospective gate, both of which are built for news articles. It does
       NOT skip gate1 — recency is a safety property, not a formatting one. */
    preScored: {
      severity: "elevated",
      substances: [sub],
      confidence: 1,
      audit: {
        source: "medical-examiner",
        recent: `${r.count}/${totals.recent}`,
        baseline: `${b.count}/${totals.base}`,
        asOf,
      },
    },
  };
}

/**
 * One county medical examiner -> zero or more alert items.
 *
 * Compares a recent window against the year before it and reports the
 * watchlist substances that are new or materially more common. Everything
 * else stays quiet, which is most of it most of the time — that is the point.
 */
export async function fetchMedicalExaminer(src, settings, cfg = {}) {
  const recentDays = src.recentDays || cfg.recentDays || 90;
  const baselineDays = src.baselineDays || cfg.baselineDays || 365;
  const minCount = src.minCount ?? cfg.minCount ?? 3;
  const riseFactor = cfg.riseFactor ?? 2;
  const zMin = cfg.zMin ?? 2;
  const maxLagDays = cfg.maxLagDays ?? 150;
  const completeness = cfg.completeness ?? 0.7;

  src.recentDays = recentDays;

  /* Staleness guard. Connecticut's equivalent dataset stopped updating twenty
     months ago and still answers every query cheerfully; a county that quietly
     freezes would otherwise keep republishing a stale window forever. */
  const newest = await latestDate(src, settings);
  if (!newest) return { items: [], skipped: "no_max_date" };

  /* The anchor is the last COMPLETE month, not the newest record. See
     completeThrough() for why those are months apart. */
  const months = await monthlyCounts(
    src, settings, Date.now() - (recentDays + baselineDays + 120) * DAY
  );
  const complete = completeThrough(months, completeness);
  const latest = complete ? complete.through : newest;

  const lagDays = Math.round((Date.now() - Date.parse(latest)) / DAY);
  if (lagDays > maxLagDays) {
    return { items: [], skipped: `stale:${lagDays}d`, latest, newest };
  }

  /* Anchor both windows to the DATA, not to the clock.
   *
   * Anchoring to now looked obviously right and was wrong: Allegheny publishes
   * on a 65-day lag, so a 90-day window ending today overlapped 25 days of
   * actual records and found 3 deaths to compare against a baseline of 271.
   * Every one of these datasets lags, by a different amount, and the amount
   * changes. Ending the window at the last record the county has published
   * gives a full window everywhere and makes the comparison mean the same
   * thing across counties. The lag itself is reported in the body text. */
  const anchor = Date.parse(latest) + DAY;
  const recentFrom = anchor - recentDays * DAY;
  const baseFrom = recentFrom - baselineDays * DAY;

  /* CKAN needs the whole span, because its baseline is derived by subtracting
     the recent counts from it. Socrata filters client-side, so asking for the
     full span meant the recent window was transferred twice - and the recent
     window is the expensive half, being the one with the free text in it.
     Disjoint ranges: nothing crosses the wire more than once. */
  const fetcher = src.kind === "socrata" ? fetchSocrata : fetchCkanSql;
  const [recentRows, allRows] = await Promise.all([
    fetcher(src, settings, recentFrom, anchor),
    fetcher(src, settings, baseFrom, src.kind === "socrata" ? recentFrom : anchor),
  ]);

  /* The baseline is everything since baseFrom MINUS the recent window. For
     Socrata that is a date filter; for CKAN the rows are synthetic and carry
     no date, so subtract the counts instead. */
  let recentTotal, baseTotal, recentCounts, baseCounts;
  if (src.kind === "socrata") {
    /* allRows IS the baseline now - the ranges no longer overlap. */
    recentTotal = recentRows.length;
    baseTotal = allRows.length;
    recentCounts = tally(recentRows.map((r) => r.text));
    baseCounts = tally(allRows.map((r) => r.text));
  } else {
    const [rT, aT] = await Promise.all([
      ckanTotal(src, settings, recentFrom, anchor),
      ckanTotal(src, settings, baseFrom, anchor),
    ]);
    recentTotal = rT;
    baseTotal = aT - rT;
    recentCounts = tally(recentRows.map((r) => r.text));
    const allCounts = tally(allRows.map((r) => r.text));
    baseCounts = new Map();
    for (const [k, v] of allCounts) baseCounts.set(k, v - (recentCounts.get(k) || 0));
  }

  if (!recentTotal) return { items: [], skipped: "empty_window", latest };

  const items = [];
  for (const [sub] of WATCH) {
    const rc = recentCounts.get(sub) || 0;
    if (rc < minCount) continue;
    const bc = Math.max(0, baseCounts.get(sub) || 0);

    const recentShare = rc / recentTotal;
    const baseShare = baseTotal ? bc / baseTotal : 0;

    /* Two different questions, and they need two different tests.
     *
     * A substance with no baseline at all has ARRIVED, and there is no rate to
     * compare it against - minCount is the whole bar.
     *
     * One that was already there has to have moved by more than sampling noise
     * before it is worth telling anyone. Both the ratio and the z-score have
     * to clear: the ratio keeps a statistically clean but tiny move quiet, and
     * the z-score keeps a dramatic-looking move on four records quiet. */
    if (bc === 0) {
      if (rc < minCount) continue;
    } else {
      if (recentShare < baseShare * riseFactor) continue;
      if (zScore(rc, recentTotal, baseShare) < zMin) continue;
    }

    items.push(emit(
      src, sub,
      { count: rc, share: recentShare },
      { count: bc, share: baseShare },
      { recent: recentTotal, base: baseTotal },
      latest, lagDays
    ));
  }

  return { items, latest, newest, lagDays, recentTotal, baseTotal };
}
