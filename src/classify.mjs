/**
 * Two-stage classification.
 *
 * Stage 1 (free, always): deterministic keyword scoring. Handles the clear
 *   cases in microseconds and produces an auditable reason for every verdict.
 * Stage 2 (cheap, rare): items landing in the ambiguous confidence band go to
 *   Haiku in batches of 10, with NO web search tool. Search is the expensive
 *   part of the API; plain classification of text already in hand is not.
 *
 * Roughly 5-10% of prefiltered items should reach stage 2.
 */

const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ");

/**
 * Vocabulary matching, on WORD BOUNDARIES.
 *
 * A plain `text.includes(w)` looks harmless and is not. "meth" matches inside
 * "prevention methods", which is how a North Dakota West Nile Virus advisory
 * got published as an elevated methamphetamine supply alert on the first real
 * run: substance("meth" in "methods") + event("confirmed") + a trusted health
 * department source scored 0.81 and sailed through.
 *
 * Publishing noise like that is worse than publishing nothing. People stop
 * believing the alerts that are real.
 */
const RE_CACHE = new Map();

function termRe(term) {
  let re = RE_CACHE.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`\\b${escaped}\\b`, "i");
    RE_CACHE.set(term, re);
  }
  return re;
}

const hits = (text, list) => list.filter((w) => termRe(w).test(text));

export function classifyDeterministic(item, vocab) {
  const text = norm(`${item.title} ${item.body || ""}`);

  const substances = hits(text, vocab.substances);
  const events = hits(text, vocab.events);

  // Prefilter: an item must name a substance AND an event. This alone drops
  // the large majority of feed traffic before any further work.
  if (!substances.length || !events.length) {
    return { verdict: "drop", reason: "prefilter", confidence: 0 };
  }

  const negatives = hits(text, vocab.negative);

  let score = 0;
  score += Math.min(substances.length, 3) * 2;
  score += Math.min(events.length, 3) * 1.5;
  score -= negatives.length * 4;
  if (item.trust === 1) score += 4;
  else if (item.trust === 2) score += 1;
  if (norm(item.title).match(/\b(alert|advisory|warning)\b/)) score += 2;

  const confidence = Math.max(0, Math.min(score / 13, 1));

  const critical = hits(text, vocab.criticalMarkers);
  const elevated = hits(text, vocab.elevatedMarkers);
  const severity = critical.length
    ? "critical"
    : elevated.length
    ? "elevated"
    : "advisory";

  return {
    verdict: "score",
    severity,
    substances: [...new Set(substances)],
    confidence,
    audit: {
      substances,
      events,
      negatives,
      criticalMarkers: critical,
      elevatedMarkers: elevated,
      score: Number(score.toFixed(2)),
    },
  };
}

export function band(confidence, settings) {
  const { publishFloor, escalateBand, reviewFloor } = settings.classifier;
  if (confidence >= publishFloor) return "publish";
  if (confidence >= escalateBand[0]) return "escalate";
  if (confidence >= reviewFloor) return "review";
  return "drop";
}

const SYSTEM = `You classify local news and health-department items about drug supply risk.
Return ONLY a JSON array, one object per input item, same order, no prose and no markdown fences.

Each object:
{"i": <index>, "relevant": <bool>, "severity": "critical"|"elevated"|"advisory",
 "substances": [<string>], "event_date": "YYYY-MM-DD"|null,
 "is_retrospective": <bool>, "confidence": <0..1>, "reason": "<max 12 words>"}

Rules:
- relevant=false for court cases, sentencing, lawsuits, memorials, fundraisers,
  policy debate, business news, and anything not describing a current supply risk.
- is_retrospective=true if the item is mainly about an incident more than a year old,
  even when the article itself is recent. This matters more than anything else.
- event_date is when the incident or advisory occurred, NOT when the page was written.
- critical: confirmed deaths or an active ongoing spike.
- elevated: contaminant or counterfeit confirmed present in the local supply.
- advisory: general warning, guidance, or a single non-fatal report.`;

export async function classifyWithLLM(items, settings, apiKey) {
  if (!settings.llm.enabled || !apiKey || !items.length) return null;

  const payload = items.map((it, i) => ({
    i,
    title: it.title,
    excerpt: (it.body || "").slice(0, 600),
    source: it.sourceName,
    published: it.publishedAt,
  }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.llm.model,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array in LLM response");

  const parsed = JSON.parse(text.slice(start, end + 1));
  return {
    results: Array.isArray(parsed) ? parsed : [],
    usage: data.usage || {},
  };
}

/** Merge an LLM verdict back onto a deterministically-scored item. */
export function applyLLMVerdict(scored, verdict) {
  if (!verdict || verdict.relevant === false) {
    return { ...scored, verdict: "drop", reason: `llm:${verdict?.reason || "not_relevant"}` };
  }
  if (verdict.is_retrospective) {
    return { ...scored, verdict: "drop", reason: "llm:retrospective" };
  }
  return {
    ...scored,
    severity: verdict.severity || scored.severity,
    substances: verdict.substances?.length ? verdict.substances : scored.substances,
    eventDate: verdict.event_date || null,
    confidence: Math.max(scored.confidence, Number(verdict.confidence) || 0),
    llmChecked: true,
  };
}
