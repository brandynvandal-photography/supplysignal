/**
 * Source adapters. Every one is free and keyless.
 *
 * The Google News adapter is what replaces paid search: the `when:` operator
 * filters by date server-side, so out-of-window articles are never fetched.
 * That is both cheaper and more reliable than filtering after the fact.
 */

import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeFetch(url, settings, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      "user-agent": settings.polling.userAgent,
      accept: "application/rss+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8",
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 304) return { notModified: true };
  if (res.status === 429 || res.status === 503) {
    const retry = Number(res.headers.get("retry-after")) || 60;
    throw Object.assign(new Error(`rate limited, retry-after ${retry}s`), {
      rateLimited: true,
      retryAfter: retry,
    });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return {
    body: await res.text(),
    contentType: res.headers.get("content-type") || "",
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function itemsFromRss(xml) {
  const doc = parser.parse(xml);
  const channelItems = doc?.rss?.channel?.item;
  const atomEntries = doc?.feed?.entry;
  const raw = channelItems || atomEntries || [];
  const list = Array.isArray(raw) ? raw : [raw];

  return list.filter(Boolean).map((i) => {
    const link =
      typeof i.link === "string"
        ? i.link
        : i.link?.["@_href"] || i.link?.["#text"] || i.guid?.["#text"] || i.guid || "";
    return {
      title: stripHtml(i.title?.["#text"] ?? i.title),
      body: stripHtml(i.description ?? i.summary?.["#text"] ?? i.summary ?? i.content?.["#text"] ?? ""),
      url: String(link).trim(),
      pubDate: i.pubDate || i.published || i.updated || i["dc:date"] || null,
    };
  });
}

/** Generic RSS/Atom feed adapter (Tier S). */
/* IS THIS ACTUALLY A FEED, OR A HOMEPAGE WEARING A 200?
 *
 * Several sites answer /feed and /rss with HTTP 200 and `content-type:
 * text/html`, serving their front page. Measured 2026-08-19 while surveying
 * new sources: checkit.wien/feed, saferparty.ch/?feed=rss2 and
 * dancewize.org.au/news/feed all do it.
 *
 * Until now this pipeline could not tell the difference. politeFetch checked
 * res.ok and nothing else, itemsFromRss returned [] for HTML, and a feed
 * contributing nothing was reported as a healthy source rather than a failed
 * one - so a feed that quietly turned into a redirect would go silent and
 * still look fine on the run summary. That is the same failure this document
 * calls out elsewhere: worse than no source, because it looks like coverage.
 *
 * A feed is real if it PARSES - a document with a recognisable feed root. The
 * content-type is only consulted to explain the failure, never to cause one:
 * plenty of correct feeds are served as text/plain or application/octet-stream
 * by misconfigured servers, and rejecting those would drop working sources to
 * fix a cosmetic problem. Zero items is likewise NOT a failure on its own -
 * a real feed with nothing published yet returns zero, which is honest.
 */
const FEED_ROOT = /<(?:\w+:)?(?:rss|feed|rdf:RDF)[\s>]/i;
export function looksLikeFeed(body) {
  return FEED_ROOT.test(String(body || "").slice(0, 4000));
}

export async function fetchFeed(feed, settings, cacheEntry = {}) {
  const headers = {};
  if (cacheEntry.etag) headers["if-none-match"] = cacheEntry.etag;
  if (cacheEntry.lastModified) headers["if-modified-since"] = cacheEntry.lastModified;

  const res = await politeFetch(feed.url, settings, headers);
  if (res.notModified) return { items: [], notModified: true, cache: cacheEntry };

  /* `maxItems` caps how far down a feed to read. It had been sitting in
     config/sources.json on two entries since they were added and nothing ever
     read it, which went unnoticed because the gates drop the surplus anyway —
     just after parsing it. CDC's newsroom feed serves its whole 2006-present
     archive on every request, so an hourly run was parsing 1,837 items to keep
     the handful inside the window and reporting the other 2,029 as
     `outside_window` drops, which is what sent an earlier debugging session
     looking for a broken date filter that did not exist.
     RSS is newest-first, so the head is the recent end. */
  /* Refuse a homepage that answered with 200 - see looksLikeFeed above. This
     throws so the caller records the source as FAILED, which is the whole
     point: a source that stops being a feed has to be visible as broken. */
  if (!looksLikeFeed(res.body)) {
    const ct = (res.contentType || "unknown").split(";")[0].trim();
    throw new Error(`not a feed (HTTP 200, content-type ${ct}) - the URL probably serves a page now`);
  }

  let parsed = itemsFromRss(res.body);
  if (feed.maxItems > 0) parsed = parsed.slice(0, feed.maxItems);

  const items = parsed.map((i) => ({
    ...i,
    sourceId: feed.id,
    sourceName: feed.name,
    trust: feed.trust,
    scopeState: feed.scope?.state || null,
  }));

  return {
    items,
    notModified: false,
    cache: { etag: res.etag, lastModified: res.lastModified },
  };
}

/**
 * Google News RSS for one county. The `when:` operator is Gate 1 enforced
 * before a single byte of an old article is transferred.
 */
export async function fetchCountyNews(county, sources, settings) {
  const gn = sources.googleNews;
  if (!gn.enabled) return { items: [] };

  const stateName = settings._states?.[county.state] || county.state;
  const terms =
    '(overdose OR fentanyl OR xylazine OR nitazene OR "bad batch" OR "counterfeit pills" OR "drug alert")';
  const q = `"${county.name}" "${stateName}" ${terms} ${gn.windowOperator}`;
  const url = gn.template.replace("{query}", encodeURIComponent(q));

  const res = await politeFetch(url, settings);
  await sleep(gn.minIntervalMs);

  const items = itemsFromRss(res.body).map((i) => ({
    ...i,
    // Google News titles carry a " - Publisher" suffix.
    sourceName: (i.title.split(" - ").pop() || "Google News").trim(),
    sourceId: "google-news",
    trust: gn.trust,
    hintFips: county.fips,
    hintState: county.state,
  }));

  return { items };
}

/** GDELT wide net - free, keyless, date-bounded. Backup for Google News. */
export async function fetchGdelt(county, sources, settings, days = 30) {
  const g = sources.gdelt;
  if (!g.enabled) return { items: [] };

  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0];

  const query = `"${county.name}" (overdose OR fentanyl OR xylazine) sourcecountry:US`;
  const url =
    `${g.endpoint}?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&maxrecords=25` +
    `&startdatetime=${fmt(start)}&enddatetime=${fmt(end)}`;

  const res = await politeFetch(url, settings);
  await sleep(g.minIntervalMs);

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    return { items: [] };
  }

  const items = (data.articles || []).map((a) => ({
    title: stripHtml(a.title),
    body: "",
    url: a.url,
    pubDate: a.seendate
      ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}`
      : null,
    sourceName: a.domain || "GDELT",
    sourceId: "gdelt",
    trust: g.trust,
    hintFips: county.fips,
    hintState: county.state,
  }));

  return { items };
}
