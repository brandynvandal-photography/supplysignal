# Alert sources — what exists, what works, what does not

Alerts come up empty for most counties. This document is the record of a search
for more sources, so that the next person does not run it again.

It is organised around one uncomfortable finding:

> **There is no national feed of local drug-supply alerts, and the one
> real-time overdose-spike system in the United States is closed to us. The
> county-granular data that does exist is mortality data — a lagging indicator,
> published by about six counties.**

That is not a gap in the search. It is the actual state of US public data as of
August 2026. Plan around it rather than looking for the feed again.

Every URL below was fetched and checked on **2026-08-13 / 2026-08-14**. Row
counts and "most recent" dates are readings from that day and will drift; the
endpoint URLs, column names, and pass/fail verdicts are the durable part.

---

## 0. A bug in `config/sources.json` — FIXED 2026-08-14

Two of the three national feeds are mislabelled, and one of them is the largest
single source of wasted ingest work.

| Config id | URL | What it actually is |
|---|---|---|
| `cdc-han` | `https://tools.cdc.gov/api/v2/resources/media/132608.rss` | **CDC Online Newsroom** |
| `cdc-newsroom` | `https://tools.cdc.gov/api/v2/resources/media/316422.rss` | **Food Safety** |

Verified by fetching the metadata records, which return a `name` field:

```
https://tools.cdc.gov/api/v2/resources/media/132608.json  ->  "CDC Online Newsroom"
https://tools.cdc.gov/api/v2/resources/media/316422.json  ->  "Food Safety"
```

The feed labelled `cdc-han` returns **1,837 items spanning 2006 to present**.
Every one of them outside the recency window was fetched, parsed and dropped on
every run — the source of the 2,029 `outside_window` drops per run that sent an
earlier session hunting for a broken date filter that did not exist.

**What was done:** `cdc-han` was renamed to `cdc-newsroom` (what media 132608
actually is) and capped at `maxItems: 60`. The old `cdc-newsroom` entry, which
was really Food Safety, moved to `_retired`. `maxItems` itself turned out to be
dead config — it had sat on two feed entries since they were added and nothing
read it — so `fetchFeed` in `src/sources/index.mjs` now honours it. Measured on
one run: **2,361 items fetched down to 381, `outside_window` 2,029 down to 27.**

**There is no working public CDC HAN RSS.** Ruled out, do not look again:

- `https://tools.cdc.gov/api/v2/resources/media/413690.rss` — a valid feed, titled
  "HAN Managed Feed", returns **0 items**.
- `https://www.cdc.gov/han/*` — **403** to every non-browser client, including with
  a full browser user-agent. Akamai.
- `https://emergency.cdc.gov/han/*` — 301, then the same 403 wall.

HAN is national-altitude anyway. Even working, it would not produce a county
alert. Rename the two feeds to what they are, and drop HAN from the roadmap.

---

## 1. Verified dead ends

**This section is the point of the document.** Each of these looks promising
from the outside and costs an hour or two to disprove. They have been
disproved. Do not re-check them without a specific reason to think something
changed.

### ODMAP — the one that would have solved this

`https://odmap.hidta.org/` is a pure login wall. `https://www.hidta.org/odmap/`
states access is limited to government agencies — state, local, federal, tribal —
serving public safety or public health, under a signed participation agreement.
Spike alerts are distributed as internal email to subscriber lists.

A standalone harm-reduction nonprofit does not qualify, and even with access the
participation agreement would constrain republishing. **This is the only true
near-real-time overdose-spike layer in the country and it is closed to this
project.** Some counties republish derived dashboards from it (Cayuga County NY,
for example) but inconsistently and without APIs, so there is no general path in
through the back door.

### The rest

| Source | Verdict |
|---|---|
| **America's Poison Centers** `https://www.poisoncenters.org/news-alerts` | 10 dated items, latest 2026-07-08 (kratom / 7-OH). All national substance-class advisories with **no geography**, and no feed. NPDS has no public query interface. |
| **CDC county overdose deaths** `https://data.cdc.gov/resource/gb4e-yj24.json` | Works, and is already ingested by `build-mortality.mjs`. But max `monthendingdate` is **2025-12-31** (~7 months stale), each row is a **12-month rolling window**, and counts of 1–9 are **suppressed** — which erases exactly the small rural counties with the worst outcomes. Baseline context only, never an alert. |
| **badbatchalert.com** | Domain expired; now serves an Indonesian sports-betting site. Baltimore's 952-BB-ALERT program is defunct. |
| **DanceSafe** `https://dancesafe.org/testit/` | Alerts stale since 2022. |
| **DrugsData.org** | 403-blocks automated clients and stopped accepting submissions. Frozen archive. Already link-only in this project by design — see README. |
| **NDEWS** `https://ndews.org/feed/` | Live RSS, 10 items, with a WordPress API. But the useful Weekly Briefing stopped at Issue 255 (Nov 2025); the feed now carries webinar announcements only. |
| **GovDelivery RSS** | The `content.govdelivery.com/accounts/{ACCT}/bulletins.rss` pattern returns **406 across the board**, including with correct `Accept` headers. Separately, no state runs a dedicated overdose-spike GovDelivery topic, so even a working fetch would return general press releases. |
| **Tennessee** `https://www.tn.gov/health/odsurveillance.html` | Dashboard offline. Rebuild "expected Fall 2026". Recheck then, not before. |
| **New Jersey OCSME** `https://ocsme.nj.gov/Dashboard` | Behind Imperva/Incapsula. Serves a **998-byte JavaScript shell** on every path. Not ingestible without a headless browser, which this project does not run. |
| **knowharm.org/alerts.php** | Its 403 was user-agent-based and it loads with a browser UA — but it is a human-readable guide to *finding* alerts, not a feed. |
| **Connecticut** `https://data.ct.gov/resource/rybz-nyjw.json` | 12,963 records, but max date **2024-12-31**. Annual refresh. Stale, do not use. (The date column is `date`, not `date_of_death`.) |

**No national aggregator of local bad-batch alerts exists.** That gap is real.
It is also, arguably, the reason this project exists.

---

## 2. Tier 1 — county medical-examiner open data

**Works today. County-granular. Names specific adulterants. Free, no auth, no
key.** This is the highest-value tier and none of it is currently ingested.

### The structural caveat, stated plainly

This is **mortality data**. It is a lagging indicator with a lag of roughly
three weeks to two months, and it covers about **six counties nationally**.

It answers *"what has been in this county's supply over recent weeks"*. It does
**not** answer *"there is a bad batch tonight"*. If it is surfaced in the UI it
must be labelled as what it is, or it will read as a live warning and violate
the evidence standard in `EVIDENCE.md`. It is closer to `data/regional.json`
than to an alert.

A peer-reviewed survey of exactly this landscape —
`https://academic.oup.com/jamiaopen/article/8/5/ooaf140/8307000` — names Cook,
Milwaukee, San Diego, Santa Clara, Sacramento and Connecticut as the complete
set of counties publishing it. Connecticut is stale (§1). That is the universe.

### Privacy constraint, non-negotiable

**Every dataset in this tier ships identifying fields**: age, race, gender,
incident street address, ZIP, latitude, longitude. `PRIVACY.md` §7 and the
README safety rules forbid all of it, including any location precision below
county.

> Always use an explicit `$select` (Socrata) or column list (CKAN) naming only
> the date and cause-of-text fields. Never `SELECT *`. Never fetch the row and
> filter client-side — filter at the server so the identifying columns never
> enter the pipeline in the first place.

Allegheny (below) can go further and aggregate server-side, so that only
substance names and counts ever leave the county's server. Prefer that shape
wherever the endpoint supports it.

### 2.1 Cook County, IL — best of the set

```
https://datacatalog.cookcountyil.gov/resource/cjeq-bs86.json
```

Socrata, full SoQL support. Gotchas, all confirmed by fetch:

- The boolean column is **`opioids`**. `opioid_related` **errors** —
  `query.soql.no-such-column`. That name belongs to San Diego, not here.
- There are **two** date columns: `incident_date` and `death_date`. They differ,
  and `death_date` is meaningfully fresher.
- Free-text `primarycause` and `secondarycause` carry the full toxicology string.
  `secondarycause` is frequently null.

Readings on 2026-08-14:

| Measure | Value |
|---|---|
| Opioid-related records, all time | 15,659 |
| Opioid-related, trailing 120 days | 142 |
| Max `incident_date` | 2026-07-20 (~3.5 weeks) |
| Max `death_date` | 2026-08-05 (~1 week) |

Substances observed in recent `primarycause` strings: medetomidine,
N-pyrro protonitazene, bromazolam, ortho-methylfentanyl, despropionyl fentanyl
(4-ANPP), carfentanil, xylazine. This is a genuinely current adulterant picture.

A safe query — only two columns, both non-identifying:

```
?$select=incident_date,primarycause,secondarycause
&$where=opioids=true AND incident_date > '2026-04-16T00:00:00'
&$order=incident_date DESC
```

### 2.2 Allegheny County, PA (Pittsburgh) — best schema

```
https://data.wprdc.org/api/3/action/datastore_search
https://data.wprdc.org/api/3/action/datastore_search_sql
resource_id = 1c59b26a-1684-4bfb-92f7-205b947530cf
```

CKAN, 7,750 rows. **Drugs are pre-parsed into `combined_od1` … `combined_od10`** —
no free-text toxicology parsing needed, which makes this the cleanest source in
the tier. The date field is **`death_date_and_time`**, not `death_date`.

The SQL endpoint supports server-side aggregation, so the query can be written
so that **only substance names and counts leave Allegheny's server** — the ideal
privacy shape:

```sql
SELECT unnest(ARRAY["combined_od1", ... ,"combined_od10"]) AS sub,
       COUNT(*) AS n
FROM "1c59b26a-1684-4bfb-92f7-205b947530cf"
WHERE "death_date_and_time" >= '2025-06-01'
GROUP BY sub ORDER BY n DESC
```

Verified working. Deaths since 2025-06-01 returned Fentanyl 201, Cocaine 133,
Xylazine 46, Acetyl Fentanyl 27, Para-Fluorofentanyl 17, Carfentanil 7.

**Filter the null bucket.** Unused `combined_odN` slots unnest to `NULL` and
come back as the largest group. Discard it.

Most recent death 2026-06-10 (~2 months). The freshness cost is the trade for
the schema quality.

### 2.3 San Diego County, CA — corrected, this one is usable

```
https://data.sandiegocounty.gov/resource/jkvb-n4p7.json
```

**This source was written off during the sweep on the grounds that it has no
exact date field, only `year` and `quarter`. That is wrong, and re-verification
on 2026-08-14 corrected it.** The dataset has a populated `death_date`:

| Measure | Value |
|---|---|
| Total rows | 89,597 |
| Rows with a non-null `death_date` | 89,595 |
| Max `death_date` | 2026-06-30 (~6 weeks) |
| Rows for `year > 2025` | 1,718 |

The reason it looked date-less: `opioid_related` is **not a boolean**. It is a
categorical string, and querying it as `true` or `'Yes'` returns zero rows and
makes the dataset look empty. The value domain is:

| Value | Rows |
|---|---|
| `Non-Opioid` | 78,116 |
| `Opioid` | 5,703 |
| `Opioid-Fentanyl` | 4,504 |
| `Non-Disclosure` | 894 |
| (null) | 380 |

Query `(opioid_related='Opioid' OR opioid_related='Opioid-Fentanyl')`. Free-text
cause is `cod_string`, and it is specific — recent values include *"Toxic effects
of cocaine, fentanyl, acetyl fentanyl, and fluorofentanyl"*.

Treat San Diego as a full Tier 1 source alongside Cook and Allegheny.

### 2.4 Santa Clara County, CA

```
https://data.sccgov.org/resource/j8j2-ged9.json     (Fentanyl Deaths)
https://data.sccgov.org/resource/jnek-pkd2.json     (Opioid Deaths, companion)
```

Socrata. 872 records, most recent `death_date` **2026-07-06** (~5.5 weeks) —
the second-freshest in the tier. Free-text `cause_of_death`. Carries
age/race/gender/ZIP/lat/lon, so the same `$select` discipline applies.

### 2.5 Not yet checked

Milwaukee and Sacramento are named by the survey paper and were **not** verified
in this sweep. They are the obvious next two to try, and the cheapest remaining
work in this tier.

---

## 3. Tier 2 — real alert products, HTML or SMS only

These publish genuine drug-supply bulletins. **None of them has a feed.** Each
requires scraping or a human relationship.

| Source | URL | State |
|---|---|---|
| **Philadelphia PDPH** | `https://www.substanceusephilly.com/alerts` and `https://hip.phila.gov/health-alerts/` | Real bulletins — medetomidine, carfentanil, xylazine. Most recent drug item 2026-06-22. **No RSS**: `/feed/`, `/health-alerts/feed/` and `/wp-json/wp/v2/posts` all return 404, confirmed with a browser UA. PDFs follow a rigid `PDPH-HAN-{topic}-{MM.DD.YYYY}.pdf` convention, which makes this **the most scrapeable alert page found**. Start here if scraping. |
| **King County, WA** | `https://kingcounty.gov/en/dept/dph/health-safety/safety-injury-prevention/overdose-prevention-response/alerts` | Real dated drug alerts. Free email/text signup, no feed. |
| **SOAR Initiative** (Central Ohio) | `https://thesoarinitiative.org/deadly-batch-alerts/` | A live public "deadly batch" SMS service with anonymous community submission — **the closest existing thing to what Nightlight does**. Advertises RSS at `/feed/`; it returns **0 items** and the WP API returns `[]`. Approach as a **partner**, not a scrape target. |
| **Pennsylvania ODIN** | `https://www.odin-service.psp.pa.gov/AlertSubscription/SpikeAlerts` | Real near-real-time county and municipality spike alerts by email and SMS — but **gated**. Requires agency name, address, written justification, ~30-day approval. Companion Socrata record `hbkk-dwy3` is an href asset pointing at a PowerBI dashboard, not data. PA's syndromic dataset `svnp-capx` is real but quarterly, latest 2024 Q2. |

SOAR and King County are partner conversations, not scrape targets. Neither
belongs in `sources.json`.

---

## 4. Tier 3 — drug checking

**This is the data the app actually wants**: chemistry of the supply, not deaths.
It is a leading indicator. The problem is that the feeds are not there.

### UNC Street Drug Analysis Lab

**Do not use** `https://raw.githubusercontent.com/opioiddatalab/drugchecking/main/datasets/analysis_dataset.csv`.
It is a **20-row demo sample from 2022** and is easily mistaken for the national
file. The real one is:

```
https://raw.githubusercontent.com/opioiddatalab/drugchecking/main/datasets/nc/nc_analysis_dataset.csv
```

597 KB, 1,735 rows, **56 distinct `countyfips`** values, with ~42 boolean lab
flags (`lab_xylazine_any`, `lab_nitazene_any`, `lab_btmps`,
`lab_carfentanil_any`, `lab_fentanyl_any`, …).

**Parsing trap, hit during verification.** `date_collect` is a Stata-style
`DDmonYYYY` string — `01apr2022`, `31oct2023` — **not ISO**. Sorting or
filtering it as a string silently returns wrong answers rather than an error: a
naive `min()`/`max()` reports a range of `01apr2022 -> 31oct2023`, and
`startswith('2025')` matches nothing at all. Parse it properly.

Parsed correctly, 1,720 dated samples spanning **2021-03-22 → 2025-07-15**:

| Year | Samples |
|---|---|
| 2021 | 69 |
| 2022 | 350 |
| 2023 | 485 |
| 2024 | 497 |
| 2025 | 319 |

Of the 319 samples in 2025: fentanyl 180, xylazine 76, BTMPS 42, carfentanil 11,
**nitazene 0**.

The catch: the repo's last commit is **2025-08-26**, a year stale. The live site
`https://results.streetsafe.supply/` claims 23,499 samples across 42 states
updated daily, but it is a Next.js app with **no public JSON route** — `/api/samples`,
`/api/results`, `/api/data` and `/data.json` all 404.

**ASKED, AND ANSWERED: NO. 2026-08-14.** The draft in `docs/OUTREACH.md` was
sent to `opioiddatalab@unc.edu` and the lab replied the same day. Recorded here
so nobody sends it again.

> Due to inappropriate use of our data by others, we have recently updated our
> use policies […] Right now we only provide machine readable datasets to
> programs we are serving that are directly sending us samples, and they get
> only their own program's data […] a few bad actors have spoiled it for the
> rest. We will revisit this in the future.

Their policy is at `https://results.streetsafe.supply/data-use`. Read 2026-08-14,
it says no data from that site may be reproduced, redistributed, sold,
sublicensed, incorporated into AI training datasets or visualization dashboards,
or used for any commercial or research purpose without prior written
authorization — and separately that "the aggregated North Carolina dataset is
publicly available for general use; please get in touch with us if you would
like to use it."

So the door is not bolted, it is a door with a person behind it. The NC file is
still usable and the invitation to make contact about it is explicit. What is
gone is the thing that was actually wanted: a current, national, machine-readable
feed. Tier 3 has no replacement for it — StreetCheck and NYC DOHMH below are
both worse, and neither is machine-readable either.

**Check before assuming this affects what already ships.** It does not, and it
was verified rather than assumed on 2026-08-14:

| What | Where it comes from | Licence, checked via the GitHub API |
|---|---|---|
| `data/regional.json` | `opioiddatalab/dataviz` — the regional infographic | **CC0-1.0** |
| the NC sample file above | `opioiddatalab/drugchecking` | **MIT** |

Neither is `results.streetsafe.supply`, which is what the new policy governs,
and both grants are irrevocable for what was already published. The rendered
infographic page states no licence at all — only the repository does — so a
future reader checking the page alone will find nothing and should check the
repository before concluding anything. `scripts/build-regional.mjs` says CC0 in
its header and that is correct, if only provable one level up.

The honest position: we are within our rights and we are also the kind of
downstream user they have just been burned by. Worth telling them what we do
with it if the relationship is ever worth having.

### StreetCheck

`https://streetcheck.org/Public/Results` — national aggregator, built at
Brandeis, carrying MADDS, Maine, Minnesota, Nevada, New Mexico, Oregon, Vermont
and roughly ten more programs, with samples dated August 2026. Current and
broad.

But: HTML table only, no export, and **city-level rather than county-level**.
Using it needs scraping plus a city-to-county resolver — which this project
already has, in `data/places.json`. **Check the terms of service first.**

### NYC DOHMH

`https://github.com/nychealth/drugchecking-data` — real CSVs, Apache-2.0,
monthly updates. But **citywide only, with no borough breakdown**, so it cannot
distinguish the five NYC counties and cannot be geotagged below "New York City".
Unusable for a county-keyed app without a schema change on their side.


### StreetCheck terms — CHECKED 2026-08-19: there are none

The line above says "check the terms of service first". Done, and the answer is
that **StreetCheck publishes no terms at all**. `streetcheck.org/Home/Terms`,
`/terms`, and the equivalents on `info.streetcheck.org` all 404, and the footer
of the results page carries "Privacy" and "Terms" links whose href is literally
`#`.

No stated prohibition — and no stated permission either. That is not the same
as a green light, and this project should be the last one to treat it as one:
UNC closed its data *because of unauthorized downstream use*, and their reply is
three paragraphs above this one. Doing to Brandeis what somebody else did to UNC
would be how the next door shuts, on everyone.

**Recommendation: write to Brandeis before touching it.** It is the same shape
of ask as the UNC draft in `OUTREACH.md` — non-commercial, no advertising, no
user data, county-level display — and unlike UNC there is no policy in the way,
only silence. The city-to-county resolver this would need already exists in
`data/places.json`.

**SHELVED 2026-08-24 — THE REACH IS TOO SMALL.** The 21 contributing labs are
who may submit, not who does. The ten most recent samples that day were
Brattleboro VT (5), Providence, Pawtucket and Woonsocket RI (3), one "Online"
and one unspecified Rhode Island: live flow in two small states. Keyed on
counties nationally, nearly every reader would see an empty section, which reads
as broken rather than as an honest absence. The ask was drafted and not sent;
revisit only if the contributor list starts producing volume across more states.

**The draft, and what was verified — `OUTREACH.md` §3.** Contact is
`communitydrugchecking@gmail.com`, the project's own inbox on
info.streetcheck.org, with `madds@brandeis.edu` as the fallback. Re-verified the
same day: 21 contributing labs and locations, samples dated 08/2026, all four
terms URLs still 404 with a browser UA, `/api/results` 404, and
`/Public/Results?export=csv` returns 200 but serves HTML rather than a CSV — so
there is still no export route and still no stated terms. Nothing is to be
scraped while the ask is outstanding.

### NIST RaDAR — DISCOVERY SOLVED 2026-08-24, adapter written

`https://www.nist.gov/programs-projects/radar`. Federal, so **public domain** —
no permission ask, unlike everything else in this section. Publishes monthly,
and the section worth having is **New Compounds Identified**: substances seen in
RaDAR samples for the first time. 16,000+ samples since the pilot, 15 states or
territories.

**Discovery was the whole problem, and the program page is the answer.** There
is no feed. GovDelivery's `bulletins.rss` returns 406 even with an RSS Accept
header, `nist.gov/news-events/nist-newsletters/rss.xml` is an empty document
(0 items), `/accounts/USNIST/bulletins` redirects to a sender login, and
bulletin ids are GovDelivery-wide hashes roughly 325,000 apart between
consecutive RaDAR issues — walking them would mean hammering the host for one
monthly file. The program page carries **a complete archive of every issue as a
labelled link**, February 2024 onward, so it is one request against a federal
page and the month comes from the link text. `USNIST_645` is the subscribe topic
id if the page layout ever changes.

**Two traps, both fixed and both pinned by `test/radar.test.mjs` against real
captured pages:**

- **The prevalence tables are images**, but the compound findings are prose.
  Sample totals are text too. No OCR is needed for the part that matters.
- **Chemical nomenclature italicises its locants**, so `<i>N,N</i>` lands in the
  middle of a compound name. Flattening every tag to a newline split
  "4-Methyl-N,N-dimethylcathinone" into three lines and would have published a
  compound called **"4-Methyl-"**. Inline tags must be stripped without a break;
  only block tags break.

**Their class labels cannot be republished.** The February 2026 issue calls
citalopram "a benzodiazepine"; it is an SSRI. The adapter carries the printed
class as provenance only, and the app must resolve the real class from its own
taxonomy by compound name. One entry's "class" is also a whole phrase — "a
psychoactive compound found in the kava plant" — so nothing may assume a
taxonomy term in that field.

**What is NOT done: the regional tier.** The pipeline has exactly two geographic
tiers, county and statewide, and `src/ingest.mjs` drops anything else as
`ungeotagged`. RaDAR's finest geography is West Coast / East Coast, which is
neither, so the adapter emits `scope: "region"` and nothing consumes it yet.
Wiring it up needs a third tier through ingest, store and the alerts view, and
it must never render as a county. RaDAR's own caveat travels on every item and
has to stay: samples are voluntarily submitted and "may not be representative of
broader trends within the United States drug supply."

Verified live 2026-08-24: three issues fetched, 13 compound findings, every item
carrying the caveat and none claiming a county or state.

### Programs that publish their own ALERTS — the shape that already works

`config/sources.json` already carries one of these: `pa-pdph`, which scrapes
Philadelphia's alerts page rather than any sample dataset. That is the right
pattern for Tier 3 — a **public health warning is published to be spread**,
where a per-sample dataset is somebody's research asset. The two should never be
confused, and the licence questions are completely different.

A fifty-state sweep on **2026-08-19** (see `data/checking.json`, which it also
produced) found these additional programs publishing in that shape. None is
wired up; every URL below returned 200 from this machine on that date.

| Program | Publishes | Reach | Note |
|---|---|---|---|
| PA Groundhogs — `pagroundhogs.org/alerts` | Named public alerts, e.g. medetomidine in dark-web alprazolam | Pennsylvania | Closest match to the `pa-pdph` pattern; obvious next source |
| CFSRE NPS Discovery — `cfsre.org` | National early-warning reports on newly identified substances | National | Already the lab behind `pa-pdph`; 403s to non-browser clients |
| NM Adulterant Checking — `nmharmreduction.org/adulterant-checking/` | Monthly snapshots of what four state sites found | New Mexico | PDF, so parsing cost is real |
| Project EAGLE FANG — St. Louis County | Per-sample dashboard, drugs identified | St. Louis County, MO | County-keyed already — rare and valuable. Blocks scrapers; page states results are research-only |
| Harm Reduction Michigan — `harmreductionmi.org` | Individual GC-MS reports per sample | Northern Michigan | |
| IE Safe Supply — `iesafe.supply` | Results searchable by sample, city or substance | Inland Empire, CA | |
| Southern Nevada Health District | Substance-use dashboard fed by their checking program | Clark County, NV | |

The constraint remains what section 4 said it was: not the code, the feed set.
What changed on 2026-08-19 is that the feed set is now known to be larger than
"UNC and StreetCheck" — but every one of these is a **regional** source, so each
adds one area rather than the country. Pick them off in the order above, and ask
first where there is anyone to ask.


### The three candidates above, actually attempted — 2026-08-19

All three were fetched and taken apart. **None reaches the bar the Philadelphia
adapter set**, and the reasons are different in each case. Written down in full
so the next person spends the twenty minutes reading rather than repeating.

**CFSRE / NPS Discovery — RULED OUT, do not look again.** `cfsre.org` returns
**403 to every client**, including a full browser user-agent, on the alerts
page, `/feed` and `/rss` alike. `npsdiscovery.org` 301s straight back into the
same wall. This is the CDC HAN situation in section 0 exactly: a real
publication behind a WAF that will not serve a script. Nothing to build against.

**PA Groundhogs — not worth an adapter, and worth saying why.** The page fetches
fine (200, even to our own user-agent). The problem is what is on it. The
headline alert is a site-wide *promo banner*, not a list entry, and the alert
list itself is six anchors whose visible text is the literal string
`Download PDF`. No titles in the markup, and of the six PDF filenames only one
carries a date (`Oxy Alert Listserv_11282025.pdf`); the rest are
`carfent.pdf`, `mede bromo alert.pdf`, `26858440.Update__16_May_06_10_PM-3.pdf`
and similar. There is no RSS (`/feed`, `/rss.xml`, `/blog-feed.xml` all 404).

Under the no-date-no-item rule that philly.mjs enforces, an adapter here would
publish **one item out of six** and drop the rest in silence — while looking on
the dashboard exactly like a working source. That is worse than no source. One
of the dropped items is `OVERDOSE CLUSTER IN BLAIR COUNTY`, which is precisely
the county-level supply finding this app exists to surface, so if anyone ever
opens a conversation with PA Groundhogs, ask them for dated titles or a feed —
the content is right, only its packaging is unusable.

**New Mexico ACP — deferred, needs a PDF dependency.** The snapshots are linked
with dates in their filenames (`February-2025-ACP-Snapshot.pdf`), so the dating
discipline is satisfiable. But every finding lives *inside* the PDF, and this
pipeline has no PDF text extraction and no dependency that could do it. They are
also monthly aggregate snapshots rather than alerts — a summary of what four
sites found in a month, which is a different thing from "this is in the supply
now". Revisit only if a PDF parser arrives for another reason.

## 4b. Local news, drug busts, and why they are already handled

Asked 2026-08-19: could we pull local radio and news RSS — the KRMS-style item
about a festival and a drug bust — for local drug events?

**The sweep already happens.** `config/sources.json` enables `googleNews`
(per-county RSS queries, `when:30d`) and `gdelt`
(`"{county}" (overdose OR fentanyl OR xylazine) sourcecountry:US`). A local
radio station's story is reachable through both today; no new feed is needed to
see it, and adding station-by-station RSS would mean maintaining hundreds of
feeds to reach items the aggregators already return.

**Busts are then rejected on purpose, and this should stay.**
`config/vocab.json` carries a `negative` list — `sentenced, convicted, arrested,
arrest, indicted, indictment` — and `src/classify.mjs` subtracts **4 points per
hit** against a scale that tops out near 13. A seizure story is scored down
until it fails.

That is a content decision, not a filtering accident, and there are two reasons
to keep it:

1. **A bust says nothing about what is in the supply.** It names what police
   took *out* of circulation, in quantities and purities established after the
   fact. The reader's question is what is in the bag in their hand.
2. **Nightlight cannot be a police blotter.** The people this app is for are
   the people those stories are about. An app that surfaces arrests beside
   overdose warnings tells them what side it is on, and no amount of accurate
   chemistry buys that trust back.

The genuinely interesting case is the *second-order* one: a large seizure can
disrupt a local supply, and a disrupted supply means new sources, unfamiliar
potency and a real rise in overdose risk. That effect is documented. But the
signal is indirect, it needs a scale threshold nobody has defined, and inferring
"expect a dangerous supply shift" from "police announced a seizure" is a claim
this project cannot source. Left alone deliberately.

**Festivals are a different question and stay open.** The Juggalos half of that
example is not a bust — a large gathering with an on-site drug-checking presence
is a real harm-reduction context, and DanceSafe-style event checking is exactly
where supply findings surface early. There is no feed for it and no obvious way
to date-bound one, but it is a better idea than the bust half and nobody has
looked properly.


### DanceSafe — not an alert feed, but the one feed we should be watching

Checked 2026-08-19 while looking for festival supply warnings. DanceSafe has
**both** a working RSS feed (`https://dancesafe.org/feed/`) and an open
WordPress REST API (`https://dancesafe.org/wp-json/wp/v2/posts`), which returns
clean JSON with dates and links. Machine-readable, no key, no scraping.

**As an alert source it is worthless.** Twenty-five posts spanning 2021 to 2026
— about five a year — and the bulk are board updates, staff introductions and
storefront announcements. Newest item at time of checking: 2026-03-12, five
months stale. Zero festival supply warnings, ever. It is a newsroom, which is
the thing section 4 warns about.

**As a source-drift watch it may be the most valuable feed in this document.**
Our reagent data is pinned to "DanceSafe reagent flowcharts, 2023 revision"
(`data/reagents.json`), and their feed is where they announce that the guidance
we copied has changed. Four of those twenty-five posts are exactly that:

- `URGENT: Recent Batch of Fentanyl Strips Requires Different Dilutions` (2021)
- `IMPORTANT: Reagent Reaction Updates` (2023)
- `Amphetamine Test Strips Discontinued` (2024)
- `We Updated Our Fentanyl Test Strip Instructions!` (2025-10-27)

**The last one has already drifted past us.** Read at source on 2026-08-19,
that post says DanceSafe replaced the old "50 mg (5 scoops)" method with
**10 mg powder to 5 mL water (about one micro-scoop per teaspoon)**, doubling
the water for MDMA and meth, and — the part that matters here —

> "Standard instructions across brands: We aligned our steps with other brands
> – the science inside the strips may differ, but how you use them stays the
> same."

Our numbers are right: `data/testing.json` `strips[0].dilution.commonAmounts`
already carries "About 1 teaspoon (5 mL) of water per 10 mg" and "double the
water" for meth and MDMA, which now match the new cross-brand standard exactly.

What has gone stale is the **framing around them**. Our `conflict` field tells a
reader that protocols "disagree by as much as ten times" and that "the
requirement genuinely differs by strip brand" — and cites DanceSafe's site
against DanceSafe's own brochure as an example. That inconsistency is the thing
their October 2025 standardization set out to end. The same reasoning is why the
`commonAmounts` table was pulled from the screen (see the note in
`site/js/views/test.js`): one figure was judged unsafe because brands differed.
That premise is weaker than it was.

Nothing we publish is dangerous — "follow the instructions that came with YOUR
strips" and "use more water rather than less" are safe under any brand's
protocol, and the retained figures match. But a reader is being told a
disagreement is live when the field has moved to settle it, and CDC and the
state health departments in that same sentence have NOT been re-checked since.
**Action: re-verify the dilution block against DanceSafe's new water table and
whatever CDC currently says, then decide whether the table goes back on screen.**

That is the case for wiring this feed up — not to raise alerts, but to notice
when a source we quote changes its mind. Nothing else in this document does that
job, and the integrity rule this project runs on makes it the more valuable one.


## 4c. Festivals and events — searched 2026-08-19, and the answer is legal

Asked whether large gatherings could be an alert source: a festival is where
event drug checking happens, so findings should surface there early.

**No US organisation publishes festival-tagged drug findings, in any format.**
Not a feed problem — the category does not exist here. Checked directly:

| Source | Feed | Verdict |
|---|---|---|
| DanceSafe `/feed/` and `/wp-json/wp/v2/posts` | Valid RSS **and** open JSON API | Live pipe, wrong payload — board updates, staff notes, storefront news |
| DanceSafe **#TestIt Alerts** `/category/testit-alerts/feed/` | Valid RSS, 8 items | **Dormant.** Last genuine adulterant alert **2021-01-26**. Alerts were geo-tagged by city, never by event |
| Zendo Project, Bunk Police | Both valid, both current | Presence announcements and festival guides. Zero findings — keyword scan returned 0 for fentanyl, adulterant, nitazene, xylazine |
| Rock Medicine | Advertises a feed in its `<head>` that 404s | No dated content at all |
| CrowdRx | `crowdrx.com` has no DNS record; `.org` has no feed | Marketing only |
| Project Overdose (Orlando) | None — **private email distribution** | Issues real event-timed supply warnings that nobody outside the list can read |

**The reason is the RAVE Act.** DanceSafe's own pages say their event calendar
is incomplete because promoters do not want their presence announced: under the
Illicit Drug Anti-Proliferation Act of 2003, providing water, cooling or drug
checking can be argued as evidence of knowingly permitting drug use. The data
is not missing by oversight — **the legal regime suppresses its publication**.
No scraper fixes that, and any feature premised on festival-tagged findings is
fighting a statute rather than a tooling gap.

**Health departments do not fill the gap either, and the shape of their failure
is precise.** Two tracks that never intersect: event-tied advisories are issued
on a reliable pre-event schedule (NYC HAN #10 and #16 for the 2026 World Cup;
Philadelphia issued near-identical FIFA advisories in June 2025 and June 2026)
and their drug content is one boilerplate line — "screen for alcohol and
substance use". Meanwhile the genuine supply alerts from those same departments
— Philadelphia on carfentanil, medetomidine, etomidate, nitazenes; NYC's
medetomidine withdrawal advisory — are never tied to an event. They sit in the
same index and never merge. Even CDC's own MMWR write-up of the 2013 Electric
Zoo deaths calls it **"festival A"** throughout, and notes that adverse events
at music festivals were not routinely reported to the health department at all.

### The Loop (UK) — the product we were looking for, in the wrong country

`https://www.wearetheloop.org/drug-alerts-full?format=rss` — valid RSS, and
`?format=json` works too. Seventeen items, 2022–2026, newest 2026-06-21. The
titles are literally what was hoped for: *"ALERT: Dipentylone found at Lost
Village 2023"*, *"CAUTION: High strength 'Dior' & 'Pop Smoke' pills in
circulation, Parklife 2025"*.

**It is UK-only and must never reach a US reader unlabelled.** Their own alert
text describes the UK pill market — "The Loop continues to see minimal evidence
of adulteration in the UK pill market" — which is close to the opposite of the
US picture. A Parklife pill alert tells a US reader nothing true about what is
in their hand. Recorded because it proves the format works, not as a candidate.

### Licensing landmines, same research group, opposite rules

- `results.streetsafe.supply` — **prohibits** automated collection (section 4).
- `opioiddata.org` — aggregate reports **permit** reuse with the attribution
  string "UNC Street Drug Analysis Lab at opioiddata.org", and it publishes an
  `llms.txt` index deliberately for automated tooling.
- **But the aggregate feed is a newsletter, checked here directly.**
  `https://opioiddata.org/rss` (note: `www.` 301s, follow it) is valid RSS with
  15 items, newest 2026-08-12 — and they are "Summer 2026 Newsletter", "April
  Newsletter", and personal-interest pieces. Permissively licensed newsroom
  output, not supply findings. Same trap as everything else in this section.
- **DrugsData is closed by terms, not just by staleness.** Their results page:
  permission is required before "importing it into public or shared databases,
  software, or systems", a policy that exists "to require cooperation and credit
  by researchers and **app authors**". Their robots.txt separately carries
  `User-agent: ClaudeBot / Disallow: /`. On top of that, submissions have been
  paused since April 2024 and the sample mix is majority European.

### What the search actually turned up that is worth having

**Poison centers.** `https://www.wapc.org/feed/` (Washington Poison Center, an
independent nonprofit) — fetched here: HTTP 200, valid RSS 2.0, 10 items,
newest 2026-08-12, and the content carries real clinical drug guidance. It is
the only working XML feed found among every drug-alerting body tested. There are
around 55 US poison centers and nobody has swept them; they are the bodies that
see acute exposures in something close to real time.

**The CivicPlus county newsflash pattern.** Many county government sites run
CivicPlus, which exposes
`https://{domain}/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml`. Verified here:
Deschutes County OR returns 7 items, Snohomish County WA returns 1, Clay County
MO returns valid XML with 0. King County, WA DOH and Washington County OR 404 —
they run other platforms. **So it is a per-county probe, not a master key**, but
it costs one request to test and Deschutes' feed carried a genuine supply alert:
*"Six incidents within the last 24 hours have required naloxone administration,
indicating that these substances may contain an opioid such as fentanyl"*,
about adulterated cocaine and ketamine. That is exactly the county-level leading
indicator section 4 says does not exist. Worth probing this path against every
watched county in `config/watchlist.json`.

### A bug class to guard before adding any of these

**Soft-200 feeds.** `checkit.wien/feed`, `saferparty.ch/?feed=rss2` and
`dancewize.org.au/news/feed` all return **HTTP 200 with `content-type:
text/html`** — they serve a homepage. A health check that asserts on status code
alone would register four working feeds that silently never produce an item.
Any feed added from this section must be validated on **content-type and a
parsed `<item>` count**, not on 200.


## 4d. Poison centers — all 53 swept, 2026-08-19

America's Poison Centers publishes no HTML member list; the directory is a JS
map whose data comes from `https://api.mapme.com/api/stories/aggregated/06aa0c94-7061-45a6-9a92-032e13856547`
(JSON, 72 pins resolving to 47 distinct center web properties). 53 base URLs
were probed, ten paths each, plus `<link rel="alternate">` discovery.

**The headline is a negative: 43 of 53 have no ingestible feed.** Twenty return
a valid non-empty feed, and of those **three carry drug-supply content** —
Florida, Washington, Ohio. Most centers that installed WordPress never published
a post.

| Center | Feed | State | Verdict |
|---|---|---|---|
| Florida | `floridapoisoncontrol.org/feed/` | FL | Daily, current — but see the caveat below |
| Washington | `wapc.org/feed/` | WA | Current, mixed clinical and PSA |
| Ohio | `ohiopoisoncenters.org/feed/` | OH | Real substance-trend content, newest 2026-07 |
| California | `calpoison.org/blog/feed` | CA | On-topic clinical monographs, frozen since 2023-04 |
| PoisonHelp.org | national | — | On-topic, stale to 2024-10 |

**Florida is not what it first looks like, and this matters for a county-keyed
app.** Checked here directly: HTTP 200, valid RSS, ten items, newest the day of
checking. But the payload is a *general poison-control news aggregator* — of
eight items read, three were drug-supply ("A Veterinary Sedative Has Overtaken
Xylazine in the Illicit Drug Supply", two on kratom) and the rest were frozen
fruit-bar recalls, red tide in Manatee, and a jellyfish exhibit. The drug items
are **national news stories republished**, not Florida findings.

So it must never be given a `scope.state` of FL. Doing that would stamp a
national story onto Florida counties, which is precisely the misattribution this
pipeline's geotagging exists to prevent. Ingest it unscoped and let geotag find
a county in the text, or leave it out. The classifier's substance-plus-event
prefilter would drop the jellyfish on its own, so the noise is not the problem —
the false geography would be.

**Two worth scraping, neither has a feed:**

- **Michigan Poison & Drug Information Center** — `poison.med.wayne.edu/updates`,
  a dated and actively maintained supply page: medetomidine (2026-04-02),
  carfentanil re-emergence with 11 Michigan deaths (2025-06-30), pediatric THC
  in Detroit schools (2026-04-30). The strongest non-feed source found.
- **Missouri Poison Center** — no feed (its `/feed` is a soft-200 serving 249KB
  of homepage) but `missouripoisoncenter.org/wp-json/wp/v2/posts` returns real
  JSON: "What's in Our Current Street Drugs? Is it BTMPS?", "Be Aware of
  Xylazine-Adulterated Fentanyl". **The WP REST API is the ingest path.**

Also noted without feeds: Georgia's "Alerts – Recent Trends" page on street
drugs sold in GA (its RSS is valid but empty), and Minnesota's news-alerts page.

### Three trap classes, all of which would have poisoned an ingester

1. **Soft-200** — nine properties (Missouri, NC, SC, Kansas, Tennessee, Utah,
   Arkansas, Jacksonville, Arizona) return 200 with `text/html` for `/feed`.
   **Now caught**: `looksLikeFeed` in `src/sources/index.mjs` refuses a document
   with no feed root and the source is recorded as FAILED. See
   `test/feedshape.test.mjs`.
2. **Valid-but-empty** — seven (Arizona, Tampa, Georgia, Minnesota, NJPIES,
   Blue Ridge, Wisconsin) serve well-formed RSS containing zero items.
   Content-type checking cannot catch these and **neither can the shape check,
   deliberately**: a real feed with nothing published yet is honest, not broken.
   Only a per-source staleness check would catch it, which is a different job.
3. **Sitemap-as-feed** — on WordPress sites with All-in-One-SEO, `/rss.xml`
   302s to `/sitemap.rss`. Checked on Florida: it is valid RSS with **50 items,
   all carrying a pubDate**, and they are the real posts — a superset of
   `/feed/`, not a trap there. But the shape is a hazard elsewhere, where a
   sitemap lists undated pages. **Prefer `/feed/` on WordPress.**

Two defects in APC's own directory, for whoever re-runs this: the MA/RI entry
points at `www.maripoisoncenter.com`, which refuses connections (only the apex
resolves), and the Cincinnati Children's URL 404s.


## 4e. The 26 watched counties, probed one by one — 2026-08-19

376 requests across 27 hosts. Philadelphia, Bronx and Kings are already known
(section 4 and the pa-pdph adapter), leaving **23** examined.

**The counts, which are the point:**

- **11 have a real substance-naming alert page.** Eight report *local* supply
  findings — Maricopa, Los Angeles, Chicago/Cook, King, Clark, Baltimore City,
  San Francisco, Multnomah. Three only relay CDC or CDPH notices (San Diego,
  Orange, Pierce). A keyword match on "medetomidine" fires on six of them while
  only four tested local samples, so relayed notices must be distinguishable or
  the app will report a national advisory as a local finding.
- **7 have a working RSS feed** — Maricopa, Cook, Orange, Riverside, San
  Bernardino, Pierce, plus Detroit citywide (not the health department).
- **Only 3 pair an alert page with a machine-readable channel that actually
  carries the alerts**: Clark NV, Pierce WA, Orange CA. **Only Clark's alerts
  are local findings.**

### Clark County NV — the best of them, and invisible to an RSS probe

Every RSS path on `southernnevadahealthdistrict.org` soft-200s to HTML, so a
feed probe scores this county as a clean negative. But
`https://www.southernnevadahealthdistrict.org/wp-json/wp/v2/news_release`
returns JSON with **1,388 records**, dated, linked and searchable by substance.
Confirmed here: `?search=medetomidine` returns "Southern Nevada Health District
detects medetomidine in illicit drug supply" (2026-02-11), sourced to a local
programme that anonymously samples used paraphernalia — five positives since
July 2025. That is a genuine local supply finding in a machine-readable channel,
which is the combination section 4 says barely exists.

**Lesson for the probe order: try `wp-json/wp/v2/*` before concluding a
WordPress site has nothing.** Clark, Missouri Poison Center (section 4d) and El
Paso CO all hide real content behind a dead-looking RSS surface.

### Pierce County WA — the cleanest structural fit

`https://tpchd.org/feed/` is a genuine feed and their medetomidine advisory is
an ordinary `post`, so a future drug advisory *will* flow through it rather than
being published somewhere the feed cannot see. The caveat is that this advisory
relays CDC rather than local testing.

### Cook County — the alerts are Chicago's, not the county's

CCDPH's feed works but CCDPH publishes no alerts. The real product is Chicago
CDPH's HAN at `chicagohan.org/opioid`, and — correcting an earlier assumption —
the alert bodies **are** server-rendered and readable without an account:
`/alert-detail/-/alert-details/46687780` returns nitazene and BTMPS mentions
directly. `/home` is a JS placeholder and is not scrapable. Scrape the topic
page for ids, then each detail page.

### THE USER-AGENT FINDING, which inverts our own advice

`config/sources.json` `_wafNote` has been telling the next person to send a
browser-ish user agent. **For two counties that is exactly backwards.**
Measured across five agents and re-verified by hand here:

| Host | `Nightlight/1.0 (+https://nightlight.help)` | `Mozilla/5.0 …Safari` |
|---|---|---|
| `alleghenycounty.us` | **200** | **403** |
| `waynecountymi.gov` | **200** | **403** |

`curl/*` and `python-requests/*` also get 200; Googlebot gets 403. Both counties
are reachable **because** the pipeline identifies itself honestly. The note has
been corrected in place. The general lesson is worth keeping: an ingest that
says what it is can be blocked deliberately by anyone who wants to block it,
which is the relationship this project wants with the agencies it reads.

### Other things that would have cost someone a day

- **GovDelivery has no public RSS.** Tested AZMARIC, WAKING, CASAND:
  `bulletins.rss` 406, `bulletins.xml` 401, `/rss` 404. Maricopa, King and San
  Diego all push through it, so email and SMS are the only channels for those.
  Maricopa's medetomidine surveillance alert ships this way and there is no
  evidence it reaches the News Flash feed the county does expose.
- **Two soft-200 shapes, not one.** Pima returns 200/text/html on all eight
  paths (CivicPlus's newer SPA) — caught by `looksLikeFeed`. But Hamilton TN,
  San Diego, El Paso CO and Baltimore all serve **correct `application/rss+xml`
  containing zero items**, which no shape or content-type check can catch and
  which `test/feedshape.test.mjs` deliberately allows. Only per-source staleness
  monitoring catches those.
- **San Francisco** has the most substance-specific alert found anywhere in this
  sweep — N-desethyl isotonitazene, cychlorphine, ethyl bromazolam, April 2026 —
  and no feed surface at all; every path 404s.

---

## 5. Tier 4 — discovery APIs

Rather than hand-curating feeds, both of the following can be swept
programmatically on a schedule. **Cook County and Santa Clara were found this
way.** This is the scalable path.

### Socrata Discovery

```
https://api.us.socrata.com/api/catalog/v1?q=overdose&only=dataset&limit=100
```

Searches every US government Socrata domain at once. The response includes
`updatedAt` and column names, so results can be **auto-filtered for county or ZIP
columns and for recency** without a second fetch per candidate.

`q=overdose` alone returns 78 datasets; a 7-query sweep across related terms
returned **281 unique datasets**. Top hits by recency are `data.cdc.gov` VSRR
series plus county domains such as `internal.open.piercecountywa.gov`.

### ArcGIS Online

```
https://www.arcgis.com/sharing/rest/search?q=(overdose OR naloxone) AND type:"Feature Service" AND access:public&sortField=modified&f=json
```

**2,350 public feature services**, each with a REST `/query?f=json` endpoint.
Confirmed working example — Rhode Island DOH, municipal fatal overdose by month:

```
https://services1.arcgis.com/dkWT1XL4nglP5MLP/arcgis/rest/services/Municipal_Count_of_All_Drug_Involved_Fatal_Overdose_by_Month_Incident_Municipality/FeatureServer
```

Quality is uneven and many services are one-off dashboards, so this needs a
filter on recency and on the presence of a county or FIPS field. It is a
discovery tool, not a source list.

---

## 6. What to do next, in order

**Done 2026-08-14:**

1. ~~Fix the two mislabelled CDC feeds and cap the 1,837-item one.~~ See §0.
2. ~~Ingest Tier 1 — Cook, Allegheny, San Diego, Santa Clara.~~ Implemented in
   `src/sources/medex.mjs`, configured under `medicalExaminers` in
   `config/sources.json`, covered by `test/medex.test.mjs`. Publishes as
   elevated supply context with its own lag stated in every item, never as a
   live spike.

**Checked 2026-08-14, closing three questions the survey left open:**

- **Milwaukee and Sacramento publish nothing.** Socrata catalog search over
  both counties' domains returns zero overdose/ME datasets. The JAMIA survey
  named them; whatever they had is not public today.
- **Pierce County WA** (`internal.open.piercecountywa.gov`, `qxa4-9v9w`) is
  real but **annual aggregates only** — year, cause, count. No dates, no
  substances. Not usable for alerts.
- **The state-feed well is dry.** A 319-URL probe of 28 missing jurisdictions'
  health department domains (11 path patterns each) found exactly two live
  RSS feeds — SC and TX — and both are the page-tree indexes already in
  `_retired`, one listing events dated in the future. State newsroom RSS is
  not where the remaining coverage is.
- **UNC's NC dataset re-verified:** 1,735 samples, 56 counties, but newest
  `date_collect` is 2025-07-15 — 13 months old, outside the 365-day window
  entirely. It cannot produce a current alert until they publish again.
  Asking them for a live feed remains the highest-value action.

**Still open, in order:**

3. **Ask UNC / StreetSafe for a machine-readable feed.** Biggest coverage gain
   for the least work — the best drug-checking data in the country, no public
   API (§4). One email. **A draft is ready in `docs/OUTREACH.md`**, addressed to
   opioiddatalab@unc.edu (a lab inbox, verified 2026-08-14), with the current
   state of their published data checked so the message does not ask for
   something that already exists. Not sent — it needs signing as yourself.
4. **Verify Milwaukee and Sacramento**, the two counties named in the JAMIA
   survey that have not been checked. If either matches the Cook or Allegheny
   shape it is a config entry, no new code.
5. **Scrape Philadelphia PDPH**, whose PDF naming convention is regular enough
   to make it tractable, and which is a genuine alert product rather than
   mortality data.
6. **Contact SOAR and King County** as partners rather than scraping them.
7. **Schedule a Socrata Discovery sweep** so new county datasets surface on
   their own instead of being found by hand.

Steps 4 and 5 are the ones that put alerts on more county pages. Everything
above them is cheaper; everything below is slower.

---

## 7. What this does not fix

Even with all of the above ingested, **most of the 3,231 counties will still
have nothing**, because most counties publish nothing. Tier 1 adds roughly six
counties. Tier 2 adds three metro areas. Tier 3 adds North Carolina, and more if
UNC answers.

That is a real improvement and it is not coverage. The README safety rule stands
and matters more, not less, as sources are added:

> Absence of alerts is never presented as safety.

`coverage.sourcesFailed` exists so a county that returned nothing because a feed
broke never looks like a county that is genuinely quiet. Adding sources makes
that distinction more important, because the empty counties will increasingly be
the ones nobody publishes about — not the ones where nothing is happening.

---

*Verified against live endpoints on 2026-08-13 and 2026-08-14. Counts and
"most recent" dates are readings from those days and drift daily; endpoint URLs,
column names, and the pass/fail verdicts are the durable content. Three findings
from the original sweep were corrected on re-verification — San Diego's
`death_date` (§2.3), the UNC Stata date format (§4), and Cook County's two
date columns (§2.1) — so treat single-pass findings here as provisional until
re-run. Sources that go into `config/sources.json` should also be recorded there
with a verification date, and dead ones moved to `_retired`, per that file's
existing convention.*
