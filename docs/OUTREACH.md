# Outreach

Drafts for the data-partnership asks in `ALERT-SOURCES.md` §6. Nothing here has
been sent — these are for the maintainer to edit, sign and send from their own
address.

Rules that apply to anything in this file, the same as everywhere else in the
project: no real person is named, nothing is claimed about the app that is not
true today, and every fact quoted at a recipient about their own data was
actually fetched and checked on the date given.

---

## 1. UNC Street Drug Analysis Lab — asking for a machine-readable feed

> **SENT AND ANSWERED — 2026-08-14. The answer is no.** Machine-readable
> datasets now go only to programs that send them samples, and only that
> program's own data, after inappropriate use by others. Their policy is at
> `https://results.streetsafe.supply/data-use`. The full reply, what the policy
> says, and the licence check confirming that nothing Nightlight already ships
> is affected, are recorded in `ALERT-SOURCES.md` §4. **Do not send this
> again.** They said they will revisit it; the newsletter is where that would
> be announced. The draft below is kept as the record of what was asked.

**To:** opioiddatalab@unc.edu
**Verified 2026-08-14:** the address is published on streetsafe.supply as the
lab's own contact. It is an inbox, not an individual.

**Why this is the highest-value ask on the list.** They hold the best
drug-checking data in the country — actual chemistry on actual street samples,
with county resolution — and there is no public API. Everything else in the
survey is either mortality data (lagging, six counties) or prose. One email.

**What was checked before writing, so the message does not waste their time:**

| | |
|---|---|
| `github.com/opioiddatalab/drugchecking` → `datasets/nc/nc_analysis_dataset.csv` | 1,735 samples, 56 NC counties, `date_collect` 22mar2021 → 15jul2025, ~42 `lab_*` boolean flags |
| Repo's last commit | 2025-08-26 |
| `datasets/analysis_dataset.csv` (the "national" file) | 20 rows, demo sample, 2022 — easy to mistake for the real one |
| `results.streetsafe.supply` | live, Next.js; `/api/samples`, `/api/results`, `/api/data`, `/data.json` all 404 |

So: the machine-readable half is North Carolina only and a year behind, and the
current half is not machine-readable. That gap is the whole subject of the email.

---

### Draft

> **Subject:** Machine-readable feed for street drug checking results?
>
> Hello,
>
> I maintain Nightlight (https://nightlight.help), a free, non-commercial
> harm reduction reference. It carries county-level drug supply alerts, how to
> use test strips and reagents, and what to do during an overdose. There is no
> account, no advertising, and nothing is sold.
>
> I am writing to ask whether the lab publishes, or would consider publishing,
> a machine-readable feed of current drug checking results.
>
> I have been through what is already public, so as not to ask you for
> something that exists:
>
> - `datasets/nc/nc_analysis_dataset.csv` in the opioiddatalab/drugchecking
>   repository is genuinely useful — 1,735 samples across 56 North Carolina
>   counties, with `countyfips` and the `lab_*` flags — but its most recent
>   `date_collect` is 15 July 2025, and the repository's last commit is
>   26 August 2025.
> - `datasets/analysis_dataset.csv` is a 20-row sample from 2022.
> - results.streetsafe.supply is current, but I could not find a public data
>   route behind it.
>
> If a feed is not something you publish, I would be glad to know that too — I
> would rather record it accurately than keep guessing at it.
>
> **What Nightlight would do with it.** Show, at county level, which substances
> have recently been found in checked samples, attributed to the lab and linking
> back to your results site. Nothing would be republished as a bulk download or
> presented as our own finding.
>
> **One thing that may matter to you.** The app is built so that it cannot learn
> what any reader looks at. Every dataset ships as a single national file that
> is byte-identical for every visitor, and all lookups run in the browser, so
> there is no request that records which county or which drug anyone checked.
> There are no analytics of any kind. Whatever you shared would not become a
> way of profiling the people it is meant to help.
>
> I am happy to take this in whatever shape is least work for you — a CSV
> refreshed in the existing repository, a documented endpoint, or a periodic
> export. I am equally happy to follow any conditions you would want on
> attribution, caching, caveats, or how results are characterised.
>
> Thank you for making the North Carolina data public in the first place. It is
> more than almost anyone else has done.
>
> Best regards,
> [name]
> [role / affiliation, if you want to give one]
> https://nightlight.help

---

### What came back

Same day. Recorded in full in `ALERT-SOURCES.md` §4; the substance is that
machine-readable datasets now go only to programs sending them samples, and
only their own program's data, because of inappropriate use by others.

Two things worth taking from it, beyond the answer:

- **The email did not cost them anything to answer, and it was answered
  properly.** Checking what was already public before asking is why the reply
  is a policy explanation rather than a link to the repository we had already
  read.
- **"A few bad actors have spoiled it for the rest" is the whole context for
  how this project should behave downstream.** Nightlight is inside its rights
  on everything it already uses — CC0 and MIT, verified — and being inside
  one's rights is not the same as being the kind of user a lab wants more of.
  If this relationship is ever worth having, the thing to offer is what the
  data is used for and how it is characterised to readers.

### Notes from before sending, kept

- **Sign it as yourself.** Say whether you are writing in a public-servant
  capacity or personally; a university lab will read those differently, and
  guessing wrong for you is not mine to do.
- **Consider what you are offering back.** They are a research lab; a
  standing offer to cite them, or to share how the data gets used in practice,
  is worth more than it costs.
- **If they say no, or do not reply,** record it in `ALERT-SOURCES.md` the way
  every other dead end there is recorded — what was asked, when, and what came
  back — so the next person does not send the same email.
- **If they say yes,** the ingest side is a new adapter in `src/sources/`. The
  county-level shape is already what `medex.mjs` produces, so the display side
  needs nothing new. Note that drug checking is a *finding about a sample*, not
  a death — it belongs in the `lab` evidence class in `src/evidence.mjs`, and
  it is the only source type that could honestly support a "this is in the
  supply now" claim rather than "this was in it recently".
- **Levamisole and BTMPS** are on nobody's mortality watchlist for good reason
  (see the note above `WATCH` in `medex.mjs`) — a drug-checking feed is exactly
  where they would become visible, so they should go on its watchlist if this
  lands.
