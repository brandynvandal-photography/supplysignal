/* NIST RaDAR — new compounds detected in the street drug supply.
 *
 * WHY THIS SOURCE EXISTS HERE. Every other sample source surveyed in
 * docs/ALERT-SOURCES.md is either closed (UNC, §4), too thin to be worth a
 * partnership (StreetCheck, shelved), or unusable below "New York City" (NYC
 * DOHMH). RaDAR is federal, which makes it public domain rather than a
 * permission problem, and it publishes the one thing nothing else does: a
 * monthly list of compounds seen in samples FOR THE FIRST TIME. That is a
 * leading indicator, and it is the shape of an alert rather than a dataset.
 *
 * WHAT IT IS NOT. The geography is two buckets, West Coast and East Coast, and
 * that is the whole resolution available. It is never a county and must never
 * be rendered as one. RaDAR's own caveat travels with every item: samples are
 * voluntarily submitted and "may not be representative of broader trends
 * within the United States drug supply."
 *
 * DISCOVERY, which was the hard part. There is no feed. GovDelivery's
 * bulletins.rss 406s, the NIST newsletter RSS is an empty document, the
 * account's /bulletins listing redirects to a sender login, and bulletin ids
 * are GovDelivery-wide hashes ~325,000 apart between consecutive RaDAR issues,
 * so walking them would mean hammering the host for a monthly file. What does
 * work is the program page: it carries a complete archive of every issue as a
 * labelled link, Feb 2024 onward. One request, a federal page, and the month
 * comes from the link text rather than being parsed out of prose.
 */

const INDEX = "https://www.nist.gov/programs-projects/radar";
const UA_FALLBACK =
  "Nightlight/1.0 (public health harm reduction; +https://nightlight.help)";

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/* INLINE TAGS VANISH, BLOCK TAGS BREAK.
 *
 * Chemical nomenclature italicises its locants - N,N-, alpha-, sec-, cis- - so
 * <i> lands in the MIDDLE of a compound name. Flattening every tag to a newline
 * split "4-Methyl-N,N-dimethylcathinone" into three lines and would have
 * published a compound called "4-Methyl-". Verified against the April 2026
 * issue, which is the one that carries it. */
export function flatten(html) {
  let t = String(html || "");
  t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  t = t.replace(/<\/?(i|em|b|strong|span|sub|sup|u|small|font)\b[^>]*>/gi, "");
  t = t.replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  return t
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)
    .join("\n");
}

/** Every issue the program page links, newest first. */
export function issuesFrom(indexHtml) {
  const out = [];
  const re = /<a[^>]+href="(https:\/\/content\.govdelivery\.com\/accounts\/USNIST\/bulletins\/[0-9a-f]+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi;
  for (const m of String(indexHtml).matchAll(re)) {
    const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const md = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (!md) continue;                       // not a dated newsletter link
    const mo = MONTHS[md[1].toLowerCase()];
    if (!mo) continue;
    out.push({ url: m[1], label, month: mo, year: Number(md[2]) });
  }
  /* The page lists newest first, but sort rather than trust the order. */
  out.sort((a, b) => b.year - a.year || b.month - a.month);
  return out;
}

/* A compound entry, as RaDAR writes them:
 *   "<name>, a <class>, was found in <n> <coast> sample(s) that ..."
 * The class is captured but deliberately NOT trusted - see parseIssue. */
const ENTRY = /^(.{2,80}?),\s+(?:a|an)\s+([a-z0-9][a-z0-9 ,\-()]{2,60}?),\s+(?:was|were)\s+(?:found|detected)\b(.{0,240}?)\./gim;

/** The compounds a single issue reports as newly detected. */
export function parseIssue(text, { month, year } = {}) {
  const start = text.indexOf("New Compounds Identified");
  if (start < 0) return [];
  /* Bounded by the next section so a later heading's prose cannot be read as
     a compound entry. */
  const endMarkers = ["Sample Type Breakdown", "Drug Product Quantitation", "Recent Publications"];
  let end = text.length;
  for (const mk of endMarkers) {
    const i = text.indexOf(mk, start);
    if (i > start) end = Math.min(end, i);
  }
  const seg = text.slice(start, end);

  const out = [];
  const seen = new Set();
  for (const m of seg.matchAll(ENTRY)) {
    const name = m[1].trim().replace(/^[-–—\s]+/, "");
    const printedClass = m[2].trim();
    const rest = m[3] || "";
    /* Section scaffolding, not a finding. */
    if (/^(compounds|determination|important|samples|in [A-Z])/i.test(name)) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    const coast = /West Coast/i.test(rest) ? "west"
      : /East Coast/i.test(rest) ? "east"
      : null;
    out.push({
      name,
      /* KEPT AS PROVENANCE, NEVER AS TAXONOMY. RaDAR's February 2026 issue
         calls citalopram "a benzodiazepine"; it is an SSRI. Their finding is
         sound and their class label is not something this app can republish,
         so the class is recorded as what they printed and the app resolves the
         real one from its own taxonomy by compound name. And it is not always
         a class at all - one entry reads "a psychoactive compound found in the
         kava plant" - so nothing may assume a taxonomy term here. */
      printedClass,
      coast,
      detail: rest.trim(),
      month, year,
    });
  }
  return out;
}

/** Sample totals, which are text even though the prevalence tables are images. */
export function parseTotals(text) {
  const m = text.match(/Qualitative Results:\s*\n?\s*(\d+)\s*\(West\),\s*(\d+)\s*\(East\),\s*(\d+)\s*\(All\)/i);
  if (!m) return null;
  return { west: Number(m[1]), east: Number(m[2]), all: Number(m[3]) };
}

async function get(url, settings) {
  const ua = settings?.polling?.userAgent || settings?.userAgent || UA_FALLBACK;
  const res = await fetch(url, {
    headers: { "user-agent": ua },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`radar HTTP ${res.status} on ${url}`);
  return res.text();
}

/**
 * Adapter entry point, matching fetchPhilly's contract.
 *
 * `maxIssues` bounds a run: the archive holds two years of issues and there is
 * no reason to refetch all of them every time. Newest first, so a bound of 2
 * covers a missed month without a backfill flag.
 */
export async function fetchRadar(src, settings, { maxIssues = 2 } = {}) {
  const issues = issuesFrom(await get(src?.url || INDEX, settings)).slice(0, maxIssues);
  const items = [];
  const seen = [];

  for (const issue of issues) {
    let text;
    try {
      text = flatten(await get(issue.url, settings));
    } catch (e) {
      seen.push({ ...issue, error: e.message });
      continue;
    }
    const totals = parseTotals(text);
    const compounds = parseIssue(text, issue);
    seen.push({ ...issue, compounds: compounds.length, totals });

    for (const c of compounds) {
      /* The published date is the month RaDAR collected in. Day 1 rather than
         a guess at the send date: the finding belongs to the collection month,
         which is what the issue's own heading says. */
      const pub = new Date(Date.UTC(c.year, c.month - 1, 1));
      const where = c.coast === "west" ? "West Coast"
        : c.coast === "east" ? "East Coast" : "US";
      items.push({
        title: `${c.name} newly detected in ${where} samples`,
        /* RaDAR's own sentence, plus RaDAR's own caveat. Neither paraphrased:
           the classifier grades what the source said, and characterising a
           federal lab's finding in our words before grading it would be
           grading our words. */
        body: `NIST RaDAR: ${c.name}, described by the program as ${c.printedClass}, `
            + `was newly detected in ${where} samples collected in `
            + `${issue.label}. ${c.detail ? c.detail.replace(/^\s*/, "") + ". " : ""}`
            + `Samples are voluntarily submitted and may not be representative `
            + `of broader trends within the United States drug supply.`,
        url: issue.url,
        pubDate: pub.toISOString(),
        sourceId: src?.id || "us-nist-radar",
        sourceName: src?.name || "NIST Rapid Drug Analysis and Research (RaDAR)",
        evidence: src?.evidence || "official",
        trust: src?.trust ?? 1,
        /* NO hintFips AND NO hintState, on purpose. The finest geography this
           source has is a coast. Attaching a state would be inventing one. */
        scope: "region",
        region: c.coast || "national",
        substanceHint: c.name,
        printedClass: c.printedClass,
      });
    }
  }
  return { items, seen, issues: issues.length };
}
