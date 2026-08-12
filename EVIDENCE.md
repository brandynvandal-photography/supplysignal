# Evidence standard for factual claims

## The rule

**Every epidemiological claim in this app carries a source, and no claim is
stated more strongly than its evidence.** Overstating is not a safe error here.

The reason is practical, not academic. Research on harm reduction messaging
found that people who use drugs generally know fentanyl is a risk, and judge
claims against their own experience. If someone is told "fentanyl is in
everything" and their supply repeatedly tests clean, they do not conclude they
were lucky — they conclude the source is unreliable, and they discount the
warnings that *are* true. Fear-based messaging also measurably fails to change
behavior and deepens the stigma that keeps people away from services.

So: a falsifiable overstatement costs more than an accurate qualified claim.

**The framing that holds up** — used deliberately by the National Harm Reduction
Coalition, and by DanceSafe, which publishes no prevalence percentages at all:

> Shift the load-bearing claim from *"X% of drugs contain fentanyl"* to
> *"you can't tell without testing, and here's how."* The first is falsifiable
> against lived experience. The second is always true and always actionable.

## Before adding a claim

1. Would a reader's own experience contradict it? If yes, qualify it.
2. Is it a national average being stated as a universal? Say so.
3. Does a number describe the **supply** or **deaths**? These are not
   interchangeable and conflating them is the most common error in this subject.
4. Attach a source URL.
5. If sources disagree, say they disagree — see the FTS dilution section in
   `data/testing.json` for the pattern.

---

## Audit of 2026-08-09

Seven claims reviewed after a reader flagged the first. Five were wrong or
overstated.

### 1. "Fentanyl is in most of the current supply" — WAS WRONG

True of illicit opioids, not of the supply generally.

| Sold as | Contains fentanyl |
|---|---|
| Heroin / other opioids | 85–98% |
| Powder cocaine | ~6–15% |
| Powder methamphetamine | ~6–13% |
| Crack cocaine | under 2% (one study: 0 of 53) |
| Crystal methamphetamine | under 1% |
| Cannabis | no laboratory-confirmed cases |

**Supply vs deaths.** Fentanyl co-occurs with stimulants in a large share of
overdose deaths, but the stimulant *supply* is only ~6–15% fentanyl-positive.
Both cannot be explained by contamination. Most of it is co-use — deliberate or
sequential. In a San Francisco study, ~43% of people who overdosed had not
intended to take an opioid; the majority had.

**Do not cite** the DEA "1 in 4 cocaine submissions" figure as a contamination
rate — DEA's own cocaine report puts fentanyl in ~1% of cocaine-primary
exhibits. Those count seizure exhibits, not contaminated powders.

Sources: [Russell et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC10688611/) ·
[Nguyen et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC11052958/) ·
[UNC](https://www.opioiddata.org/the-year-in-drugs-2025/)

### 2. "Xylazine is mixed into much of the fentanyl supply" — WAS OVERSTATED

Heavily regional. Philadelphia ~65% of fentanyl samples and falling (was ~100%);
Los Angeles ~22–29%; national forensic co-reporting ~8%. Not defensible as a
national statement. Philadelphia's xylazine is partly being displaced by
medetomidine.

### 3. "Fentanyl often needs more than one naloxone dose" — WAS MISLEADING

**Fentanyl is not naloxone-resistant.** A cumulative 4 mg reversed ~97% of
suspected fentanyl overdoses. The "many doses" impression largely reflects
responders redosing before onset (IM ~8 min, IN ~15 min). Corrected to: wait
2–3 minutes, then give another — without implying fentanyl needs extra.

Kept the redosing instruction. The correction must not discourage a second dose.

### 4. "Opioids + benzos/alcohol kills most often" — WAS OUTDATED

Fentanyl + a stimulant is the most *frequent* combination (>46% of 2023 deaths);
benzodiazepines were involved in ~10%. But the benzo/alcohol warning stands on
**mechanism** — they stack with opioid respiratory depression — not frequency.
Both are real; only the superlative was wrong.

### 5. "Most states have Good Samaritan laws" — WAS UNDERSTATED AND OVER-REASSURING

All 50 states and DC now have one (Wyoming, March 2025). But protection is much
narrower than readers assume: usually not distribution (sharing can be charged
as such), not existing warrants, and **probation/parole violations only in some
states**. Some laws give only an affirmative defense, not immunity. Expanded
into its own section, because someone under supervision who is told they are
"protected" and is then violated is worse off than someone who knew.

### 6. "Naloxone wears off in 30–90 minutes" — CORRECT, softened

Range is right. Re-sedation is more typical than full recurrence of a
life-threatening overdose. The instruction to stay is unchanged.

### 7. Response technique — VERIFIED

Sternal rub is still standard, but lead with shake-and-shout. One rescue breath
every 5 seconds is correct. Added: if there is no pulse, start CPR first.

---

## Known-unverified

Do not state these as settled without new sourcing:

- US-specific fentanyl prevalence in MDMA — no current US program publishes one.
- Community-setting re-narcotization rates specific to fentanyl — available data
  are ED-based and largely from the heroin era.
- State-by-state Good Samaritan immunity vs affirmative-defense breakdown — the
  standard dataset is current only to Jan 2023. Link readers to a state source.
- Fentanyl in cannabis — phrase as "no laboratory-confirmed cases", not
  "impossible". The absence rests on repeated investigation, not a formal study.

---

## Link hygiene (added 2026-08-10)

Verifying the recovery and supply resources turned up a failure mode worth
recording, because it will bite whoever maintains this next.

### Domains that changed hands or died

Publishing any of these sends a person in crisis somewhere useless or worse:

| Do not publish | Why | Use instead |
|---|---|---|
| `ncsurvivorsunion.org` | 301s to a gambling site | NC DPH SSP list |
| `brokennomore.org` | Unrelated "under construction" placeholder | `broken-no-more.org` |
| `pregnancyjustice.org` | DNS failure | `pregnancyjusticeus.org` |
| `sossobriety.org` | 404, web presence gone | LifeRing |
| `sidran.org` | Absorbed into another org | Traumatic Stress Institute |
| `gananaloxone.com`, `rapidresponsetestkits.com` | DNS failure | `btnx.com` |

### A naive link checker will produce false failures

Many state health department and federal sites return 403, 404, 406 or 500 to
non-browser clients while being perfectly alive — including `cdc.gov`,
`mass.gov`, `rainn.org`, `medicaid.gov`, and several Ohio state domains that
return **404 rather than 403**, which is the most misleading case.

**Do not auto-unpublish a link on a non-200.** Send a browser user agent, and
treat a failure as "needs a human to look", never as "remove it".

### Test strip programs need a shorter re-check interval

Federal grant funds can no longer be used to buy fentanyl or xylazine test
strips as of April 2026. Oklahoma has already discontinued its mail-order strip
program, and Idaho repealed syringe service program authorization outright.
Naloxone listings are comparatively stable; **strip and SSP listings are the
ones that will rot first**, so `data/support.json` carries a `lastVerified`
date and those entries should be re-checked well ahead of the others.

### Claims rejected during this pass

- **988 "Press 3" for LGBTQ+ youth** — the service ended 17 July 2025. Not
  published anywhere; Trevor Project is listed instead.
- **Recovery Dharma described as medication-friendly** — widely repeated, but
  their own current FAQ takes no position on medication at all. Listed as "no
  published position" rather than a reassurance that might not hold.
- **"46-fold more likely to inject" ACE statistic** — traces to commentary, not
  to the peer-reviewed papers. Dube 2003's figures are used instead.
- **Hawaii "free naloxone by mail for residents"** — mail covers Kauaʻi, Lānaʻi
  and Molokaʻi only, despite most secondary sources saying otherwise.
