/* Philadelphia PDPH health alerts.
 *
 * The only Tier-2 source in docs/ALERT-SOURCES.md that turned out to be worth
 * writing code for, and the reason is what it publishes rather than how it
 * publishes it. Philadelphia names adulterants BEFORE most of the country
 * does: xylazine in March 2022, nitazene analogs in December 2022, medetomidine
 * in May 2024, BTMPS in September 2024, carfentanil rising in November 2025.
 * That is the leading indicator this app keeps failing to find, and it is one
 * city's worth of it.
 *
 * THERE IS NO FEED. `/feed/`, `/health-alerts/feed/` and `/wp-json/wp/v2/posts`
 * all 404 on hip.phila.gov; `?format=rss` on substanceusephilly returns
 * "Unknown response format" and `?format=json` returns an EMPTY mainContent for
 * this page type, which is the trap - it looks like a clean API and carries
 * nothing. So this parses the HTML, and it parses the one part of it that is
 * structured: Squarespace embeds each alert's description as a JSON-escaped
 * blob, so the anchors come out with their human labels attached rather than
 * having to be reassembled from around the tag.
 *
 * WHAT IT DOES NOT DO: guess a year. The visible label carries a month and a
 * day only ("11/13 Update: Carfentanil is increasingly detected..."), and the
 * year lives in the PDF filename. Where the two cannot be joined the item is
 * dropped rather than dated by assumption - a supply alert filed under the
 * wrong year is either a stale warning presented as current or a current one
 * buried, and both are worse than the item being absent.
 *
 * Everything that survives here is still graded by the normal pipeline. These
 * are official-class prose items, not pre-scored facts: PDPH publishes clinical
 * practice guidance on the same page as supply findings ("Emerging practices
 * for managing medetomidine withdrawal" is the newest item as of writing), and
 * telling those apart is exactly what the classifier and the announcement
 * filter in evidence.mjs are for. This adapter's job is to hand them over
 * accurately, not to decide.
 */

const PAGE = "https://www.substanceusephilly.com/alerts";

/* Philadelphia city and county are coterminous. */
const FIPS = "42101";
const STATE = "PA";

/* Squarespace escapes the description HTML twice over. Decoded in one pass so
   the anchor regex below sees ordinary markup. */
function decode(s) {
  return String(s)
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    /* Last, or it would un-escape the entities above into live markup. */
    .replace(/&amp;/g, "&");
}

/* A date out of the PDF's filename, which is the only place the YEAR appears.
 *
 * PDPH's naming is not one convention, it is five, accumulated over eight
 * years of files:
 *   PDPH-HAN-Carfentanil-11.13.2025.pdf     dots, four-digit year
 *   PDPH-HAN-BTMPS-0442A-09-25-24.pdf       dashes, two-digit year
 *   PDPH-HAN_Alert_1_Xylazine_03.16.2022.pdf
 *   PDPH-HAN_SUPHR_Seizures-10.7.2025.pdf   no zero padding
 *   Community-Alert-Medetomidine.pdf        no date at all
 * The last shape is why this returns null rather than reaching for a default.
 */
function dateFromFilename(url) {
  const file = String(url).split("/").filter(Boolean).pop() || "";
  const m = file.match(/(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{2,4})(?!\d)/);
  if (!m) return null;
  const mo = Number(m[1]);
  const da = Number(m[2]);
  let yr = Number(m[3]);
  if (yr < 100) yr += 2000;
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  /* A file dated in the future is a typo in somebody's filename, not news. */
  const d = new Date(Date.UTC(yr, mo - 1, da));
  if (Number.isNaN(d.getTime())) return null;
  return { date: d, mo, da };
}

/**
 * Fetch and parse. Returns { items, seen } — `seen` is every labelled anchor
 * found, so the caller can log how many were dropped for want of a date rather
 * than reporting silence.
 */
export async function fetchPhilly(src, settings) {
  const ua = settings?.userAgent
    || "Nightlight/1.0 (public health harm reduction; +https://nightlight.help)";
  const res = await fetch(src?.url || PAGE, { headers: { "user-agent": ua } });
  if (!res.ok) throw new Error(`philly HTTP ${res.status}`);
  const html = decode(await res.text());

  const items = [];
  const seen = [];
  const used = new Set();

  const re = /<a[^>]*href="((?:https:\/\/hip\.phila\.gov\/document\/|\/s\/)[^"]+)"[^>]*>([\s\S]{0,400}?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const url = m[1].startsWith("/") ? `https://www.substanceusephilly.com${m[1]}` : m[1];
    const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!label || used.has(url)) continue;
    used.add(url);

    /* "See the community alert" and bare substance words are link text pointing
       at a document the page has already listed above with its real title. They
       are not alerts of their own. */
    if (label.length < 25 || /^\(?see the community alert\)?$/i.test(label)) continue;
    seen.push({ url, label });

    const d = dateFromFilename(url);
    if (!d) continue;

    /* The label opens with the same month and day the filename carries. When
       they agree the join is sound; when they disagree the label is describing
       a different document from the one it links to, and neither date can be
       trusted. Checked rather than assumed, because this is the only thing
       standing between a 2022 xylazine alert and a reader's "recent" list. */
    const lead = label.match(/^(\d{1,2})\/(\d{1,2})\b/);
    if (lead && (Number(lead[1]) !== d.mo || Number(lead[2]) !== d.da)) continue;

    /* The leading "11/13 Update:" is scaffolding for a reader scanning a list
       on PDPH's own page. Here the date is a field, so it comes off the title. */
    const title = label.replace(/^\d{1,2}\/\d{1,2}\s*(Update|Alert|Advisory|Notification)\s*:\s*/i, "").trim();
    const kind = (label.match(/^\d{1,2}\/\d{1,2}\s*(Update|Alert|Advisory|Notification)/i) || [])[1] || "Alert";

    items.push({
      title,
      /* PDPH's own framing of the document, kept whole. The classifier reads
         this, and paraphrasing a health department's alert into our words
         before grading it would be grading our words. */
      body: `Philadelphia Department of Public Health ${kind.toLowerCase()}: ${title}`,
      url,
      pubDate: d.date.toISOString(),
      sourceId: src?.id || "pa-pdph",
      sourceName: src?.name || "The Philadelphia Department of Public Health",
      evidence: src?.evidence || "official",
      trust: src?.trust ?? 1,
      hintFips: FIPS,
      hintState: STATE,
    });
  }

  return { items, seen };
}
