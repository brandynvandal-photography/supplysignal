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

What release.sh enforces, in order — each one is a lesson from builds 18–33:

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
7. **Upload truth.** App Store Connect owns the build number. ExportOptions
   sets `manageAppVersionAndBuildNumber`, so when ASC already holds the
   number Xcode renumbers the upload silently — it did twice (31→32 on
   08-18, 32→33 on 08-19) while the script's "upload reported" check was a
   `test -d` on a directory it had itself just created. Now the script reads
   the real number back from Xcode's delivery log, renames the archive to
   it, resyncs the project number, and appends a line to
   `build/uploads.jsonl` — the ledger mapping each ASC build to the web tree
   it packaged. A tree already in the ledger is refused before the build
   starts: ASC would accept it again under a new number, as a duplicate
   nobody can tell from the first. One release at a time (a lock dir); an
   upload that fails on a lapsed Apple ID session resumes with
   `./release.sh --upload-only N` after signing in — never a hand
   `xcodebuild -exportArchive`, and never two at once.

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
- Every TestFlight build is in the ledger with the tree it packaged, under
  the number App Store Connect gave it (upload truth).
- The bot's data is never overwritten by a deploy, in either environment.
- Staging is never indexed.

## The offline policy, decided once (2026-08-19)

**Cold open needs network. That is a privacy requirement, not an accident.**

The app wipes Cache Storage at every boot (app.js boot sweep) so a phone that
is seized or shared after a force-quit does not carry a readable copy of what
was looked at — PRIVACY.md §4 names the threat. The cost is that the offline
cache never survives a session. Within a session, caching works and Emergency
is warmed into the cache on open, which is the part that matters at 3am.

Consequences for the pipeline: `no-cache` on entry points and the boot sweep
stay; the content-hashed assets (B4) are cached `immutable` within a session
and re-fetched cold, by design. The one reader-facing line that implied
cross-session offline ("works offline once loaded", About) was corrected to
state the real policy. Do not "fix" the cold-open network need without
re-opening PRIVACY.md §4.
