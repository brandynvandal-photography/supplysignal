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

  ["official", /\b((state|county|city|local|district|tribal) (department of )?(public )?health|health department|department of health|health district|health authority|department of public health|DPH|DOH|HHS|CDC|FDA|DEA|poison (control|center)|medical director|health officer|surgeon general|emergency management|office of the (chief )?medical examiner)\b/i],

  /* Law enforcement and hospitals: they are institutions putting a name to it,
     but what they have is usually a field presumptive test or a clinical
     impression rather than a confirmed analysis, so they grade official and
     the severity cap below keeps them off "critical" on their own. */
  ["official", /\b(police (department|say|said|warn)|sheriff('s)? (office|department)|state police|task force|hospital|emergency (department|room)|paramedic|EMS|fire department)\b/i],

  ["community", /\b(harm reduction|syringe (services|exchange)|needle exchange|overdose prevention (center|site)|peer (support|network|recovery)|outreach (team|worker)|community (organi[sz]ation|group|coalition)|mutual aid|drug user (union|group)|naloxone distribut)/i],
];

/* An item that names one of these is describing an OUTCOME, not a finding
   about a supply. They are not evidence of what is in circulation. */
const NOT_A_FINDING = /\b(sentenc\w*|convict\w*|indict\w*|arrest(ed)? on|plea[sd]?\b|lawsuit|settlement|trial\b|charged with|fundrais\w*|vigil|memorial|awareness (month|week|day)|ribbon|walk\b|5k|gala)/i;

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
export function findOriginator(text) {
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
  const text = `${item.title || ""} ${item.body || ""}`;

  if (NOT_A_FINDING.test(text)) {
    return { verdict: "drop", reason: "not_a_supply_finding" };
  }

  const carrier = carrierClass(item, sources);

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
export function independence(cluster) {
  const hosts = new Set();
  for (const s of cluster.sources || []) {
    try { hosts.add(new URL(s.url).hostname.replace(/^www\./, "")); } catch { /* unparseable */ }
  }
  return hosts.size;
}

/**
 * Final gate on an assembled cluster.
 *
 * Severity is capped at the ceiling of the STRONGEST class in it, and a
 * critical claim needs either a measurement, an institution, or two
 * independent publishers behind it.
 */
export function admit(cluster, { minIndependentForCritical = 2 } = {}) {
  const classes = cluster.members?.map((m) => m.evidenceClass) || [cluster.evidenceClass];
  const best = ["lab", "official", "community", "media"].find((k) => classes.includes(k)) || "media";
  const independent = independence(cluster);

  let severity = cluster.severity;
  if (severity === "critical" && best !== "lab" && best !== "official") {
    /* The per-item ceiling stops a single story publishing critical. The
       cluster is where corroboration lives, so this is where the exception
       lives too: several publishers independently reporting the same thing is
       itself evidence, of the kind the per-item grade cannot see. The first
       version applied the ceiling before this check, which made the
       independence rule dead code - caught by its own test. */
    if (independent < minIndependentForCritical) severity = "elevated";
  }
  return { severity, evidenceClass: best, independent };
}
