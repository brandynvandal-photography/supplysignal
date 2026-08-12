# Data permission requests — drafts

Four emails. **Nothing here has been sent.** Review, edit the bracketed fields,
and send them yourself from your official address — coming from a named public
health official rather than an anonymous project is most of what gets these
answered.

Ordered by how much they unblock:

| # | To | Unblocks | Urgency |
|---|---|---|---|
| 1 | UNC Street Drug Analysis Lab | Current, real drug-checking data (42 states, updated weekly) | **Highest — this is the live data the app is missing** |
| 2 | TripSit | Written terms for the combination chart already bundled | High — resolves a live ambiguity |
| 3 | PsychonautWiki | Which license covers API output | Medium — affects how the bundle must be licensed |
| 4 | Erowid Center | Republishing DrugsData lab results | Low — archive is frozen, deep-links work today |

---

## 1. UNC Street Drug Analysis Lab

**To:** `opioiddatalab@unc.edu`
**Subject:** Data request — county-level drug supply alerts for [STATE/COUNTY] public health

> Hello,
>
> I'm [NAME], [TITLE] with [AGENCY]. I'm building a free, non-commercial public
> health tool that aggregates published drug supply warnings by county, so that
> residents and outreach workers can see what has been reported in their area
> and in neighboring counties. It is harm reduction information only — it does
> not sell anything, carry advertising, or collect any user data.
>
> Your data-use page notes that the aggregated dataset behind
> results.streetsafe.supply is available on request, so I'm writing rather than
> collecting it automatically — we have not scraped the site and will not.
>
> Specifically I'd like to ask about:
>
> 1. The aggregated sample dataset, ideally with substance detected, date, and
>    location at county or state level.
> 2. Any attribution wording you want displayed wherever results appear.
> 3. Whether there is a refresh cadence you'd prefer, or a feed we could pull
>    on a schedule you set.
> 4. Any use restrictions we should build in from the start.
>
> Happy to share the tool before launch, and to add whatever caveats you think
> are needed so results aren't over-read.
>
> Thank you for making this data available at all — it is the most current
> drug-checking source we have found in the US.
>
> [NAME]
> [TITLE], [AGENCY]
> [PHONE] · [OFFICIAL EMAIL]

---

## 2. TripSit

**To:** repo issue at `github.com/TripSit/drugs`, or the `#content` channel on their Discord
**Subject:** Permission and attribution — combination chart in a public health harm reduction tool

> Hello,
>
> I'm [NAME], [TITLE] with [AGENCY]. We've built a free public health tool for
> overdose prevention, and the most valuable thing in it is your combination
> chart — it is the only free, structured interaction matrix we found that
> actually covers the substances involved in overdose deaths. Clinical
> interaction databases omit exactly those combinations.
>
> We are using `combos.json`, `combo_definitions.json`, and the drug/category
> mapping from `drugs.json`, fetched from the repository rather than the API to
> avoid loading your rate-limited endpoint. The data is bundled and served
> statically, and we display a link back to your factsheets and a source note
> on every page that shows it, per the Factsheets wiki terms.
>
> Two things I'd like in writing, since the repository has no LICENSE file and
> `package.json` says ISC while the wiki states non-commercial:
>
> 1. Confirmation that use by a government public health agency — free, no
>    advertising, no sale — is within your intended terms.
> 2. The exact attribution wording you'd like, if what we have isn't right.
>
> If you'd rather we not use it, tell me and we'll remove it. And if a LICENSE
> file would help you field these requests, I'm glad to open a PR proposing one.
>
> [NAME]
> [TITLE], [AGENCY]

---

## 3. PsychonautWiki

**To:** the wiki's admin noticeboard or the maintainers' contact channel
**Subject:** License clarification — API output under CC BY 4.0 or CC BY-SA 4.0?

> Hello,
>
> I'm [NAME], [TITLE] with [AGENCY]. We use your API (`api.psychonautwiki.org`)
> to bundle dose, duration, tolerance, and interaction data into a free
> non-commercial public health tool for overdose prevention. We attribute
> PsychonautWiki, link the source article for each substance, and name the
> license.
>
> Your Copyrights page distinguishes site text and metadata (CC BY-SA 4.0) from
> "semantic data" (CC BY 4.0). It isn't clear to us which covers the API output
> — bifrost's documentation says it parses wikitext rather than reading the
> SemanticMediaWiki store, so we cannot tell from the outside.
>
> Could you confirm which applies? The practical difference is whether the JSON
> file we publish must itself carry ShareAlike. We currently assume CC BY-SA 4.0
> and license our derived file accordingly, which we're happy to keep doing — we
> would just rather be certain than assume.
>
> We exclude Experience Reports, images, and any Disregard Everything I Say
> material.
>
> [NAME]
> [TITLE], [AGENCY]

---

## 4. Erowid Center

**To:** via `https://www.drugsdata.org/contact.php` (their contact form — no
public address is exposed, and a widely-cited `info@drugsdata.org` is unverified)
**Subject:** Permission request — displaying DrugsData results in a public health harm reduction tool

> Hello,
>
> I'm [NAME], [TITLE] with [AGENCY]. We run a free, non-commercial county-level
> drug supply alert tool for overdose prevention.
>
> We are currently **linking to DrugsData only** — we have not copied, scraped,
> or stored any of your data, because your terms require written permission
> before republishing and we would rather ask first. Users searching a substance
> get a link through to your search page.
>
> I'd like to ask whether you would permit displaying a limited set of DrugsData
> results in context — specifically sample date, substance sold as, substances
> detected, and city/state of the source location — always credited to
> DrugsData/Erowid Center and always linked to the sample's page on your site.
> We would take whatever attribution and caveat wording you specify.
>
> If the answer is no, or not while the program is paused, that is completely
> understood and we'll continue linking only.
>
> Separately: thank you for keeping the archive public through the pause. Even
> as a historical record it is the best picture available of what was actually
> in the supply.
>
> [NAME]
> [TITLE], [AGENCY]

---

## Notes before sending

- **Send from an official address.** A `.gov` address is the single biggest
  factor in whether these get a reply.
- **Do not scrape anything while waiting.** Erowid, DrugsData, and
  streetsafe.supply all forbid automated collection, and all three are aware of
  it. Asking and being told no still leaves you able to link.
- **UNC is the one worth chasing.** DrugsData has been frozen since April 2024;
  UNC's dataset is current and covers 42 states. If only one of these gets
  answered, it should be that one.
- If TripSit declines, remove `data/combos.json` and the combination checker
  falls back to the PsychonautWiki per-substance interaction lists, which are
  CC BY-SA and need no permission.
