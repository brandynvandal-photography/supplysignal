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
  ["nitazenes",        /\b[a-z-]*nitazenes?\b/i],
  ["carfentanil",      /\bcarfentan[iy]l\b/i],
  ["fluorofentanyl",   /\b(?:(?:para|ortho|meta|[opm234])-?\s?)?fluorofentanyl\b/i],
  ["methylfentanyl",   /\b(?:(?:para|ortho|meta|[opm234])-?\s?)?methylfentanyl\b/i],
  ["acetylfentanyl",   /\bacetyl[\s-]?fentanyl\b/i],
  ["bromazolam",       /\bbromazolam\b/i],
  ["novel benzos",     /\b(flualprazolam|flubromazolam|(?:\d-?amino)?clonazolam|etizolam|metizolam)\b/i],
];

/* NOT ON THE WATCHLIST, AND THIS IS THE EVIDENCE FOR IT.
 *
 * levamisole and BTMPS were here and produced nothing, anywhere, ever.
 * Measured across all four sources on 2026-08-14, over 455 days:
 *
 *   Cook          0 mentions, opioid-flagged or not
 *   Allegheny     0 - and Allegheny has NO drug-class filter at all
 *   Santa Clara   0 for the entire dataset
 *   San Diego     0 for the entire dataset
 *
 * A review flagged these as hidden by the opioid-only filters on Cook and San
 * Diego, and suggested widening those denominators to expose them. The data
 * says otherwise: they are absent from the one county that filters nothing,
 * so no filter is what is hiding them.
 *
 * They are absent because of what a medical examiner measures. Toxicology
 * establishes what killed someone. Levamisole is a cocaine cutting agent
 * present at concentrations that do not kill, and BTMPS is an industrial
 * additive nobody screens for on a death panel - both are drug-CHECKING
 * findings, which is a different instrument answering a different question.
 * A mortality source cannot see them and listing them here only implied it
 * could. If drug-checking data ever lands (docs/ALERT-SOURCES.md tier 3),
 * they belong on its watchlist, not this one. */

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
/**
 * Socrata's app token, when one is configured.
 *
 * Unauthenticated Socrata requests share a per-IP pool with every other
 * anonymous caller, and a GitHub Actions runner is a busy, shared address. A
 * token moves the request into its own much larger bucket. It is an
 * identifier for THIS APPLICATION, not for any reader - no user data is
 * involved and nothing about it touches the browser, which is why it can be
 * added without disturbing the privacy design.
 *
 * Optional by construction: absent, every request goes out exactly as before.
 * CKAN sources (Allegheny) ignore it entirely - it is a Socrata mechanism, so
 * it cannot help the one source that has been failing most.
 */
const SOCRATA_TOKEN = process.env.SOCRATA_APP_TOKEN || "";

/* Retries, and an honest note about what they cannot fix.
 *
 * Allegheny's CKAN SQL endpoint fails in BURSTS. Measured 2026-08-14: the
 * identical query returned 200 twice then 500; minutes later five consecutive
 * full runs failed every call; minutes after that everything answered again.
 * Throughout, plain datastore_search on the same resource stayed at 200, so
 * this is datastore_search_sql on their side, not the query or the network.
 *
 * Three attempts with a backoff covers a single bad call. It does NOT cover a
 * burst lasting a minute, and no reasonable retry budget would - pretending
 * otherwise would just mean a slower failure. What actually protects the
 * reader is downstream: the source is skipped, the county goes quiet for that
 * run, and writeCounty merges rather than replaces, so an alert already
 * published stays published. sourcesFailed is where this shows up.
 *
 * Note also that a Socrata app token cannot help here. Allegheny is CKAN. */
const MAX_ATTEMPTS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, settings, attempt = 0, socrata = false) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": settings.polling.userAgent,
        accept: "application/json",
        /* Keyed on the SOURCE KIND, not on the URL. Sniffing the hostname sent
           the token to data.wprdc.org, which is CKAN and has no use for it -
           handing a credential to a third party for nothing. */
        ...(socrata && SOCRATA_TOKEN ? { "X-App-Token": SOCRATA_TOKEN } : {}),
      },
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    if (attempt + 1 < MAX_ATTEMPTS) {
      await sleep(600 * (attempt + 1));
      return getJson(url, settings, attempt + 1, socrata);
    }
    throw e;
  }
  if (res.status === 429 || res.status === 503) {
    throw Object.assign(new Error(`rate limited`), { rateLimited: true });
  }
  if (res.status >= 500 && attempt + 1 < MAX_ATTEMPTS) {
    await sleep(600 * (attempt + 1));
    return getJson(url, settings, attempt + 1, socrata);
  }
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

  const rows = await getJson(url, settings, 0, true);
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
    const r = await getJson(url, settings, 0, true);
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
 * Fisher's exact test, one-sided.
 *
 * REPLACED A Z-TEST THAT WAS WRONG IN TWO DIRECTIONS AT ONCE.
 *
 * The old zScore compared `rc` against the baseline rate as though that rate
 * were KNOWN. It is not - it is estimated from a few hundred deaths, and a
 * baseline that lands low by chance both lowers the ratio bar and shrinks the
 * standard deviation, so the two errors compound. Exact enumeration over both
 * binomials put the real false-alarm rate at 2.7x the nominal one: for a
 * Cook-sized county the gate fired on pure noise 8% of the time per test.
 * Across 11 substances x 4 counties x ~4 windows a year that is roughly one
 * invented "X is turning up more often" per county per year with nothing
 * whatsoever happening in the supply.
 *
 * The normal approximation was the second problem, pushing the same way: at
 * the counts that actually trigger these alerts (rc of 3 to 7) the true tail
 * ran 1.5x to 8x what the printed z implied.
 *
 * Fisher's exact fixes both by construction. It conditions on the margins, so
 * the baseline being an estimate is handled rather than assumed away, and it
 * is exact, so there is no approximation to be optimistic at small n. It is
 * also the honest thing to put in the audit trail: a p-value that means what
 * it says, rather than a z that overstates itself.
 *
 * Verified against R: fisher.test(matrix(c(3,1,1,3)), alternative="greater")
 * gives 0.2429, and so does this.
 */
const LANCZOS = [
  76.18009172947146, -86.50532032941677, 24.01409824083091,
  -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
];
function lnGamma(z) {
  let y = z, tmp = z + 5.5;
  tmp -= (z + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += LANCZOS[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / z);
}
const lnChoose = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);

/** P(as many or more hits in the recent window, given the pooled rate). */
export function exactP(rc, recentTotal, bc, baseTotal) {
  const a = rc, b = recentTotal - rc, c = bc, d = baseTotal - bc;
  if (a < 0 || b < 0 || c < 0 || d < 0) return 1;
  const n = a + b + c + d, rowR = a + b, colH = a + c;
  if (!n || !rowR || !colH || colH === n) return 1;

  let p = 0;
  for (let x = a; x <= Math.min(rowR, colH); x++) {
    const y = rowR - x, z = colH - x, w = (c + d) - z;
    if (y < 0 || z < 0 || w < 0) continue;
    p += Math.exp(lnChoose(colH, x) + lnChoose(n - colH, y) - lnChoose(n, rowR));
  }
  return Math.min(1, Math.max(0, p));
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
    const rows = await getJson(url, settings, 0, true);
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
 * NOT the same question as "what is the newest record", and confusing them is
 * the trap this function exists for. A medical examiner's file fills in for
 * months after the death: a few fast cases post quickly and the bulk arrive as
 * toxicology clears. Measured 2026-08-14:
 *
 *   Cook        steady near 60/month, then Jun 46, Jul 16
 *   Allegheny   steady near 26/month, then Feb 18, Mar 13, Apr 10, May 10, Jun 1
 *
 * TWO SIGNALS, BECAUSE ONE IS NOT ENOUGH. The first version compared each
 * month against the median of the whole span, and that single test failed in
 * both directions:
 *
 *   A county whose caseload GENUINELY FELL never re-anchored. Constructed
 *   series: 14 months at 40, then a real and complete new regime at 18. The
 *   span median stays 40, the bar stays 28, and no month at the true new rate
 *   can ever clear it - so the anchor froze permanently, aged past
 *   maxLagDays, and the source was dropped as "stale" while it was publishing
 *   perfectly good current data. Seasonal counties failed the same way,
 *   silently discarding every winter.
 *
 *   A SURGE anchored on a half-filled month. 13 steady months at 30, then a
 *   July whose real count is 60 with only 33 filed - 55% complete, but 33
 *   clears a bar of 21, so the window ended inside it. The missing 45% skews
 *   toward the cases needing confirmatory testing, which is to say toward the
 *   unusual adulterants. A false negative exactly when the feed's one job is
 *   to fire.
 *
 * So: completeness is judged by AGE, which cannot be confused with level, and
 * the level test is kept only as a sanity check against the months around it
 * rather than against the whole span. A month is the anchor when it is old
 * enough to have filled in AND is not obviously short next to its own
 * neighbours - a local comparison, so a genuine decline simply becomes the new
 * normal instead of an anomaly forever.
 */
export function completeThrough(months, completeness, minAgeMonths = 2) {
  if (months.length < 6) return null;

  /* Age first. Nothing newer than this can be trusted however full it looks,
     which is what defeats the surge case. */
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - minAgeMonths);
  const oldEnough = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}`;

  for (let i = months.length - 1; i >= 0; i--) {
    const m = months[i];
    if (m.m > oldEnough) continue;

    /* Local reference: the six months before this one, which are older and so
       further along in filling. Compared against the whole span, this is what
       lets a real decline or a seasonal trough be accepted as complete. */
    const prior = months.slice(Math.max(0, i - 6), i).map((x) => x.n).sort((a, b) => a - b);
    if (!prior.length) continue;
    const local = prior[Math.floor(prior.length / 2)];

    /* A zero month is never an anchor: a county that has stopped publishing
       must fail closed rather than report a full window of nothing. */
    if (!m.n) continue;

    /* A PLATEAU is a new normal; a fill-in curve is not.
     *
     * The local median alone cannot see a regime change, because during one
     * the preceding months are still mostly at the old rate - a county that
     * genuinely halved its caseload stayed rejected forever. Three
     * consecutive months sitting within 20% of each other is the shape a
     * settled level makes and the shape a filling tail does not: Allegheny's
     * real tail runs 18, 13, 10, 10, 1, which never holds still. */
    const run = [months[i - 2], months[i - 1], m].filter(Boolean).map((x) => x.n);
    const plateau = run.length === 3 && Math.min(...run) > 0 &&
      (Math.max(...run) - Math.min(...run)) / Math.max(...run) <= 0.2;

    if (!plateau && local && m.n < local * completeness) continue;

    return { through: endOfMonth(m.m), local, month: m };
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
    evidence: src.evidence || "lab",
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
export async function fetchMedicalExaminer(src, settings, cfg = {}, state = {}) {
  const recentDays = src.recentDays || cfg.recentDays || 90;
  const baselineDays = src.baselineDays || cfg.baselineDays || 365;
  const minCount = src.minCount ?? cfg.minCount ?? 3;
  const riseFactor = cfg.riseFactor ?? 2;
  /* One in a thousand per test. With 11 substances across 4 counties and
     roughly four independent windows a year, that budgets about a quarter of
     one false alert per year across the whole feed - which is the trade this
     project asks for. A looser bar is not a nicer feed; it is a feed people
     learn to ignore. */
  const maxP = cfg.maxP ?? 0.001;
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

  /* ONE STATISTICAL LOOK PER DATA STATE.
   *
   * The ingest runs eight times a day; a county's file changes about weekly.
   * So the same filling window was being re-tested ten or more times, and
   * every extra look is another chance for noise to cross the bar. Measured by
   * Monte Carlo over a Cook-sized county with nothing happening: a single
   * final look fires 8.0% of the time, but ANY look across twelve fires 11.1%
   * - a 1.37x inflation on top of the per-test rate, purely from asking
   * repeatedly.
   *
   * So the verdict is cached against a fingerprint of the numbers it was
   * computed from. Unchanged data returns the SAME items rather than no items:
   * suppressing them would wipe the county's alert out of the bundle on the
   * next write. The test is what must not be re-run, not the publication. */
  const fingerprint = JSON.stringify({
    latest, recentTotal, baseTotal,
    counts: [...recentCounts.entries()].sort(),
    base: [...baseCounts.entries()].sort(),
  });
  const prior = state[src.id];
  if (prior && prior.fingerprint === fingerprint) {
    return {
      items: prior.items || [], cached: true,
      fingerprint, latest, newest, lagDays, recentTotal, baseTotal,
    };
  }

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
    let p = null;
    if (bc === 0) {
      /* Arrived. There is no rate to test against, so minCount - already
         applied above - is the whole bar. Exact enumeration put this branch's
         contribution to the false-alarm rate below 0.002 everywhere. */
    } else {
      if (recentShare < baseShare * riseFactor) continue;
      p = exactP(rc, recentTotal, bc, baseTotal);
      if (p > maxP) continue;
    }

    items.push(emit(
      src, sub,
      { count: rc, share: recentShare },
      { count: bc, share: baseShare },
      { recent: recentTotal, base: baseTotal },
      latest, lagDays
    ));
  }

  return { items, fingerprint, latest, newest, lagDays, recentTotal, baseTotal };
}
