# FilterCart — Status

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

## Live validation (WI-16)

Validated all four adapters against **today's live pages** by driving Chrome,
applying a real filter on each site, capturing the URL the site generates, and
confirming our `parse` → `build` → `parse` round-trip matches:

- **Amazon** ✅ — live brand link `rh=p_123:308445`; tracking params ignored.
- **Flipkart** ✅ — live processor facet `Core i5`; double-encoding handled.
- **Myntra** ✅ — live `Brand:Seekbuylove`; path-based category preserved.
- **Ajio** ✅ (after fix) — see below.

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

- `npm run verify`: 43/43 unit tests pass (storage, adapters, registry, matcher, messaging).
- `node scripts/e2e-check.js`: parse → build → parse round-trip passes for all four sites.
- Live adapter validation against real pages passed for all four sites (see above).
- The extension loads cleanly via **Load unpacked** (user-confirmed: no errors, icon shows).
  Fully automated load-unpacked isn't possible on this Chrome build (the
  `--load-extension` switch is disabled); the interactive popup/in-page flows are
  covered by the manual checklist in **TESTING.md**.

All 16 work items complete.
