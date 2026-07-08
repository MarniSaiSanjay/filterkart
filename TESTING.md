# FilterKart — Manual Test Checklist (WI-16)

Automated coverage (already green): `npm run verify` (41 unit tests) and
`node scripts/e2e-check.js` (parse → build → parse round-trip on real URLs for all
four sites). The steps below cover what automation can't reach here — the live
extension UI and authenticated, JS-rendered result pages.

> Why manual: this Chrome build blocks loading an unpacked extension via the
> command line, and live sites bot-block server-side requests, so the popup /
> in-page flows must be exercised in a real signed-in browser.

## Load the extension

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** → select the repo root (`FilterKart`).
4. Confirm the funnel icon appears in the toolbar and there are **no errors**
   listed on the extension card.

## Per-site flow (repeat for Flipkart, Amazon, Myntra, Ajio)

Sign in first if the site needs it.

1. Run a search (e.g. *laptop* / *running shoes*).
2. Apply a few filters through the site UI (brands, price, rating, size…).
3. Click the FilterKart toolbar icon.
   - [ ] Site badge + current search term shown correctly.
   - [ ] Filter count matches what you applied.
4. Name the preset and click **Save**.
   - [ ] Preset appears under "Matching presets".
5. Clear the filters (or open a *similar* search, e.g. *gaming laptop* /
   *sports shoes*).
6. Open the popup and click **Apply** on the saved preset.
   - [ ] Page navigates and the saved filters are re-applied.
   - [ ] For a similar search, filters apply to the *current* search term.
7. Open the in-page **FilterKart** button (bottom-right).
   - [ ] Save and Apply work the same way from there.
8. Try **rename** and **delete** from the popup.
   - [ ] Both update the list correctly.

## Site-specific things to watch

- **Flipkart** — brand values are double-encoded in the URL; confirm brands with
  spaces/`&` (e.g. "H&M") restore correctly.
- **Amazon (amazon.in)** — brand facets are numeric IDs in `rh=`; confirm price
  range restores.
- **Myntra** — the category is in the URL *path*; confirm applying to a different
  category page still restores brand/price.
- **Ajio** — filters live in the `query=:relevance:...` param; confirm sort isn't
  duplicated.

## If something breaks

Note the **live URL** after applying filters on the site, compare it to what
`adapter.parse` / `adapter.build` produce, and adjust the relevant
`src/adapters/<site>.js`. Re-run `npm run verify` before committing.
