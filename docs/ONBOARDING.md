# Onboarding a New Shopping Site

Onboarding new sites is the **core design goal** of FilterKart. The architecture is
deliberately pluggable: adding a site is a self-contained **adapter** plus a few registrations —
**no core logic changes**. An adapter teaches FilterKart how one shopping site encodes its
filters in the URL (`src/adapters/base.js:1-3`).

---

## The 5 spots you touch

### 1. Create `src/adapters/<site>.js`

A plain object implementing the adapter contract (`src/adapters/base.js`):

| Member | Purpose |
| --- | --- |
| `id` | stable site id, e.g. `"nykaa"` |
| `label` | human name, e.g. `"Nykaa"` |
| `host(url)` | is this the site's domain? (hostname-only regex) |
| `matches(url)` | is this a **search-results** page? usually `this.host(url) && <path check>` |
| `parse(url)` | `{ search, filters: [{facet, value}], meta? }` — pull search term + filters out of the URL |
| `build(baseUrl, search, filters, meta?)` | reconstruct a results URL from a saved preset |

- `filters` is **always** an array of `{ facet, value }` pairs. Use the shared
  `dedupeFilters()` / `toURL()` helpers from `base.js`.
- `host()` powers the site-aware "You're on X — run a search" hint on non-results pages.
- **`meta` is optional** (added for Nykaa). Use it only when the results URL contains
  identity that **cannot be derived** from the search term — e.g. Nykaa's category path
  `/makeup/lips/c/15` has a numeric id you can't reconstruct from `"lips"`. `parse` stashes it
  in `meta`, `build` reads it back, and it is persisted with the preset. Sites whose path *is*
  the slug (like Myntra) don't need `meta` — they rebuild the path from `search`.

### 2. Register it — `src/core/registry.js`

Import the adapter and add it to the `ADAPTERS` array (top of file). `validateAdapter` runs
automatically. Nothing else in registry changes.

### 3. Add `SITE_ROOTS[id]` — `src/core/messaging.js`

The base results URL used for **Apply** (from a non-shopping tab) and the manager's **Open**
button, e.g. `nykaa: "https://www.nykaa.com/search/result/"`. This is also where the sidebar
logo host is derived from — so it is **required**.

### 4. Add the host to `manifest.json`

Add the match pattern in **both** places:
- `host_permissions`
- `content_scripts[].matches`

e.g. `"*://*.nykaa.com/*"`.

### 5. Add a round-trip test — `test/adapters.test.js`

Test `parse` and `build` against a **real, live-captured URL** (see workflow below). Assert:
- `parse` extracts the expected `search` + `filters` (+ `meta` if used),
- `build(...)` → `parse(...)` round-trips to the same values.

If you changed the adapter count, update the `ADAPTERS.length` assertion in
`test/registry.test.js`.

---

## Everything else is automatic

- **Sidebar site logo** — derived from `SITE_ROOTS` host via the Google S2 favicon service
  (`icons.google.com/s2/...`), with a coloured-monogram fallback. Zero extra work.
- **Matching, match-gauge, save/apply, rename, inline delete, site-aware hints** — all
  adapter-agnostic.
- **Storage** — same `chrome.storage.sync` `"presets"` array; `siteId` tags which adapter owns
  each preset. `meta` (if any) is persisted alongside.

---

## How to capture a site's real URL encoding (do this first)

Don't guess the URL scheme — **web search and raw fetches are unreliable** (sites like Nykaa
return `403` to non-browser requests and SPAs render filters via JS, not anchor hrefs). Drive
real Chrome and observe how the address bar changes as you click filters:

1. Temporarily install Playwright: `npm install --no-save playwright-core`
   (it gets removed on cleanup, so reinstall each session).
2. Launch real Chrome (not headless is easiest for login/observation):
   `executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`.
3. Navigate to a search, apply **one** filter, read `page.url()`. Then apply a **second** value
   of the same facet and a value of a **different** facet, reading the URL each time. This
   reveals:
   - the param name(s) per facet,
   - the **multi-value** encoding (comma? pipe? repeated param? colon-joined path segment?),
   - whether the search term lives in a query param or the **path**,
   - whether the site **redirects** search → a category/path page (Nykaa does).
4. Write the captured URL into the adapter's test as the ground-truth fixture.
5. **Verify end-to-end**: navigate Chrome to a URL your `build()` produces and confirm the
   filters show as *checked/active* on the live site.
6. Clean up: delete the temp probe scripts and `npm uninstall --no-save playwright-core`.

> PowerShell has no heredoc. Write probe scripts to a temp `*.cjs` file (the repo is
> `"type": "module"`, so use `.cjs` for `require`) and run with `node file.cjs`.

### Known per-site encodings (reference)

| Site | Search term | Filter encoding | Needs `meta`? |
| --- | --- | --- | --- |
| Flipkart | `q=` param | repeated `p[]=facets.<facet>[]=<value>` | no |
| Amazon | `k=` param | single `rh=`; facets comma-sep, values pipe-sep | no |
| Myntra | path slug (`/sports-shoes`) | `f=<facet>:<v,v>::…`, ranges in `rf=` | no (path = slug) |
| Ajio | `text=` or `/s/rd-<slug>-<ids>` path | `query=:relevance:<facet>:<value>…` | no |
| Nykaa | redirects to `/…/c/<id>`; slug → search | `<facet>_filter=<v,v>` params | **yes** (`meta.path`) |

---

## Final checklist

- [ ] `src/adapters/<site>.js` created (`id, label, host, matches, parse, build`)
- [ ] Added to `ADAPTERS` in `src/core/registry.js`
- [ ] `SITE_ROOTS[id]` added in `src/core/messaging.js`
- [ ] Host added to `manifest.json` (`host_permissions` **and** `content_scripts.matches`)
- [ ] Round-trip test in `test/adapters.test.js` against a real captured URL
- [ ] `ADAPTERS.length` assertion updated in `test/registry.test.js` if needed
- [ ] `npm run build` clean, `npm test` all green
- [ ] Live-verified: a `build()` URL applies the filters on the real site
