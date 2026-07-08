# FilterCart — Shopping Filter Saver Browser Extension

## Problem

On e-commerce sites (Amazon, Flipkart, Myntra, Ajio, Croma, Reliance Digital, …), users
re-apply the same combination of filters on every visit — brands, price range, RAM, storage,
processor, rating, delivery options, size, color, and more.

This is repetitive busywork, made worse when:

- a site has hundreds of brands,
- desired options are spread across long lists,
- filters are hidden behind "Show More" dialogs,
- users compare products across several shopping sites.

The repeated effort adds no value.

## Goal

A browser extension that **remembers a user's preferred shopping filters** and restores them
automatically or with a single click when they revisit a site.

## User Workflow

1. Open a supported shopping site.
2. Manually select the desired filters.
3. Click **Save Filters**.
4. Name the preset.
5. The extension stores the selected filter values.
6. Later, on the same site / category, click **Apply Filters**.
7. The extension reapplies all saved filters in one click.

## Scope (MVP)

- Shopping / e-commerce sites only.
- Initial targets: Amazon, Flipkart, Myntra, Ajio, Croma, Reliance Digital.
- **Extensible architecture** so new sites can be added cleanly (per-site adapters), since each
  site has its own UI, DOM structure, loading behavior, and URL scheme. This is the core
  engineering challenge.

## Out of Scope (MVP)

- Price comparison across sites
- Price-drop tracking
- Product recommendations
- Automatic purchasing
- Scraping / analytics
- Wishlists / carts
- Arbitrary non-shopping sites

## Success Criteria

A user should never have to repeatedly select the same shopping filters again. Once saved, a
filter configuration is restorable with minimal effort — fast, consistent, and frustration-free.

---

# Architecture Decision

**Approach: URL / query-param based reapply** (chosen over brittle DOM checkbox automation).

These sites encode applied filters in the page URL. So:

- **Save** = capture the current filtered URL (the ordered `q` search term + filter params).
- **Apply** = navigate to the saved URL. Optionally swap the search term to reuse the same
  filter preset for a different query.

This is reliable and extensible: adding a site means adding one **adapter** that knows how that
site encodes filters in its URL — no changes to the core extension.

---

# Finalized Architecture (MVP)

**Principle:** filters are URL state. **Save** = capture the `facet:value` pairs from the current
URL. **Apply** = rebuild the URL for the current (or a *similar*) search and navigate the tab.

### Decisions

1. **Apply behavior:** same site + **similar** search term (not just exact). E.g. "men shoes",
   "shoes", "shoes men", "shoes boy", "footwear boy" are treated as the same category.
2. **Filter storage:** normalized/portable `facet:value` pairs (not raw URL replay), so a preset
   can be reapplied to a different search. Filter *values* are stable across searches within a
   site (Nike is Nike whether searching "shoes" or "footwear"); only the search term/category
   changes.
3. **Similarity matching:** rule-based now (offline, free, private); model-based provider is a
   pluggable upgrade for later — no core changes required.

### Component diagram

```
popup UI ──msgs──► background worker ──► storage (chrome.storage.sync)
   │                     │
   │                     ├─► adapter registry   (1 file per site → scalable)
   │                     │     flipkart · amazon · myntra · ajio
   │                     │       matches(url) / parse(url) / build(search, filters)
   │                     │
   │                     └─► matcher
   │                           SearchNormalizer + SimilarityProvider
   │                           (rule-based default, pluggable model later)
   └─ content script (optional in-page Save/Apply button)
```

### Two extension points (add a site or a smarter matcher without touching the core)

**1. Site adapter** — one file per site:

```js
{
  id: "amazon",
  matches(url),                       // is this a supported results page?
  parse(url)  -> { search, filters }, // pull filters out of rh= / f= / p[] / query=
  build(search, filters) -> newUrl,   // inject filters into a (possibly new) search
}
```

**2. SimilarityProvider** — decides which presets to offer for the current page:

```js
{
  normalize(searchTerm) -> canonical,        // lowercase, strip gender/plural/stopwords, synonyms
  similarity(a, b)      -> score 0..1,       // token overlap (rule-based) or model later
}
```

### Preset schema (normalized, portable)

```js
{
  id, name,
  siteId,               // "amazon" | "flipkart" | "myntra" | "ajio"
  canonicalCategory,    // normalized search category, for similarity matching
  search,               // original search term at save time
  filters: [ { facet, value } ],
  createdAt,
}
```

### Flows

- **Save:** active tab URL → `adapter.parse` → `normalize(search)` → persist preset.
- **Apply:** for current page, matcher finds presets whose `canonicalCategory` is similar to the
  current search → user picks one → `adapter.build(currentSearch, filters)` → navigate tab.

### MVP scope

- Sites: Flipkart, Amazon, Myntra, Ajio.
- One-click apply from the popup.
- Rule-based similarity; fully offline; no backend, no API keys.
- Manifest V3.

### Rule-based matcher — layers

- **Layer 1 (MVP):** `lowercase → strip gender/plural/stopwords → synonym map → token overlap`.
  Free, offline, private; handles the "men shoes / footwear boy" family.
- **Layer 2 (later):** swap in an embedding/LLM `SimilarityProvider` behind the same interface.

> Nuance to revisit: "men" vs "boy/kids" are sometimes separate catalog sections on these sites;
> the synonym map lets us tune how loose the matching is.

---

# Findings

## Cross-site summary

All four sites inspected so far encode applied filters **entirely in the URL** — confirming the
URL/param-based approach works universally. Only the encoding differs per site:

| Site     | Search term        | Filter encoding                                            |
| -------- | ------------------ | ---------------------------------------------------------- |
| Flipkart | `q=`               | repeated `p[]=facets.<facet>[]=<value>` params             |
| Amazon   | `k=`               | single `rh=` param; facets comma-joined, values pipe-joined |
| Myntra   | path (e.g. `/sports-shoes`) | `f=<Facet>:<v1>,<v2>::<Facet2>:…` + `rf=Price:…`    |
| Ajio     | `text=` **or** `/s/rd-<term>-<ids>` path slug | `query=:relevance:<key>:<value>:<key>:<value>…`            |

Adapter takeaway: each adapter just needs to (a) recognise the site's result URL and (b) know
how to read/merge its filter param(s). No DOM automation required for any of these.

## Flipkart — verified live (2026-07-07)

Every applied filter is stored **in the URL** as a repeated `p[]` parameter:

```
https://www.flipkart.com/search?q=laptop
  &p[]=facets.processor[]=7c Gen 2
  &p[]=facets.brand[]=Lenovo
  &p[]=facets.rating[]=4★ & above
```

Raw (browser-encoded) form — note the double encoding of the inner `[]`:

```
https://www.flipkart.com/search?q=laptop&p%5B%5D=facets.brand%255B%255D%3DLenovo&p%5B%5D=facets.rating%255B%255D%3D4%E2%98%85%20%26%20above
```

**Pattern:** `p[]=facets.<facetName>[]=<value>` — one `p[]` param per selected value; multiple
selections accumulate as multiple `p[]` params.

**DOM:** filters are `input[type=checkbox]` inside labeled sections (Brand, Processor, SSD
Capacity, Price, Storage Type, Ratings, …). ~37 options visible initially, more behind
"Show More". Selecting a checkbox updates the URL via client-side JS (no anchor `href`s).

**Verification:** a hand-built URL with two filters (brand `Lenovo` + rating `4★ & above`) was
navigated to directly; the page loaded with **both chips applied** ("Lenovo", "4★ & above",
"Clear all") and results were all Lenovo laptops. ✅ This confirms URL-based save/reapply works
for Flipkart with no DOM clicking required.

## Amazon — verified live (2026-07-07)

All applied filters live in the single **`rh=`** query parameter. Facets are comma-separated;
values within one facet are pipe-separated (`|`). Search term is `k=`.

```
https://www.amazon.in/s?k=laptop&rh=p_123:308445|391242,p_36:2850000-6100000
```

**Facet keys observed:**

| Facet         | Key       | Value format                                  |
| ------------- | --------- | --------------------------------------------- |
| Brand         | `p_123`   | numeric brand id (e.g. `308445`=HP, `391242`=Lenovo) |
| Price         | `p_36`    | range in paise: `<min>-<max>`, e.g. `2850000-6100000` = ₹28,500–₹61,000; `-2850000` = up to |
| Free shipping | `p_n_free_shipping_eligible` | numeric id |

- Filters render as anchor `href`s in the left rail (easy to read).
- Multiple values in one facet: `p_123:308445|391242` (HP OR Lenovo).
- Multiple facets: comma-joined inside `rh=`.

**Verification:** navigated to `rh=p_123:308445|391242,p_36:2850000-6100000`; page loaded with
HP + Lenovo + the price band applied ("Clear", "HP", "Lenovo" chips shown). ✅

## Myntra — verified live (2026-07-07)

Filters use the **`f=`** param; price range uses **`rf=`**. Facets are joined by `::`; values
within a facet are comma-separated. Category/search is part of the path (e.g. `/sports-shoes`).

```
https://www.myntra.com/sports-shoes?f=Brand:Nike,Puma,ADIDAS
https://www.myntra.com/fwdgenzcollection?f=Categories:Dresses::Gender:men women,women&rf=Price:0.0_600.0_0.0 TO 600.0
```

**Format:**

- `f=<Facet>:<v1>,<v2>::<Facet2>:<v1>` — facets separated by `::`, values by `,`.
- `rf=Price:<min>.0_<max>.0_<min>.0 TO <max>.0` for price ranges.

**Verification:** navigated to `?f=Brand:Nike,Puma,ADIDAS`; all three brand chips applied
("CLEAR ALL", "Nike", "Puma", "Adidas"). ✅

## Ajio — verified live (2026-07-07)

All filters are encoded inside the **`query=`** param as colon-separated `key:value` pairs,
prefixed with `:relevance`. Search term is a separate `text=` param. `classifier` and
`gridColumns` are cosmetic.

```
https://www.ajio.com/search/?query=:relevance:genderfilter:Women:genderfilter:Men&text=running shoes
```

**Format:**

- `query=:relevance:<facetKey>:<value>[:<facetKey>:<value> …]`
- Each selected value is its own `:<facetKey>:<value>` pair; multiple values of the same facet
  repeat the key (e.g. `:genderfilter:Women:genderfilter:Men`).
- Facet keys observed: `genderfilter` (brand facet key is `brand`, colour `colourfilter`, etc.).

**Verification:** clicking facets appended pairs to `query=`; a second selection produced
`:relevance:genderfilter:Women:genderfilter:Men`, confirming accumulation. ✅

**Update — live re-check (2026-07-08):** Ajio now **redirects** `/search/?text=<term>` to
`/s/rd-<term>-<ids>?query=:relevance:<facets>` (e.g. `/s/rd-shoes-5488-78681`). The search
term moved into the **path slug** and there is no `text=` param on the results page. The
`query=` facet encoding is unchanged. The adapter was updated to (a) match the `/s/` path and
(b) read the search term from the slug. Apply still uses `/search/?text=&query=` — verified live
that Ajio preserves the facets through the redirect. ✅

## Croma / Reliance Digital — not yet inspected

To be verified live.

---

# Notes / Tooling

- Live inspection done by driving a real Chrome via CDP (remote debugging port `9222`) with
  Playwright (`playwright-core`), using a dedicated profile so login state can persist.
- Inspection scripts live in `scripts/` (`inspect.js`, `dom.js`, `click.js`, `verify.js`).
