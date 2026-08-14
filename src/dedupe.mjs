/**
 * One incident produces 5-20 articles. Three passes, cheapest first.
 * No embeddings - trigram Jaccard is free and good enough at this scale.
 */

import { createHash } from "node:crypto";

const DAY = 86400000;

const TRACKING = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref|source|cmpid|ito)/i;

export function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.protocol = "https:";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING.test(k)) u.searchParams.delete(k);
    }
    u.pathname = u.pathname.replace(/\/amp\/?$/, "/").replace(/\/{2,}/g, "/");
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/$/, "");
    return u.toString();
  } catch {
    return raw;
  }
}

export function contentHash(item) {
  const basis = `${item.title}`.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim() +
    "|" + (item.body || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 500);
  return createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

function trigrams(s) {
  const t = ` ${s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()} `;
  const out = new Set();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function jaccard(a, b) {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Group alerts into clusters within a county and time window.
 * @param {Array} alerts already geotagged + dated
 */
export function cluster(alerts, settings) {
  const threshold = settings.dedupe.trigramThreshold;
  const windowMs = settings.dedupe.clusterWindowDays * DAY;

  const seenUrls = new Set();
  const seenHashes = new Set();
  const survivors = [];

  // Pass 1 + 2: exact URL and content-hash collapse.
  for (const a of alerts) {
    const cu = canonicalUrl(a.url);
    if (seenUrls.has(cu)) continue;
    const ch = contentHash(a);
    if (seenHashes.has(ch)) continue;
    seenUrls.add(cu);
    seenHashes.add(ch);
    survivors.push({ ...a, urlCanon: cu, contentHash: ch });
  }

  // Pass 3: fuzzy grouping inside (fips, +/- window).
  const clusters = [];
  for (const a of survivors) {
    const at = Date.parse(a.eventDate || a.publishedAt);
    let placed = false;
    for (const c of clusters) {
      if (c.fips !== a.fips) continue;
      const ct = Date.parse(c.eventDate);
      if (Math.abs(ct - at) > windowMs) continue;
      if (jaccard(c.headline, a.title) >= threshold) {
        c.members.push(a);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({
        id: contentHash(a),
        fips: a.fips,
        state: a.state,
        headline: a.title,
        eventDate: a.eventDate || a.publishedAt,
        members: [a],
      });
    }
  }

  // Finalize: representative = highest trust, then earliest publish.
  const rank = { critical: 0, elevated: 1, advisory: 2 };
  for (const c of clusters) {
    c.members.sort(
      (x, y) => x.trust - y.trust || Date.parse(x.publishedAt) - Date.parse(y.publishedAt)
    );
    const rep = c.members[0];
    c.headline = rep.title;
    c.summary = rep.summary || rep.title;
    c.severity = c.members
      .map((m) => m.severity)
      .sort((x, y) => rank[x] - rank[y])[0];
    c.substances = [...new Set(c.members.flatMap((m) => m.substances || []))];
    c.eventDate = c.members
      .map((m) => m.eventDate || m.publishedAt)
      .sort()[0];
    c.sourceCount = c.members.length;
    c.confidence = Math.max(...c.members.map((m) => m.confidence || 0));
    c.sources = c.members.map((m) => ({
      name: m.sourceName,
      url: m.url,
      published: m.publishedAt,
      trust: m.trust,
      /* Per-source, so independence can be judged by class later if wanted,
         and so a bundle reader can see WHAT kind of thing each source was. */
      evidence: m.evidenceClass || null,
    }));

    /* Evidence classes have to survive this function.
     *
     * Everything else here is copied off the members and then `delete
     * c.members` throws them away - which silently zeroed the evidence gate:
     * admit() read cluster.members?.map(...) and got undefined for every
     * production cluster, so `best` fell through to "media" and a medical
     * examiner's own critical finding came out demoted and labelled a media
     * report. The unit tests passed because they hand-build clusters that
     * still have members, a shape this function never returns. */
    c.evidenceClasses = [...new Set(c.members.map((m) => m.evidenceClass).filter(Boolean))];

    /* The strongest reading BEFORE per-item evidence capping, so admit() can
       apply the corroboration exception. Without it the cap has already been
       baked into every member and there is nothing left to promote. */
    c.rawSeverity = c.members
      .map((m) => m.rawSeverity || m.severity)
      .sort((x, y) => rank[x] - rank[y])[0];

    delete c.members;
  }

  clusters.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.eventDate.localeCompare(a.eventDate)
  );
  return clusters;
}
