# FilterCart

Save your shopping-site filter selections once and reapply them with a single click.

FilterCart is a Manifest V3 Chrome extension. Filters on the supported sites are fully
encoded in the page URL, so FilterCart works by **capturing the filter parameters from the
current URL** when you save, and **rebuilding the URL** for your current (or a similar) search
when you apply — no fragile DOM clicking.

## Supported sites

- Flipkart
- Amazon (amazon.in)
- Myntra
- Ajio

The architecture is adapter-based, so more sites can be added by dropping a new adapter into
`src/adapters/` and registering it — see [PROJECT.md](PROJECT.md) for the design.

## How it works

1. Open a supported site and apply the filters you want (brands, price, rating, size, …).
2. Click the FilterCart toolbar icon (or the in-page **FilterCart** button).
3. Give the preset a name and click **Save**.
4. Later, on the same site — even for a *similar* search — open FilterCart and click **Apply**.
   FilterCart rebuilds the URL with your saved filters and navigates there.

Presets are stored in `chrome.storage.sync`, so they roam with your Chrome profile.
Applying to a *similar* search is handled by a pluggable similarity matcher
(`src/core/matcher.js`); e.g. "running shoes" and "sports shoes" are treated as the same
category.

## Install (Load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this project folder.
4. The FilterCart icon appears in the toolbar.

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
src/adapters/*.js      per-site parse/build (flipkart, amazon, myntra, ajio)
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
> **Load unpacked** steps above to try it in a browser. See [TESTING.md](TESTING.md) for a
> step-by-step manual test checklist.

## Scope

MVP saves and reapplies filter presets only. It does **not** compare prices, track price
drops, recommend or buy products, scrape, or manage carts/wishlists.
