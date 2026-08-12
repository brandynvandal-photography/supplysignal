# Nightlight

County-level drug supply alerts, drug-checking guidance, and substance and
combination information. Built for overdose prevention, for anyone — people who
use drugs, the people who love them, and outreach workers.

Every one of the 3,231 US counties and county-equivalents is queryable,
including all five territories, and every county shows **the counties that
border it**, because supply does not stop at a county line.

**It is information, not medical advice.** It reports what public sources
published. It does not verify, advise, or clear anything as safe.

---

## What's in it

| Section | What it does |
|---|---|
| **Alerts** | Published supply warnings for a county, plus every bordering county, with distance. Cross-state by construction. |
| **Test** | How to use fentanyl, xylazine, benzodiazepine and nitazene strips, and eight reagents — with each tool's documented limits. |
| **Substances** | Dose, duration, tolerance, and a **combination checker** covering 841 substance-pair interactions. |
| **Help** | Overdose response, naloxone access, 24/7 hotlines, and what this site does and does not know about you. |

---

## Privacy is the architecture

Read [PRIVACY.md](PRIVACY.md). The short version:

**Every dataset is bundled and every lookup runs in the browser.** Choosing a
county, searching a substance, or checking a combination makes **zero** network
requests. A subpoena to the host yields "someone loaded the site" and nothing
else.

The obvious design — `GET /data/counties/47065.json` — would write
`IP → Hamilton County` into an access log the operator cannot disable. So it
isn't built that way, and `npm run test:privacy` fails the build if anyone
reintroduces it.

Also: no third-party requests of any kind (enforced by CSP, so the browser
blocks a reintroduced font CDN rather than trusting review), system fonts
instead of a webfont, `no-referrer` on everything outbound, no cookies or
storage beyond a theme preference, geolocation resolved on-device against
bundled boundaries, and a **Quick Exit** button that clears local traces, drops
the page out of the Back button, and leaves.

---

## Data sources

| Source | Use | License |
|---|---|---|
| Health dept + CDC RSS | Alerts | Public |
| Google News RSS, GDELT | Alerts | Public, no key |
| **PsychonautWiki** | Dose, duration, interactions | CC BY-SA 4.0 — derived bundle inherits it |
| **TripSit** | Combination matrix | Link-back + per-page source note required |
| **openFDA** | FDA Boxed Warnings | CC0 / public domain |
| **Erowid / DrugsData** | Outbound links only | All rights reserved — **nothing copied** |

Attribution renders in the UI and is a **license condition**, not decoration.
Do not remove it. See [OUTREACH.md](OUTREACH.md) for permission-request drafts.

**DrugsData is link-only on purpose.** It has no API, no CORS, requires written
Erowid permission to republish, and stopped accepting samples in April 2024 —
it is a frozen archive, not a current feed.

---

## Setup

1. **Fork or create a public repo.** Public is required: Actions minutes are
   unlimited on public repos, and a private repo's 2,000/month won't cover an
   hourly job.
2. **Enable Actions** with write permission: *Settings → Actions → General →
   Workflow permissions → Read and write*.
3. **Optional — add `ANTHROPIC_API_KEY`** as a repository secret. Without it the
   pipeline still runs; ambiguous items park in `review/pending.json`.
4. **Set `SITE_URL`** as a repository *variable*.
5. **Edit `config/watchlist.json`** with the FIPS codes to poll hourly.
6. **Enable Pages**: *Settings → Pages → Deploy from branch → main → / (root)*.
7. **Run it once**: *Actions → ingest → Run workflow*.

### Build the reference data

Ships prebuilt; regenerate when you want fresher upstream data:

```bash
npm ci
npm run build:reference     # substances + combination matrix
npm test                    # 46 tests, no network
```

| Script | Output |
|---|---|
| `build:substances` | `data/substances.json` — PsychonautWiki + openFDA |
| `build:combos` | `data/combos.json` — TripSit matrix |
| `build:regional` | `data/regional.json` — UNC regional fingerprints (CC0) |
| `build:mortality` | `data/mortality.json` — CDC county overdose trend |
| `build:adjacency` | `data/adjacency.json` — bordering counties |
| `build:places` | `data/places.json` + `places-rural.json` — city search |
| `build:gazetteer` | `data/counties.json` — reconcile against boundaries |
| `build:shapes` | `data/county-shapes.json` — offline location lookup |

### Search covers every town, including the small ones

You can search by **city or county** — almost nobody knows their county, and
making them name one is a barrier for exactly the people this is for. A city
resolves to the county that publishes the data; nothing is ever reported below
county level.

The index is 32,257 places and splits in two, because 241 KB is a real wait on
a slow connection for the app's primary interaction:

| Tier | Contents | Size |
|---|---|---|
| `places.json` | ~15,000 places with a known population, ranked | 106 KB |
| `places-rural.json` | ~17,000 unincorporated places and CDPs | 90 KB |

Tier 1 loads when the search box is focused; tier 2 streams in behind it and
the UI says so while it is arriving. **Trimming small places to save bytes was
considered and rejected** — rural counties have the worst overdose outcomes and
the thinnest services, so that is the last coverage to give up.

Adjacency is derived from **shared TopoJSON arcs** in the boundary file: two
counties border each other exactly when they reference the same arc. No extra
dataset, no API. Islands fall back to nearest-centroid and are marked as such.

---

## Recency

Stale content surfacing as current is the failure this is built to prevent.

| Gate | What it does |
|---|---|
| **1 — ingest** | Resolves a publish date. **Undated items are dropped, never defaulted to now.** Google News queries carry `when:30d`. |
| **2 — retrospective** | Rejects a recent article *about* an older incident — the case that passes every date check. |
| **3 — query time** | The reader clamps to a 365-day ceiling; a nightly job moves aged-out alerts to `archive/`. |

---

## Configuration

| File | Purpose |
|---|---|
| `config/sources.json` | Feeds and trust levels. **22 state feeds verified live 2026-08-09**; `_retired` records dead URLs so they don't get re-added. |
| `config/vocab.json` | Classifier word lists. The `negative` list matters most — court cases and memorials are the dominant false positives. |
| `config/settings.json` | Recency window, confidence bands, LLM budget, polling limits. |
| `config/watchlist.json` | FIPS codes polled every run. |

---

## Cost

Unchanged: **about $1–3/month**, entirely Haiku calls for ambiguous items.
Actions, Pages, storage, RSS, and every data source above are free. Set
`llm.enabled: false` for exactly $0, at the cost of precision falling from
roughly 93% to 75–85%.

Web search is deliberately **never** used — at $10 per 1,000 searches it is the
one line item that would take this from dollars to hundreds a month.

---

## Safety rules

These hold regardless of budget:

- **No PII.** Names, addresses, and identifying details are never stored or
  displayed, even when a source publishes them.
- **No location precision below county.** No streets, blocks, or venues.
- **The disclaimer travels with the data**, in the JSON rather than only the UI.
- **Absence of alerts is never presented as safety.** The empty state says so in
  as many words; `coverage.sourcesFailed` exists so a county that returned
  nothing because a feed broke never looks like a county that is genuinely quiet.
- **Severity is never color alone** — every badge carries a glyph and a word.
- **Crisis resources on every surface**: 911, Poison Control 1-800-222-1222,
  Never Use Alone 1-800-484-3731, SAMHSA 1-800-662-4357.
- **Retraction path.** If a health department retracts an advisory, remove the
  cluster and note it. Build this before promoting the tool anywhere.

---

## Not done yet

- **CDC provisional overdose data** (`scripts/` job pending). Verified working:
  `data.cdc.gov` dataset `gb4e-yj24` is county-level with FIPS and 12-month
  rolling counts; `8hzs-zshh` breaks out 12 substances including xylazine,
  bromazolam and nitazenes. Public domain, no key. Ingest server-side and add to
  the bundle — do **not** fetch it from the browser despite its CORS support.
- **CFSRE NPS Discovery mirror** — the best emerging-adulterant source, but
  PDF-only with no CORS, so it needs a scheduled extract job.
- **Spanish translation.** Puerto Rico's 78 municipios are now covered and this
  is English-only. The UI strings are centralised enough to make this tractable
  and it is the highest-value accessibility work remaining.
- **Send the emails** in [OUTREACH.md](OUTREACH.md). UNC's dataset is current
  and covers 42 states — it is the biggest single upgrade available.

---

This service reports what public sources published. It does not verify, advise,
or clear. No test, and no absence of alerts, makes a supply safe.
