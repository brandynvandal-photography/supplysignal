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

---

## 2. UNC Street Drug Analysis Lab — asking to use the chemical dictionary

**To:** the same inbox that answered §1, in reply to that thread.
**Status:** drafted 2026-08-14, not sent.

**What this is about.** After declining the feed request, they sent a copy of
their chemical dictionary — `chemdict.csv`, 382 substances with synonyms,
street names, pronunciations, six-word plain-language glosses, SMILES, tags and
a category.

**Check this before reading the draft, because it is the whole reason the
email exists.** It is *not* the public file:

| | rows | schema |
|---|---|---|
| `opioiddatalab/drugchecking` → `chemdictionary/chemdictionary.csv` (MIT) | 156 | `substance, pronunciation, PubChemCID, CAS, UNII, commonrole`, plus boolean class columns |
| what was sent | 382 | `substance, cid, synonyms, pronunciation, sixwords, vernacular, SMILES, tags, category` |

Different file, different schema, more than twice the rows. The MIT grant on
the repository covers the repository's copy and says nothing about this one.
A lab that published a redistribution policy the same week, after being burned
by downstream misuse, has not implicitly licensed a file by emailing it — and
treating "it arrived in my inbox" as permission is the exact behaviour that
closed the door in §1.

**What it would add**, measured against what already ships rather than guessed:

- 382 substances, **301 of which the app has no entry for at all**
- **105 street names** the search index does not carry
- **54 pronunciations** — the app has none, anywhere
- 226 six-word glosses
- tags including `cut`, `inert`, `impurity`, `flavor`, and 35 rows marked
  `not psychoactive`

That last group answers a question Nightlight currently cannot: *what is this
thing in my drugs that is not a drug?* And `pronunciation` is quietly the most
useful field in an emergency — being able to say "medetomidine" out loud to a
dispatcher.

**Deliberately a smaller ask than §1 was.** Five naming fields, no sample data,
no results, nothing about anybody's drugs.

---

### Draft

> **Subject:** Re: Machine-readable feed for street drug checking results?
>
> Thank you — both for the quick answer and for explaining the policy rather
> than just pointing at it. That is more than most people get, and the reason
> for it is completely understandable.
>
> Thank you as well for the chemical dictionary. Before I use any of it I want
> to ask properly, because I do not think you licensed it by attaching it, and
> after what you described I would rather be the person who asks.
>
> What I checked first: the copy in the opioiddatalab/drugchecking repository
> is MIT licensed, but it is a different file — 156 rows, and an older schema
> without synonyms, vernacular, sixwords or tags. The one you sent has 382
> rows and those fields. So the repository's licence does not cover it, and I
> am not going to assume.
>
> **What I would like to use, and nothing else:** `substance`, `synonyms`,
> `vernacular`, `pronunciation` and `sixwords`. Names, street names, how to say
> them, and the plain-language line. No sample data, no results, no counts,
> nothing about what anyone's drugs contained.
>
> **What it would do.** Nightlight is a free, non-commercial harm reduction
> reference — no account, no advertising, nothing sold, no analytics. Those
> five fields would go to three places:
>
> - **Search.** 105 of your street names are not in our index. Somebody typing
>   what a thing is actually called on their street would reach the page about
>   it.
> - **Pronunciation.** We have none at all. Being able to say "medetomidine"
>   to a 911 dispatcher, or to a nurse, is worth more than it sounds.
> - **The things that are not drugs.** Your tags mark cuts, impurities and
>   inert material, and the glosses explain them in a line. We currently have
>   no honest answer for a reader who has been told there is something in their
>   supply and cannot find out what it even is.
>
> It would be attributed to the lab on every screen it appears on and linked
> back to you, in whatever wording you want. If you would rather it were not
> attributed, that is fine too.
>
> **On the thing that prompted your policy.** The app cannot learn what any
> reader looks at — every dataset ships as one national file, identical for
> every visitor, and all lookups run in the browser, so there is no request
> that records which drug or which county anyone checked. There are no
> analytics of any kind. Nothing you shared would become a way of profiling the
> people it is meant to help, and nothing would be republished as a bulk
> download or presented as our own work.
>
> If the answer is no, that is a completely fine answer and I will not use it.
> If the answer is "not that file, but here is one you can use," that is even
> better. And if there are conditions — attribution wording, a caveat you want
> shown, a field you would rather we left alone — I would rather have them than
> not.
>
> One other thing you may want to know, since it came from your work: we now
> tell readers which brand of fentanyl strip they are holding and what its own
> blind spots are, because of the 251-compound screen showing a third of
> analogues are found by one brand and not the other. That paper changed what
> this app tells people.
>
> Best regards,
> [name]
> [role / affiliation, if you want to give one]
> https://nightlight.help

---

### Notes before sending

- **Reply in the existing thread.** They answered once; this is a smaller ask
  in the same conversation, not a fresh approach.
- **Do not use any of it until they answer.** Not the street names, not the
  pronunciations. There is no partial version of asking permission.
- **If they say yes,** the fields map to `data/substances.json` aliases and to
  `data/search-intents.json` slang; the glosses and tags want a new
  `data/dictionary.json` built by a script under `scripts/`, so the CSV stays
  the source and nothing is hand-copied.
- **If they say no,** record it in `ALERT-SOURCES.md` §4 with the date, the
  same as everything else, and delete the local copy of the file.

---

## 3. StreetCheck / Brandeis — asking permission before touching the aggregator

> **SHELVED 2026-08-24, BEFORE SENDING — the reach is too small.** The 21
> contributing labs on the site are the roster of who *may* submit, not who
> currently does. The ten most recent samples that day were Brattleboro VT (5),
> Providence, Pawtucket and Woonsocket RI (3), one "Online" and one unspecified
> Rhode Island — live flow concentrated in two small states. For an app keyed on
> counties nationally, that means nearly every reader's county shows nothing,
> which reads as a broken feature rather than an honest absence. Not worth
> spending a partnership ask, an ingest adapter and an ongoing scrape on.
> Revisit if the contributor list starts producing volume across more states.
> The draft is kept as the record of what was checked and why it stopped here.

**Status:** drafted 2026-08-24, **not sent — shelved, see above**.

**To:** `communitydrugchecking@gmail.com` — the project's own inbox, published on
info.streetcheck.org. `madds@brandeis.edu` is the MADDS program inbox on the same
page and is the alternative if the first does not answer. A third address on that
page belongs to a named individual; use an inbox, per the rule at the top of this
file.

**Why this email exists at all, and why it comes before any code.** StreetCheck
publishes **no terms of service**. That is not permission. It is silence, and
this project is the last one that should read silence as a green light — §1 above
is a lab that closed its data *because of unauthorised downstream use*, and their
reply is recorded three sections up. Doing to Brandeis what somebody else did to
UNC is how the next door shuts, on everyone who comes after.

**Checked 2026-08-24, so the message does not tell them things about their own
site that are out of date:**

| | |
|---|---|
| `streetcheck.org/Public/Results` | live; samples dated **08/2026** — current, unlike every other sample source surveyed |
| Contributing labs and locations listed | **21**, including California CFSRE, Colby College, Connecticut State Lab, DrugsData, Illinois, Maine, Maryland, Massachusetts, Michigan, Minnesota, Nevada, New Mexico, New York, NIST, North Carolina, Oregon, Rhode Island RIH, UNC, Vermont, Washington, Wisconsin |
| `/Home/Terms`, `/terms`, `/Home/Privacy`, `info.streetcheck.org/terms` | all **404** with a browser UA. Footer "Privacy" and "Terms" links have `href="#"` |
| `/api/results` | 404 |
| `/Public/Results?export=csv` | 200, but returns **HTML, not CSV** — the query is not an export route |
| Geography | **city-level, not county-level** — the one structural mismatch |

So: current, broad, machine-*un*-readable, and geographically one level off from
what this app is keyed on. The city-to-county resolver that gap needs already
exists here, in `data/places.json`.

---

### Draft

> **Subject:** Permission to use StreetCheck results in a non-commercial harm reduction app?
>
> Hello,
>
> I maintain Nightlight (https://nightlight.help), a free, non-commercial harm
> reduction reference — county-level drug supply alerts, how to use test strips
> and reagents, and what to do during an overdose. No account, no advertising,
> nothing sold, no analytics of any kind.
>
> I am writing to ask permission before doing anything, rather than after.
>
> StreetCheck is the most current picture of the US drug supply I have been able
> to find anywhere — samples dated this month, across twenty-one contributing
> labs and locations. Nothing else I surveyed is both national and current.
>
> I could not find terms of service on the site, and I want to be plain about
> how I am reading that: as an absence, not as permission. I would rather ask
> and be told no than help myself and be the reason a policy gets written.
>
> **What I would like to do, specifically.** Show, at county level, which
> substances have recently turned up in checked samples near a reader —
> attributed to StreetCheck on every screen it appears on, linking back to you,
> in whatever wording you prefer. Never republished as a bulk download, never
> presented as our own finding, and never characterised as "what is in your
> drugs" — only as what was found in samples that were checked.
>
> **The one technical mismatch, in case it matters to you.** Your results are
> city-level and this app is keyed on counties, so I would be resolving city to
> county locally rather than asking you to change anything.
>
> **On why I am being careful.** Another lab recently restricted its
> machine-readable data after downstream misuse, and told me so directly when I
> asked them for a feed. That answer is the reason this email exists in this
> shape. I would rather be the kind of downstream user that makes the next
> person's ask easier.
>
> **One thing you may want to know.** The app cannot learn what any reader looks
> at. Every dataset ships as a single national file, byte-identical for every
> visitor, and all lookups run in the browser — so there is no request recording
> which county or which drug anyone checked. Whatever you shared would not
> become a way of profiling the people it is meant to help.
>
> If there is a shape that is least work for you — an existing export I have
> missed, a periodic file, or simply conditions you would want attached — I am
> glad to take it. And if the answer is no, that is a complete answer; I will
> record it and not ask again.
>
> Thank you for building the thing that is actually current. That is rarer than
> it should be.
>
> Best regards,
> [name]
> [role / affiliation, if you want to give one]
> https://nightlight.help

---

### Notes before sending

- **Sign it yourself**, as with §1 — say whether you are writing personally or
  in a public-servant capacity.
- **Do not scrape anything while waiting.** There is no partial version of
  asking permission, and the whole argument of the email is that we did not.
- **If they say yes,** the ingest is a new adapter in `src/sources/`, and the
  city-to-county step uses `data/places.json`. Drug checking is a *finding about
  a sample*, not a death — it belongs in the `lab` evidence class in
  `src/evidence.mjs`, and it is the only source type that could honestly support
  "this is in the supply now" rather than "this was in it recently".
- **If they say no, or do not reply,** record it in `ALERT-SOURCES.md` with the
  date and what came back, the same as every other dead end there.
- **Do not quote UNC's reply at them.** The email refers to it as the reason for
  our own caution, without naming a lab that answered us privately.
