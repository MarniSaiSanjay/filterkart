# FilterKart

Save your shopping-site filter selections once and reapply them with a single click.

FilterKart is a Manifest V3 Chrome extension. Filters on the supported sites are fully
encoded in the page URL, so FilterKart works by **capturing the filter parameters from the
current URL** when you save, and **rebuilding the URL** for your current (or a similar) search
when you apply — no fragile DOM clicking.

## Supported sites

- Flipkart
- Amazon (amazon.in)
- Myntra
- Ajio
- Nykaa
- Meesho
- Croma

The architecture is adapter-based, so more sites can be added by dropping a new adapter into
`src/adapters/` and registering it — see [docs/ONBOARDING.md](docs/ONBOARDING.md) for the step-by-step
guide and [docs/PROJECT.md](docs/PROJECT.md) for the design.

## How it works

1. Open a supported site and apply the filters you want (brands, price, rating, size, …).
2. Click the FilterKart toolbar icon (or the in-page **FilterKart** button).
3. Give the preset a name and click **Save**.
4. Later, on the same site — even for a *similar* search — open FilterKart and click **Apply**.
   FilterKart rebuilds the URL with your saved filters and navigates there.

Presets are stored in `chrome.storage.sync`, so they roam with your Chrome profile.
Applying to a *similar* search is handled by a pluggable similarity matcher
(`src/core/matcher.js`); e.g. "running shoes" and "sports shoes" are treated as the same
category. Typo tolerance uses the **Jaro-Winkler** string-similarity algorithm
(implemented in-repo, no dependencies) so "mobilsss" still matches "mobile".

## Install (Load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this project folder.
4. The FilterKart icon appears in the toolbar.

## Development

Plain JavaScript, no build step or runtime dependencies.

```
npm run build     # syntax-check all JS + validate manifest.json
npm test          # run the unit-test suite
npm run verify    # build + test (run before every commit)
node scripts/e2e-check.js   # parse -> build -> parse round-trip on real URLs (all 4 sites)
```

### Layout

```
manifest.json          MV3 manifest
src/background.js       service worker: wires Chrome APIs to the message router
src/core/messaging.js  dependency-injected router (context/list/save/apply/delete/rename)
src/core/storage.js    preset CRUD over chrome.storage.sync
src/core/registry.js   adapter registry + URL resolution
src/core/matcher.js    search normalizer + similarity ranking
src/adapters/*.js      per-site parse/build (flipkart, amazon, myntra, ajio, nykaa, meesho, croma)
src/popup/*            toolbar popup UI
src/content/content.js in-page floating button (style-isolated via shadow DOM)
test/*                 zero-dependency test harness + suites
```

## Verification

- `npm run verify` — 40 unit tests covering storage, adapters, registry, matcher, and the
  message router.
- `node scripts/e2e-check.js` — captures filters from a real result URL on each of the four
  sites, rebuilds the URL, and confirms the filter set survives the round-trip (mirrors the
  save → apply flow).

> Note: automated "load unpacked" testing via Chrome command-line flags is not possible on
> recent Chrome stable builds (the `--load-extension` switch is disabled). Use the manual
> **Load unpacked** steps above to try it in a browser. See [docs/TESTING.md](docs/TESTING.md) for a
> step-by-step manual test checklist.

## Scope

MVP saves and reapplies filter presets only. It does **not** compare prices, track price
drops, recommend or buy products, scrape, or manage carts/wishlists.
