# FilterKart — Implementation Plan

## Problem & Approach

Build a Manifest V3 browser extension that saves shopping-site filter presets and reapplies
them with one click. Filters are URL state, so **Save** captures `facet:value` pairs from the
current URL and **Apply** rebuilds the URL for the current (or a *similar*) search and navigates.

Stack: **plain JavaScript, no build step** (load-unpacked). Two extension seams keep it scalable:
per-site **adapters** and a pluggable **SimilarityProvider** (rule-based for MVP).

Full design lives in `PROJECT.md` (Finalized Architecture section).

## Process rules (from user)

- Track work as discrete **work items**; document them in `WORKITEMS.md` (repo).
- After **each** work item completes, update its status in `STATUS.md` (repo).
- `git init` the repo; commit after each reasonable code change.
- Commit messages: short, e.g. `added popup UI`; **no** co-author trailer, **no** long bodies.
- Notify the user once all work items are done.

## Target directory layout

```
FilterKart/
  manifest.json
  src/
    background.js            # service worker: storage + tab navigation + messaging
    popup/
      popup.html
      popup.js
      popup.css
    content/
      content.js             # optional in-page Save/Apply button
    core/
      storage.js             # chrome.storage.sync CRUD for presets
      registry.js            # adapter registry + resolve-by-url
      messaging.js           # dependency-injected message router
    similarity/
      matcher.js             # SearchNormalizer + layered SimilarityProvider
      vectors.js             # AUTO-GENERATED offline word vectors (GloVe-50d)
    adapters/
      base.js                # adapter shape/contract + shared helpers
      flipkart.js
      amazon.js
      myntra.js
      ajio.js
  icons/                     # extension icons
  WORKITEMS.md
  STATUS.md
  PROJECT.md                 # (exists) problem + findings + architecture
```

## Work Items

- **WI-01 — Repo & tracking setup:** `git init`, add `.gitignore`, create `WORKITEMS.md` and
  `STATUS.md`. Initial commit.
- **WI-02 — Manifest & skeleton:** `manifest.json` (MV3), folder skeleton, placeholder icons,
  background service worker registration. Load-unpacked sanity check.
- **WI-03 — Storage layer (`core/storage.js`):** preset CRUD on `chrome.storage.sync`
  (create/list/get/update/delete), preset schema, id generation.
- **WI-04 — Adapter contract + registry (`adapters/base.js`, `core/registry.js`):** define
  `{ id, matches, parse, build }`, resolve the adapter for a given URL.
- **WI-05 — Flipkart adapter:** parse/build `p[]=facets.<facet>[]=<value>` (+ `q=`).
- **WI-06 — Amazon adapter:** parse/build single `rh=` (facets comma-joined, values pipe-joined) (+ `k=`).
- **WI-07 — Myntra adapter:** parse/build `f=<Facet>:<v1>,<v2>::…` + `rf=Price:…` (category in path).
- **WI-08 — Ajio adapter:** parse/build `query=:relevance:<key>:<value>:…` (+ `text=`).
- **WI-09 — Matcher (`similarity/matcher.js`):** `SearchNormalizer` (lowercase, strip
  gender/plural/stopwords, synonym map) + layered `SimilarityProvider` (exact/fuzzy/semantic) behind
  a swappable interface.
- **WI-10 — Background worker (`background.js`):** message handlers for save/list/apply/delete;
  read active tab URL; navigate tab to built URL.
- **WI-11 — Popup UI (`popup/*`):** detect current site/search, "Save Filters" (+ name),
  list matching presets, "Apply", rename/delete.
- **WI-12 — Content script (optional):** in-page Save/Apply button on supported result pages.
- **WI-13 — Manual test pass & docs:** load-unpacked test on all four sites; add a short
  `README.md` (install + usage); final status update.

## Dependencies

- WI-02 depends on WI-01.
- WI-03, WI-04 depend on WI-02.
- WI-05..WI-08 (adapters) depend on WI-04.
- WI-09 depends on WI-02.
- WI-10 depends on WI-03, WI-04.
- WI-11 depends on WI-10, WI-03, WI-09 (and at least one adapter).
- WI-12 depends on WI-11.
- WI-13 depends on all.

## Notes / Considerations

- **Amazon brand values are numeric IDs** (`p_123:308445`). MVP stores the id as the value
  (works within a site); a friendly-name map can be added later.
- **Myntra category is in the URL path**, not a query param — the adapter's `build` swaps the
  path segment for cross-search apply; MVP may keep same category if path mapping is unknown.
- **"men" vs "boy/kids"** can be separate catalog sections — synonym map is tunable to control
  how loose matching is.
- No network/model calls in MVP; everything offline and private.
