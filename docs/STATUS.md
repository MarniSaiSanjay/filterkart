# FilterKart — Status

Updated after each work item completes.

| ID    | Work Item                          | Status       |
| ----- | ---------------------------------- | ------------ |
| WI-01 | Repo & tracking setup              | Done         |
| WI-02 | Manifest & skeleton                | Done         |
| WI-03 | Storage layer                      | Done         |
| WI-04 | Adapter contract + registry        | Done         |
| WI-05 | Flipkart adapter                   | Done         |
| WI-06 | Amazon adapter                     | Done         |
| WI-07 | Myntra adapter                     | Done         |
| WI-08 | Ajio adapter                       | Done         |
| WI-09 | Matcher                            | Done         |
| WI-10 | Background worker                  | Done         |
| WI-11 | Popup UI                           | Done         |
| WI-12 | Content script                     | Done         |
| WI-13 | Manual test pass & docs            | Done         |
| WI-14 | Trim unused scripting permission   | Done         |
| WI-15 | Real extension icons               | Done         |
| WI-16 | Live validation (4 sites)          | Done         |
| WI-17 | Nykaa adapter                      | Done         |
| WI-18 | Meesho adapter                     | Done         |
| WI-19 | Croma adapter                      | Done         |
| WI-20 | Manager UX polish                  | Done         |
| WI-21 | Docs reorg into `docs/`            | Done         |

## Live validation (WI-16)

Validated all four adapters against **today's live pages** by driving Chrome,
applying a real filter on each site, capturing the URL the site generates, and
confirming our `parse` → `build` → `parse` round-trip matches:

- **Amazon** ✅ — live brand link `rh=p_123:308445`; tracking params ignored.
- **Flipkart** ✅ — live processor facet `Core i5`; double-encoding handled.
- **Myntra** ✅ — live `Brand:Seekbuylove`; path-based category preserved.
- **Ajio** ✅ (after fix) — see below.

## Later adapters (WI-17 – WI-19)

Three more sites onboarded after the initial four, taking coverage to **7 sites**:

- **Nykaa** ✅ (WI-17) — `<Facet>=<value>` query params; category/brand path
  preserved via `meta.path`.
- **Meesho** ✅ (WI-18) — filters encode as an opaque triple per value
  (`<Facet>[i][id]`, `[label]`, `[payload]` where payload = base64(`{field,op,value}`)).
  The `field` is facet-specific and not derivable, so the adapter uses **verbatim
  replay** — it stores the `id` + `payload` on each filter and re-emits all three
  parts. **Live-verified end-to-end** in Chrome (Gender → Women applied correctly).
- **Croma** ✅ (WI-19) — SAP Hybris single `q` colon-chain
  (`<term>:<sort>:<facet>:<value>:…`); `/searchB` search pages carry a duplicate
  `text=` term, `/<slug>/c/<id>` category/campaign pages carry an empty term with
  the path preserved in `meta.path`. Croma **bot-walls automated browsers** (serves
  an empty SPA shell), so live capture is impossible — the adapter was built from
  the user's **real captured URLs** and validated by reproducing them
  **byte-for-byte** through `build()`.

## Manager UX polish (WI-20)

Full-tab preset library with: inline rename / delete, preset-card hover lift,
per-section site logos (Google S2 favicon service with monogram fallback),
sidebar sites **ordered by preset count** (most-used first), brand-logo cleanup
(no background tile, larger icon), and a small sidebar footer (version + site
count + copyright).

## Docs reorg (WI-21)

`ONBOARDING`, `PLAN`, `PROJECT`, `STATUS`, `TESTING`, and `WORKITEMS` moved under
`docs/`; `README.md` stays at the repo root as the entry point.

### Ajio URL drift (fixed)

Ajio's `/search/?text=<term>` now **redirects** to
`/s/rd-<term>-<ids>?query=:relevance:<facets>`. The search term moved into the
path slug and there is no `text=` param. Fixes in `src/adapters/ajio.js`:

- `matches()` now also accepts the `/s/` results path.
- `parse()` extracts the search term from the `/s/rd-<slug>-<ids>` path when
  `text=` is absent.
- `build()` unchanged — verified live that `/search/?text=&query=` preserves the
  facets through Ajio's redirect, so Apply still works.

## Verification

- `npm test`: 56/56 unit tests pass (storage, adapters, registry, matcher, messaging) —
  includes parse → build → parse round-trip tests for all **7** adapters.
- `node scripts/e2e-check.js`: ad-hoc round-trip sanity check for the first four
  sites (Flipkart, Amazon, Myntra, Ajio).
- Live adapter validation against real pages passed for Amazon, Flipkart, Myntra,
  Ajio, Nykaa, and Meesho. Croma is bot-walled, so it was validated by a
  byte-for-byte `build()` match against the user's real captured URLs (see above).
- The extension loads cleanly via **Load unpacked** (user-confirmed: no errors, icon shows).
  Fully automated load-unpacked isn't possible on this Chrome build (the
  `--load-extension` switch is disabled); the interactive popup/in-page flows are
  covered by the manual checklist in **TESTING.md**.

All 21 work items complete. **7 sites supported.**
