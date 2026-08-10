# SupplySignal

County-level drug supply alerts, aggregated hourly from public health department reporting, local news, and drug-checking results. Every one of the 3,143 US counties is queryable.

**Runs for about $1–3/month.** The infrastructure is free; the only spend is a small number of Claude Haiku calls used to resolve ambiguous items.

---

## How it works

```
GitHub Actions (hourly)
  ├─ health department + CDC RSS feeds      ~80 requests, covers every county
  ├─ Google News RSS for watched counties   when:30d filters by date server-side
  └─ cold rotation, 19 counties/run         full 3,143 sweep completes weekly
        ↓
  gate 1 (publish date) → deterministic classifier → gate 2 (retrospective)
        ↓
  ambiguous items only → Haiku, batched, no web search
        ↓
  geotag to FIPS → dedupe → cluster → write JSON + per-county RSS → git commit
        ↓
  static site reads the committed JSON
```

**Git is the database.** Each run commits changed JSON, so `git diff` between commits is the new-alert detection, and the history is a free audit trail of exactly what was published when.

---

## Recency

Stale content surfacing as current is the failure this system is built to prevent. Three independent gates:

| Gate | What it does |
|---|---|
| **1 — ingest** | Resolves a publish date from feed metadata. **Undated items are dropped, never defaulted to now.** Google News queries carry `when:30d`, so old articles are never fetched at all. |
| **2 — retrospective** | Rejects a recent article *about* an older incident — the case that passes every date check. Flags foreign years and retrospective phrasing. |
| **3 — query time** | The reader clamps its window to the 365-day ceiling; a nightly job moves aged-out alerts to `archive/`. |

---

## Setup

1. **Fork or create a public repo.** Public is required — Actions minutes are unlimited on public repos, while a private repo's 2,000 free minutes/month won't cover an hourly job.
2. **Enable Actions** and give workflows write permission: *Settings → Actions → General → Workflow permissions → Read and write*.
3. **Optional — add the API key.** *Settings → Secrets and variables → Actions → New repository secret*, named `ANTHROPIC_API_KEY`. Without it the pipeline still runs, and ambiguous items park in `review/pending.json` instead of being resolved.
4. **Set `SITE_URL`** as a repository *variable* (e.g. `https://you.github.io/supplysignal`).
5. **Edit `config/watchlist.json`** with the FIPS codes you want polled every hour.
6. **Enable Pages**: *Settings → Pages → Deploy from branch → main → / (root)*. The site lives at `/site/`.
7. **Build county boundaries** (only needed if you regenerate them):
   `npx us-atlas && node scripts/build-shapes.mjs` — ships prebuilt, so normally skip this.
8. **Run it once manually**: *Actions → ingest → Run workflow*. Scheduled runs begin on the next hour.

### Using the site

- **Search** any of the 3,143 counties by name, with arrow-key navigation and alert counts inline.
- **Near me** resolves your device coordinates to a county *in the browser*, against bundled
  boundary data. No geocoding service is contacted, so the coordinates never leave the device,
  and there is no API key, rate limit, or per-lookup cost.
- **URLs are addressable.** `#/47065` is Hamilton County, TN; `#/47065/30` sets a 30-day window.
  Back and forward work, every county view is shareable, and each county has an RSS feed at
  `feeds/{fips}.xml`.

```bash
npm ci
node test/pipeline.test.mjs      # 22 offline tests, no network
DRY_RUN=1 node src/ingest.mjs    # fetch and classify without writing
```

---

## Configuration

| File | Purpose |
|---|---|
| `config/sources.json` | Feeds, trust levels, enable flags. Add a state by adding an entry — no code change. |
| `config/vocab.json` | Classifier word lists. The `negative` list matters most; court cases and memorials are the dominant false positives. |
| `config/settings.json` | Recency window, confidence bands, LLM budget, polling limits. |
| `config/watchlist.json` | FIPS codes polled every run. |

**Adding state health department feeds is the highest-value tuning you can do.** Only CDC feeds ship enabled; the state entries are stubs with `enabled: false` because feed URLs change and each needs verifying before you trust it.

---

## Cost

| Item | Cost |
|---|---|
| GitHub Actions (public repo) | $0 — unlimited minutes |
| GitHub Pages hosting | $0 |
| Storage (git JSON) | $0 |
| RSS notifications | $0 |
| Google News RSS, GDELT, health dept feeds | $0 — no keys |
| Haiku escalation, ~30–60 items/day | ~$1–3/month |

Web search is deliberately **not** used anywhere in the pipeline — at $10 per 1,000 searches it is the single line item that would take this from dollars to hundreds of dollars a month. Free RSS with a date operator does the same job.

To run at exactly $0, set `llm.enabled: false` in `config/settings.json`. Expect precision to fall from roughly 93% to 75–85%, with ambiguous items accumulating in the review queue instead.

---

## Operating notes

- **Timing is soft.** Scheduled Actions runs are best-effort; 10–30 minute drift is normal and longer happens at peak. The UI shows `last_scan` rather than implying real time.
- **Cron is UTC only.**
- **60-day rule.** GitHub disables scheduled workflows in public repos after 60 days with no repository activity. Hourly commits normally cover this; `maintain.yml` writes a weekly marker as insurance.
- **Google News RSS is unofficial.** It can rate-limit or change format. The adapter fails soft and GDELT is the backup. Never parallelize it, and keep the delay between requests.
- **Review the queue weekly.** `review/pending.json` is where uncertain items land. It is the main quality signal you get.

---

## Safety rules

These hold regardless of budget:

- **No PII.** Names, addresses, and identifying details of individuals are never stored or displayed, even when a source publishes them.
- **No location precision below county.** No streets, blocks, or venues.
- **The disclaimer travels with the data**, in the JSON payload rather than only in the UI, so any client inherits it.
- **Absence of alerts is never presented as safety.** `coverage.sourcesFailed` exists so a county that returned nothing because a feed broke never looks like a county that is genuinely quiet.
- **Crisis resources on every surface**: 911, Poison Control 1-800-222-1222, Never Use Alone 1-800-484-3731, SAMHSA 1-800-662-4357.
- **Retraction path.** If a health department retracts an advisory, remove the cluster and note it. Build this before you promote the tool anywhere.

This service reports what public sources published. It does not verify, advise, or clear.
