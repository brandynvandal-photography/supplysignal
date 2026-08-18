# Dev → QA/UAT → Prod

How a change travels from an editor to nightlight.help and the App Store, and
what stands between each step. Written 2026-08-18, after a week in which every
web push went straight to production and four broken app builds reached
TestFlight because nothing sat between "archive succeeded" and "upload."

The two tools: `scripts/ship.mjs` here, and `release.sh` in the Capacitor
repo (`~/Downloads/nightlight-capacitor`). Everything below is what they
enforce, so this document describes the pipeline rather than being the
pipeline.

## Environments

| stage | web | app |
|---|---|---|
| dev | `node scripts/dev-server.mjs 8765` (no-store, serves the working copy) | simulator builds (`build/sim-N`) |
| QA / UAT | `staging` branch → Netlify branch deploy, noindexed | TestFlight internal group |
| prod | `main` → nightlight.help | App Store release |

The working copy (`~/Downloads/supplysignal-files`) is not a git checkout —
by design, it never carries the ingest bot's churn. `ship.mjs` moves an
allowlist of our files into a scratch clone and pushes the right branch. The
bot's output (alerts.json, index.json, runs.json, counties/, the caches) is
excluded in both directions: we never overwrite fresher bot data with a stale
local copy, and staging's copy of it simply ages between ships — QA is for
app code and content, not for data freshness.

## Web

```
edit → npm test (22 suites)
     → node scripts/ship.mjs staging          # pushes staging branch
     → look at the staging URL                # the QA/UAT step
     → node scripts/ship.mjs prod -m "..."    # pushes main
```

What ship.mjs does beyond the push:

- **Syncs the service worker VERSION** before testing. The hash ritual is
  gone; the sw test still guards every other path to a deploy.
- **Runs the full suite** and refuses to ship on a failure. `--skip-tests`
  exists for staging; prod additionally demands `--force` to accept it.
- **The prod gate.** A prod ship compares the exact ship-set against what
  `staging` currently holds and refuses to push a tree QA has not seen.
  `--force` overrides, loudly, for the hotfix case — say why in `-m`.
- **Staging is noindexed.** ship.mjs injects an `X-Robots-Tag: noindex`
  header block into the staging branch's netlify.toml only.
- **Records the ship** in `.shipped-<env>.json` (tree hash + commit), which
  is what lets an app build prove which web tree it packaged.

Build credit: a staging push costs a Netlify build like any push, throttled
by the same `deploy-needed` ignore script. Pushes that touch only scripts/,
test/ or docs/ skip the build entirely on both branches.

**One-time setup (account owner):** Netlify → Site configuration → Build &
deploy → Branch deploys → add `staging`. Until then the branch exists but
nothing serves it.

## App

```
node scripts/ship.mjs staging|prod      # in the site repo, first
cd ~/Downloads/nightlight-capacitor
./release.sh --env prod                 # gate → bundle → sim proof → archive → upload
```

What release.sh enforces, in order — each one is a lesson from builds 18–30:

1. **The trace gate.** The local site tree's hash must match the recorded
   ship for `--env`. If the site changed since it was shipped, the release
   refuses: an app build must package exactly the bytes its environment
   serves.
2. **The real bundler.** `sync-www.sh` → `build-app.mjs` (path rewrite, CSP
   origin, self-containment check) → the offline test resolving all
   app-requestable paths. Builds 18–21 shipped blank because a hand rsync
   bypassed this; the script cannot.
3. **Bundle assertions.** Rewritten asset paths, `connect-src` carrying
   nightlight.help, nav order, sw VERSION matching the working copy.
4. **Proof of boot.** Simulator install, launch, and a settled screenshot
   that must not be a black frame. No proof, no archive.
5. **Auto build number.** Reads the project's current number and bumps it —
   no more hand-editing the pbxproj.
6. **Archive verification.** The archived payload must contain the same sw
   VERSION and the build number it claims, then export/upload runs through
   the checked-in ExportOptions.plist.

After the upload, TestFlight processing (~minutes) puts the build in front of
the internal group automatically. That group **is** QA/UAT:

- run the checklist in `RELEASE.md` (boot on iPhone + iPad, nav order,
  Alerts window switch, reagent tracker two-part note, Quick Exit, dark
  mode, offline airplane-mode pass);
- **expire superseded builds** in App Store Connect → TestFlight → iOS
  Builds → Expire, so nobody can install a known-bad one;
- promotion to prod is submitting that exact build for App Store review in
  ASC. Manual and deliberate — there is no API key on this machine, so
  nothing can submit by accident.

**Optional one-time setup** for future automation (expiring builds and
submissions from scripts): create an App Store Connect API key (Users and
Access → Integrations), drop the `.p8` in
`~/.appstoreconnect/private_keys/`. Until then those steps stay manual in
the ASC web UI.

## The invariants, in one place

- Nothing reaches `main` that `staging` did not hold first (ship gate).
- Nothing reaches TestFlight that a simulator did not boot (release gate).
- Nothing is packaged that was not shipped (trace gate).
- The bot's data is never overwritten by a deploy, in either environment.
- Staging is never indexed.
