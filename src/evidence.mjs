/**
 * Evidence grading. What may be published, and as how strong a claim.
 *
 * THE RULE THIS IMPLEMENTS: no information is better than wrong information.
 *
 * The pipeline before this one asks "does this text look like a drug supply
 * alert" and scores it. That is a question about WORDING. It cannot tell a
 * county health department's confirmed laboratory finding from a local station
 * paraphrasing a rumour, because both are written in the same words - and the
 * second one, published as an alert, teaches a reader that the alerts are
 * noise. On the day a real one arrives they scroll past it.
 *
 * So this module asks a different question: WHO FOUND THIS OUT, and how.
 *
 * GRADE BY THE ORIGINATOR, NOT THE CARRIER.
 *
 * That is the whole idea. A Google News result reading "Hamilton County Health
 * Department warns of fentanyl-laced pills" is an OFFICIAL finding that
 * happens to have arrived through an aggregator - the health department is the
 * source and the aggregator is a pipe. The same aggregator carrying "residents
 * say overdoses are up this month" is an unattributed claim, and no amount of
 * keyword scoring makes it into anything else.
 *
 * Previously both of those could publish, because both score well: they name a
 * substance, they name an event, they arrive from a trusted feed id. The
 * difference between them is not in the wording. It is in whether anybody has
 * put their name to the finding.
 *
 * THE CLASSES, strongest first:
 *
 *   LAB        Somebody measured a physical sample. Medical examiner
 *              toxicology, a drug-checking programme's results. Reproducible,
 *              attributable, and the only class that can say what was actually
 *              in something rather than what someone believes was in it.
 *
 *   OFFICIAL   A health authority publishing under its own name, or quoted by
 *              name. An institution with a reputation staked on it and a
 *              correction process if it is wrong.
 *
 *   COMMUNITY  A harm reduction organisation or peer network reporting from
 *              the ground. Frequently first and frequently right - this is
 *              often the only warning that exists - but there is no lab and no
 *              institution behind it. Publishes, labelled as what it is, and
 *              never at critical.
 *
 *   MEDIA      A news outlet reporting somebody else's finding. Derivative by
 *              definition: the finding belongs to whoever it quotes. Grades as
 *              whatever it is reporting, capped one step below, because a
 *              paraphrase loses detail in ways that matter here.
 *
 *   UNATTRIB   Nobody identifiable found anything out. Dropped, not held.
 *
 * WHAT THIS DELIBERATELY COSTS: coverage. An item that names no originator is
 * dropped even when it scores 0.9 and reads exactly like a real alert. That is
 * the trade the rule at the top asks for, and it is the right way round for an
 * app somebody opens before deciding whether to use alone.
 */

/* Who counts as having found something out.
 *
 * Ordered by strength: the first pattern that matches wins, so a story quoting
 * both a medical examiner and "residents" grades on the medical examiner.
 *
 * These run against the item's TEXT, not its source id, because the whole
 * point is to find the originator inside a carrier's prose. */
const ORIGINATORS = [
  ["lab", /\b(medical examiner|coroner|toxicology|crime lab|forensic lab|drug checking|drug-checking|mass spectrometry|spectrometer|FTIR|GC-MS|laboratory (analysis|testing|results)|lab (analysis|results|confirmed))\b/i],

  ["official", /\b((state|county|city|local|district|tribal) (department of )?(public )?health|health department|department of health|health district|health authority|department of public health|DPH|DOH|HHS|CDC|FDA|DEA|poison (control|center)|medical director|health officers?|health officials?|public health officials?|surgeon general|emergency management|office of the (chief )?medical examiner)\b/i],

  /* Law enforcement and hospitals: they are institutions putting a name to it,
     but what they have is usually a field presumptive test or a clinical
     impression rather than a confirmed analysis, so they grade official and
     the severity cap below keeps them off "critical" on their own. */
  ["official", /\b(police (department|says?|said|warn(s|ed|ing)?)|sheriff('s)? (office|department)|state police|task force|hospital|emergency (department|room)|paramedic|EMS|fire department)\b/i],

  ["community", /\b(harm reduction|syringe (services|exchange)|needle exchange|overdose prevention (center|site)|peer (support|network|recovery)|outreach (team|worker)|community (organi[sz]ation|group|coalition)|mutual aid|drug user (union|group)|naloxone distribut)/i],
];

/* An item that names one of these is describing an OUTCOME, not a finding
   about a supply. They are not evidence of what is in circulation. */
const NOT_A_FINDING = new RegExp([
  /\b(sentenc|convict|indict)\w*/,             // court outcomes
  /\barrest(ed)? (on|in connection|after)/,
  /\bplead(ed|s)? (guilty|not guilty)|\bplea (deal|bargain)/,
  /\blawsuit|\bsettlement\b|\bwrongful death/,
  /\b(man|woman|men|women|suspect|dealer|resident|\d+ people) charged\b/,
  /\bfundrais\w*|\bgala\b|\b5k\b|\bbenefit concert/,
  /\bcandlelight|\bvigil\b|\bvigils\b/,       // \b: not "vigilant"
  /\bmemorial (service|walk|fund|garden|event)/, // not "Memorial Hospital"
  /\bawareness (month|week|day|walk|run|event|campaign)\b/,
  /\bremembrance\b|\bhonou?r(s|ing|ed)? (those|the) (lost|victims|memory)/,
].map((r) => r.source).join("|"), "i");

/**
 * Severity ceilings by class.
 *
 * "critical" in this project means people are going down right now. Only a
 * measurement or an institution may make that claim on its own, because it is
 * the claim most likely to be acted on immediately and most damaging to be
 * wrong about.
 */
const CEILING = {
  lab: "critical",
  official: "critical",
  media: "elevated",
  community: "elevated",
};
const RANK = { critical: 0, elevated: 1, advisory: 2 };
const capSeverity = (sev, ceiling) =>
  RANK[sev] < RANK[ceiling] ? ceiling : sev;

/**
 * Confidence floors by class, applied on top of the global band.
 *
 * A community report and a health department bulletin should not clear the
 * same bar, because being wrong costs different amounts. Media is highest
 * because it is the class most likely to be a paraphrase of a paraphrase.
 */
const FLOOR = { lab: 0, official: 0.55, community: 0.65, media: 0.75 };

/** What kind of thing is this source, before looking at the text at all. */
export function carrierClass(item, sources) {
  const feed = (sources?.feeds || []).find((f) => f.id === item.sourceId);
  if (feed?.evidence) return feed.evidence;
  if (item.evidence) return item.evidence;          // set by structured adapters
  return "carrier";                                  // aggregator: google-news, gdelt
}

/** Find the strongest named originator in the item's own words. */
/* News CMSes emit typographic apostrophes by default, so "Sheriff’s Office"
   (U+2019) never matched a pattern written with an ASCII quote - and that is
   most sheriff-attributed supply alerts arriving through an aggregator. */
const flatten = (s) => String(s || "").replace(/[\u2018\u2019\u02BC]/g, "'");

export function findOriginator(text) {
  text = flatten(text);
  for (const [klass, re] of ORIGINATORS) {
    const m = re.exec(text);
    if (m) return { klass, matched: m[0] };
  }
  return null;
}

/**
 * Grade one scored item.
 *
 * Returns { verdict, klass, ceiling, floor, originator, reason }.
 * verdict is "publish" | "review" | "drop" - and "review" means a human
 * decides, which is the honest answer for something that might be real and
 * cannot be shown to be.
 */
export function grade(item, scored, sources) {
  const text = flatten(`${item.title || ""} ${item.body || ""}`);
  const carrier = carrierClass(item, sources);

  /* Only carriers get the not-a-finding filter.
   *
   * It is a heuristic over somebody else's prose, and it was running BEFORE
   * the structured-source branch - so a health department's own alert saying
   * "residents should remain vigilant" was dropped by its own wording. A
   * tagged official or lab feed publishing an item has already decided the
   * item is about a drug supply; second-guessing that with a word list is how
   * the strongest sources get thrown away. */
  if (carrier === "carrier" && NOT_A_FINDING.test(text)) {
    return { verdict: "drop", reason: "not_a_supply_finding" };
  }

  /* A structured source IS its own evidence - a medical examiner adapter does
     not need to name a medical examiner in prose to be one. */
  if (carrier === "lab" || carrier === "official" || carrier === "community") {
    return {
      verdict: "publish", klass: carrier, ceiling: CEILING[carrier],
      floor: FLOOR[carrier], originator: item.sourceName || carrier,
      reason: `source:${carrier}`,
    };
  }

  /* Everything else arrived through a pipe. Grade it on whoever it quotes. */
  const found = findOriginator(text);
  if (!found) {
    /* The expensive decision, and the one the rule at the top of this file is
       about. This item may well be true. Nobody has put a name to it, so there
       is no way to tell, and publishing it would spend the reader's trust on a
       coin flip. */
    return { verdict: "drop", reason: "no_named_originator" };
  }

  /* Reported rather than published: the outlet is relaying someone else's
     finding, so it grades as media with that finding's ceiling lowered. */
  const ceiling = capSeverity(CEILING.media, CEILING[found.klass]);
  return {
    verdict: "publish", klass: "media", ceiling,
    floor: FLOOR.media, originator: found.matched,
    reason: `reports:${found.klass}`,
  };
}

/**
 * Independent corroboration across a cluster's members.
 *
 * Independent means a different PUBLISHER, not a different article. Twenty
 * outlets running the same wire copy is one source, and treating it as twenty
 * is how a single mistake becomes a consensus.
 */
/* Aggregators put their OWN hostname on every link they carry, so a URL host
   is not a publisher identity for them. Google News rewrites every item to
   news.google.com/rss/articles/... - which made independence() return 1 for
   any number of outlets arriving that way, i.e. for the highest-volume source
   in the pipeline. It also cuts the other way: one outlet reaching us through
   both its own feed and Google News looks like two hosts and one publisher.
   The publisher name is already parsed off the " - Publisher" title suffix in
   sources/index.mjs, so use it when the host is an aggregator. */
const AGGREGATOR_HOSTS = /^(news\.google\.com|gdeltproject\.org|.*\.gdeltproject\.org)$/i;

/* One publisher reaches us two ways: its own RSS feed (host tribune.com) and
   Google News (host news.google.com, name "Tribune"). Those have to collapse
   to one identity or a single outlet counts as its own corroboration. Reduce
   both to letters only, minus the TLD and the common newspaper-domain noise. */
const slug = (s) =>
  String(s || "").toLowerCase()
    .replace(/\.(com|org|net|gov|edu|us|co\.uk|news)$/,"")
    .replace(/[^a-z0-9]/g, "");

export function publisherOf(source) {
  let host = null;
  try { host = new URL(source.url).hostname.replace(/^www\./, ""); } catch { /* unparseable */ }
  if (!host || AGGREGATOR_HOSTS.test(host)) {
    /* NOT a publisher identity, and it must not count as one.
     *
     * For a Google News item, sourceName is whatever came after the last " - "
     * in the article title (sources/index.mjs) - which is the publication name
     * the author chose when they set the site up. Two pages under two invented
     * mastheads therefore scored as two independent publishers, and
     * independence >= 2 is the ONLY thing standing between a media item and a
     * critical publication. Returning null makes an aggregator-only cluster
     * count zero independent publishers, so it can never clear that bar on
     * names alone. */
    return null;
  }
  return slug(host) || null;
}

export function independence(cluster) {
  const publishers = new Set();
  for (const s of cluster.sources || []) {
    const p = publisherOf(s);
    if (p) publishers.add(p);
  }
  return publishers.size;
}

/**
 * Final gate on an assembled cluster.
 *
 * Severity is capped at the ceiling of the STRONGEST class in it, and a
 * critical claim needs either a measurement, an institution, or two
 * independent publishers behind it.
 */
export function admit(cluster, { minIndependentForCritical = 2 } = {}) {
  /* evidenceClasses is what dedupe leaves behind; members exist only in tests
     and in callers that grade before clustering. Read the durable one first. */
  const classes = cluster.evidenceClasses?.length
    ? cluster.evidenceClasses
    : (cluster.members?.map((m) => m.evidenceClass).filter(Boolean)
       || [cluster.evidenceClass].filter(Boolean));
  const best = ["lab", "official", "community", "media"].find((k) => classes.includes(k)) || "media";
  const independent = independence(cluster);

  /* THE SEVERITY MUST COME FROM THE MEMBER THAT EARNED IT.
   *
   * This used to take the maximum severity across the cluster and, separately,
   * the strongest class across the cluster, then ask whether THAT class was
   * allowed to hold critical. The two were computed independently, so a
   * cluster could borrow its severity from one member and its permission from
   * another: an attacker-controlled media item supplies a "critical" reading,
   * a genuine health-department item in the same cluster supplies the
   * "official" class, and the demotion branch is waived on the strength of a
   * source that never claimed critical at all.
   *
   * So each member is capped against its OWN class first, and the cluster
   * takes the strongest of those already-capped readings. A media item can
   * only ever contribute "elevated", whoever it is clustered with. */
  const fallbackSeverity = cluster.rawSeverity || cluster.severity;
  const perMember = cluster.memberGrades?.length
    ? cluster.memberGrades
    : (cluster.members?.map((m) => ({
        severity: m.rawSeverity || m.severity || fallbackSeverity,
        evidenceClass: m.evidenceClass || best,
      })) || [{ severity: fallbackSeverity, evidenceClass: best }]);

  /* Each member capped against its OWN class, then the strongest of those.
     A media item contributes at most "elevated" whoever it is clustered with. */
  let severity = perMember
    .map((m) => capSeverity(m.severity || fallbackSeverity,
                            CEILING[m.evidenceClass] || CEILING.media))
    .sort((a, b) => (RANK[a] ?? 9) - (RANK[b] ?? 9))[0] || fallbackSeverity;

  /* The ONE exception, and it has to live here rather than in the cap above.
   *
   * Several INDEPENDENT publishers reporting the same thing is evidence the
   * per-item grade cannot see, so corroboration may lift media to critical.
   * It may not lift community - two harm-reduction groups passing on one
   * street rumour is one rumour - and it is not needed for lab or official,
   * whose ceiling is already critical.
   *
   * Note this is deliberately gated on a MEDIA member having claimed critical
   * itself. Capping first and promoting second is what stops the cluster
   * borrowing a severity from one member and a permission from another. */
  const mediaClaimedCritical = perMember.some(
    (m) => (m.severity || fallbackSeverity) === "critical" && m.evidenceClass === "media");
  if (severity !== "critical" && best === "media" && mediaClaimedCritical
      && independent >= minIndependentForCritical) {
    severity = "critical";
  }

  return { severity, evidenceClass: best, independent };
}

