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
`src/adapters/` and registering it — see [docs/PROJECT.md](docs/PROJECT.md) for the design, the
step-by-step "Adding a New Site" guide, and the manual test checklist.

## How it works

1. Open a supported site and apply the filters you want (brands, price, rating, size, …).
2. Click the FilterKart toolbar icon (or the in-page **FilterKart** button).
3. Give the preset a name and click **Save**.
4. Later, on the same site — even for a *similar* search — open FilterKart and click **Apply**.
   FilterKart rebuilds the URL with your saved filters and navigates there.

Presets are stored in `chrome.storage.sync`, so they roam with your Chrome profile.
Applying to a *similar* search is handled by a pluggable similarity matcher
(`src/similarity/matcher.js`); e.g. "running shoes" and "sports shoes" are treated as the same
category. Matching is layered: exact canonical tokens, then **Jaro-Winkler** typo tolerance
(implemented in-repo, no dependencies) so "mobilsss" still matches "mobile", then an
**offline word-vector** layer (`src/similarity/vectors.js`, GloVe-50d, int8-quantized) so true
synonyms that share no letters — "sofa"/"couch", "tv"/"television" — match without a
hand-listed synonym table. All fully offline; no network calls or model downloads.

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
npm run package   # build a clean Web-Store zip (dist/filterkart.zip)
node scripts/e2e-check.js   # parse -> build -> parse round-trip on real URLs (all 7 sites)
```

### Layout

```
manifest.json             MV3 manifest (declares what Chrome loads)

src/                       everything the extension runs in the browser
  background.js            service worker: wires Chrome APIs to the message router
  core/                    app plumbing
    messaging.js           dependency-injected router (context/list/save/apply/delete/rename)
    storage.js             preset CRUD over chrome.storage.sync
    registry.js            adapter registry + URL resolution
  similarity/              search matching (self-contained: logic + its data)
    matcher.js             search normalizer + layered similarity (exact/fuzzy/semantic) ranking
    vectors.js             AUTO-GENERATED offline word vectors (GloVe-50d) for semantic matching
  adapters/*.js            per-site parse/build (flipkart, amazon, myntra, ajio, nykaa, meesho, croma)
  popup/*                  toolbar popup UI
  manager/*                full-page preset manager UI
  content/content.js       in-page floating button (style-isolated via shadow DOM)
  ui/                      shared theme + bundled fonts

icons/                     toolbar/store icons (png)

scripts/                   dev tooling — NOT shipped in the extension
  check.js                 "build": syntax-check all JS + validate manifest (npm run build)
  e2e-check.js             parse -> build -> parse round-trip on real URLs (npm run e2e)
  gen-icons.cjs            regenerate the icon PNGs (npm run icons)
  build-vectors.mjs        regenerate src/similarity/vectors.js from GloVe (run manually)
  package.mjs              build the clean Web-Store zip (npm run package)

test/*                     zero-dependency test harness + suites
docs/PROJECT.md            design, similarity, per-site findings, add-a-site guide, manual tests
dist/                      packaged zip output (git-ignored, created by npm run package)
```

## Verification

- `npm run verify` — unit tests covering storage, adapters, registry, matcher, and the
  message router.
- `node scripts/e2e-check.js` — captures filters from a real result URL on each site,
  rebuilds the URL, and confirms the filter set survives the round-trip (mirrors the
  save → apply flow).

> Note: automated "load unpacked" testing via Chrome command-line flags is not possible on
> recent Chrome stable builds (the `--load-extension` switch is disabled). Use the manual
> **Load unpacked** steps above to try it in a browser. See the **Manual Test Checklist** in
> [docs/PROJECT.md](docs/PROJECT.md) for the step-by-step flow.

## Scope

MVP saves and reapplies filter presets only. It does **not** compare prices, track price
drops, recommend or buy products, scrape, or manage carts/wishlists.
