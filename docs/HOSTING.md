# Hosting — Cloudflare Pages

nightlight.help is served by **Cloudflare Pages**, deployed by direct upload
from GitHub Actions. This file is the runbook: what is wired, the one-time
setup only the account owner can do, the cutover, and how to roll back.

## Why it moved

Netlify's metered plan returned `503 usage_exceeded` on 2026-09-07 and the
site was down until the allowance reset. On a harm reduction app a 503 is a
safety failure, not a billing event — the person opening `/sos` does not get
a second try. The credit pressure also shaped engineering: fixes were held
back to batch them into fewer builds.

Cloudflare Pages on the free plan has no bandwidth cap and, deployed by
direct upload, no build cap either: the 500-builds-a-month allowance counts
builds Pages runs itself, and this repository never asks it to build.

## How it is wired (already in the repository)

| Piece | What it does |
|---|---|
| `scripts/hosting.mjs` | Parses `netlify.toml` and derives Pages' `_redirects` and `_headers`. **`netlify.toml` stays the single source of every hosting rule.** |
| `scripts/build-site.mjs` | Writes both files into `dist/` alongside the app. |
| `test/hosting.test.mjs` | Proves the derivation round-trips: every tab route rewritten on both hosts, every header rule identical, every forced-404 covered by the `dist/` allowlist instead. |
| `.github/workflows/pages.yml` | Builds `dist/` on a runner and uploads it with `wrangler pages deploy`. Runs on a push to `main` or `staging`, by hand, and at the end of `ingest`, `maintain` and `refresh` (bot commits do not fire push events). |
| `scripts/deploy-needed.mjs` | Unchanged. Skips the upload when the only diff is ingest timestamps. |

The workflow is **gated on the repository variable `PAGES_PROJECT`**. Until
it is set, the deploy job is skipped and Netlify keeps serving. Nothing about
`scripts/ship.mjs` changes: ship pushes git, Actions deploys.

What Pages cannot express and does not need: the forced `404` denylist rules.
`dist/` is an allowlist, so `/src/*`, `/config/*`, `/README.md` and the rest
are not uploaded and 404 because they do not exist. `test/hosting.test.mjs`
checks every denylisted path against the allowlist on every run.

## One-time setup (account owner)

1. **Cloudflare account** (free). Note the *Account ID* from the dashboard
   sidebar.

2. **Create the project** — either

   ```bash
   npx wrangler@4 login
   npx wrangler@4 pages project create nightlight --production-branch main
   ```

   or in the dashboard: *Workers & Pages → Create → Pages → Upload assets*,
   name `nightlight`, production branch `main`. Do **not** connect the GitHub
   repository to Pages — that would turn every ingest commit into a metered
   build, which is the problem this move exists to end.

3. **API token**: *My Profile → API Tokens → Create Token → Custom*, one
   permission: **Account · Cloudflare Pages · Edit**, scoped to this account.

4. **GitHub repository** (`brandynvandal-photography/supplysignal`,
   *Settings → Secrets and variables → Actions*):
   - secret `CLOUDFLARE_API_TOKEN` — the token from step 3
   - secret `CLOUDFLARE_ACCOUNT_ID` — from step 1
   - variable `PAGES_PROJECT` = `nightlight` — this is the switch

5. **First deploy**: *Actions → pages → Run workflow* on `main`. It builds and
   uploads. The site is then live at `https://nightlight.pages.dev` (and the
   staging branch, when shipped, at `https://staging.nightlight.pages.dev`,
   with the `X-Robots-Tag: noindex` header ship.mjs injects on staging).

6. **Verify on the pages.dev URL before touching DNS**:

   ```bash
   H=https://nightlight.pages.dev
   curl -sI $H/alerts | grep -i "^HTTP\|x-frame-options\|content-security-policy\|cache-control"
   curl -s  $H/sos | grep -c "<title>Nightlight</title>"        # 1: the shell is served at a tab path
   curl -sI $H/site/sw.js | grep -i "service-worker-allowed\|cache-control"
   curl -sI $H/data/alerts.json | grep -i "cache-control"      # no-cache
   curl -s -o /dev/null -w "%{http_code}\n" $H/src/ingest.mjs   # 404
   curl -s -o /dev/null -w "%{http_code}\n" $H/README.md        # 404
   curl -s -o /dev/null -w "%{http_code}\n" $H/app-support/     # 200
   ```

   Then open `/sos`, `/test` and `/drugs#/fentanyl` on a phone: the service
   worker registers, a county opens, the combination checker works. The app
   makes no request that is not to its own origin, so nothing else needs to
   be allowed anywhere.

## Cutover — the domain

`nightlight.help` is registered at **Porkbun**, which also hosts its DNS.
Today the apex has two `A` records pointing at Netlify (`99.83.231.61`,
`75.2.60.5`) and `www` is a `CNAME` to `mynightlight.netlify.app`. **Write
those down; they are the rollback.**

Pages can serve a *subdomain* from any DNS provider, but an **apex domain
must be a zone on the Cloudflare account**. So:

1. In Cloudflare, *Add a site → nightlight.help → Free*. It reads the
   current records from Porkbun; keep them for now.
2. **Before switching nameservers**, set these zone settings — each one
   either injects a script (which the app's strict CSP would block, breaking
   the feature and logging errors) or is analytics this app must not run:
   - *Scrape Shield → Email Address Obfuscation*: **off** (it rewrites
     `mailto:` links through a script — the `hello@nightlight.help` contact
     link would stop working)
   - *Speed → Rocket Loader*: **off**
   - *Speed → Speed Brain*: **off**
   - *Security → Bots → Bot Fight Mode*: **off** (its challenge JS is blocked
     by the CSP; a challenged reader sees a broken page)
   - *Analytics → Web Analytics*: **do not enable**; *Zaraz*: **do not enable**
   - *SSL/TLS → Always Use HTTPS*: **on**
   - *Caching → Browser Cache TTL*: **Respect Existing Headers** (the
     immutable / no-cache split comes from `_headers` and must not be
     overridden; add no cache rules or page rules)
3. At Porkbun, replace the nameservers with the two Cloudflare assigns.
   Propagation is minutes to hours.
4. Once the zone shows *Active*: *Workers & Pages → nightlight → Custom
   domains → Set up a domain* for `nightlight.help`, then again for
   `www.nightlight.help`. Cloudflare writes the records itself.
5. Check `https://nightlight.help/alerts` returns `server: cloudflare` and the
   same headers as step 6 above. Check `/w` (Quick Exit's landing page) and
   `/feeds/<fips>.xml`.

The iOS app needs nothing: its bundle is offline and its alert refresh
fetches `https://nightlight.help/data/alerts.json`, which does not change.

## After cutover

- Leave Netlify building for a week as a fallback, then *Site configuration →
  Build & deploy → Stop builds*. **Do not delete the Netlify site**:
  `mynightlight.netlify.app` is the rollback target and the 301 from the
  old `/support/` App Store URL lived there.
- `netlify.toml` stays in the repository as the rule source even after
  Netlify stops serving. Renaming it would be cosmetic and would touch every
  test that reads it.

## Rollback

Put the four Porkbun records back (two `A` at the apex, the `www` CNAME) —
or, if the zone is already on Cloudflare, change the apex to those `A`
records and `www` to the Netlify CNAME, both **DNS only** (grey cloud).
Netlify serves the last build it made; if builds were stopped, press *Trigger
deploy* once.

## Privacy, restated for this host

The threat model in PRIVACY.md does not change: every lookup is a fragment,
every dataset is one national bundle, and the host's log can only ever say
that somebody loaded the site. Cloudflare's free plan exposes no request logs
to the operator, and nothing above enables an analytics product. The `*.pages.dev`
URLs serve the same `noindex` app as the domain; do not link to them anywhere
a reader would see.
