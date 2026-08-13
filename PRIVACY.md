# Privacy architecture

The people this tool is built for can be arrested, evicted, fired, deported, or
lose custody of their children because of what they look up here. Several are
looking things up *about someone else* and do not want that person to know.
Privacy is therefore a safety feature, not a compliance checkbox, and it is
allowed to cost us performance and engineering convenience.

The design goal is blunt:

> **A server log, a network capture, and a subpoena to the host should all
> reveal the same thing: that someone loaded the site. Nothing about which
> county they checked, which drug they looked up, or whether they use drugs.**

---

## 1. The lookup never touches the network

This is the decision everything else follows from.

The obvious way to build this is `GET /data/counties/47065.json` when a user
opens Hamilton County. That is a disaster: the host's access log now contains
`IP 10.x.x.x → 47065`, timestamped. Static hosts log by default, the operator
cannot turn it off on GitHub Pages, and those logs are subpoenable.

So instead **every dataset is bundled and every query runs locally**:

| Data | Delivery |
|---|---|
| County alerts | one national bundle, `data/alerts.json` |
| County gazetteer + adjacency | bundled, `counties.json` / `adjacency.json` |
| County boundaries (Near me) | bundled, `county-shapes.json` |
| Substance info (dose, duration, interactions) | bundled at build time |
| Drug-checking lab results | bundled at build time |

Every request the browser makes is identical for every user, regardless of what
they are looking for. Selecting a county, searching a substance, and reading an
interaction warning generate **zero** network traffic.

The cost is a larger first load. That is the right trade, and it buys offline
support - which matters independently, because rural users and users without
steady data plans are exactly the population with the worst overdose outcomes.

**Sharding rule.** If `alerts.json` exceeds ~600 KB gzipped, shard by *region*
(multi-state groups), never by county. A region reveals far less than a county,
and county-level sharding reintroduces the exact leak this design removes.

## 2. No third party is contacted, ever

No fonts, no analytics, no CDN, no map tiles, no embedded media, no error
reporting. The site is enforced closed with a Content-Security-Policy that
permits `'self'` only, so a future contributor cannot casually reintroduce a
Google Fonts tag - the browser will block it.

This is why the UI ships a system font stack instead of the webfont the original
design used. A font request tells Google the IP address of everyone who opens a
drug-alert page.

Live third-party APIs are banned in the client for the same reason. Querying
PsychonautWiki from the browser would hand that server a request meaning "this
IP is researching fentanyl". All such data is fetched **server-side during the
build**, by GitHub Actions, and committed as static JSON.

## 3. Nothing identifying leaves in a URL

- County and substance live in the URL **fragment** (`#/47065`). Fragments are
  never transmitted to the server.
- `<meta name="referrer" content="no-referrer">`, and every outbound link
  carries `rel="noopener noreferrer"` and `referrerpolicy="no-referrer"`, so a
  news site or health department never learns a reader arrived from here.
- No query strings are used for anything user-selected.

## 4. Nothing survives the session

No cookies. No localStorage. No IndexedDB. Nothing is written to disk, and
nothing outlives the tab.

`sessionStorage` is used, and it is worth being exact about what is in it,
because "we store nothing" would be a lie:

| Key | Written when | Holds |
| --- | --- | --- |
| `sc.seen` | every boot, automatically | an ISO timestamp of this visit, so the welcome card does not reappear on every navigation and so "new since you last looked" has something to measure against |
| `ss.theme` | you pick a theme | `light` or `dark` |
| `ss.lang` | never, currently | a language code. `setLocale()` exists; nothing calls it, because there is deliberately no language switcher - the locale comes from the browser |

None of these records a county, a substance, a page, or a search. The visit
stamp is a clock reading; it does not say what was read. There is deliberately
no "last county viewed", because that single key is the one that would put a
county in a place someone else could find.

They are cleared two ways: by the Quick Exit control, and by a `pagehide` wipe
when the tab closes or navigates away. `sessionStorage` is already per-tab and
dies with the tab regardless - the explicit wipes exist because a shared or
seized device is a realistic threat here and "the browser will get to it
eventually" is not good enough.

The boot sweep in `app.js` is a separate mechanism and clears **Cache Storage**,
not `sessionStorage` - a session that was force-quit can leave cached responses
behind, and those are wiped before the service worker can serve one.

## 5. Quick Exit

A persistent control in the header that, in one tap:

1. wipes localStorage, sessionStorage, and Cache Storage,
2. replaces the current history entry so **Back does not return here**, and
3. navigates to a neutral, unremarkable site.

This is standard practice on domestic-violence resources and it belongs here for
the same reason: the threat is often in the same room.

**Residual risk we cannot fix:** entries already written to browser history
before Quick Exit, and the browser's own HTTP cache. The UI says so plainly and
suggests private/incognito browsing, rather than implying a guarantee it cannot
make.

## 6. Location never leaves the device

"Near me" resolves coordinates to a county by running point-in-polygon against
bundled boundary data, in the browser. No geocoding service is contacted. There
is no API key, no rate limit, and no third party that could log a coordinate.
The UI states this at the point of use, because "share your location" is exactly
the prompt this audience is right to refuse.

## 7. No PII in the pipeline

Inherited from the ingest rules and enforced upstream of the UI: no names, no
addresses, no identifying details of individuals, and no location precision
below county level - no streets, no blocks, no venues - even when a source
publishes them.

---

## Verifying it

```bash
node test/privacy.test.mjs
```

The test suite fails the build if any file under `site/` references an external
origin, if the CSP is missing or weakened, or if a storage API is called outside
the three modules listed in §4. Reviewing a diff is not a reliable way to catch
a reintroduced tracker; a test is.

Manually, in DevTools → Network, with the site loaded: select a county, search a
substance, open an interaction warning. The request count must not increase.

---

*Last reviewed against the shipping code on 2026-08-13. This document is a
claim about behaviour, so it goes stale the way code does. If you change what
is fetched, what is stored, or the CSP, this file is part of the change.*
