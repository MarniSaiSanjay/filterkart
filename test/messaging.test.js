import { setFile, test, assert, assertEqual } from "./harness.js";
import { mockStore } from "./mock-store.js";
import { createRouter } from "../src/core/messaging.js";
import * as storage from "../src/core/storage.js";
import { resolveAdapter, getAdapterById } from "../src/core/registry.js";
import { normalize, rankPresets } from "../src/core/matcher.js";

setFile("messaging");

// Build a router backed by an in-memory store and a fake active tab.
function makeRouter({ url } = {}) {
  const store = mockStore();
  const navigations = [];
  const tab = { id: 7, url };
  const deps = {
    listPresets: () => storage.listPresets(store),
    createPreset: (p) => storage.createPreset(p, store),
    deletePreset: (id) => storage.deletePreset(id, store),
    updatePreset: (id, patch) => storage.updatePreset(id, patch, store),
    getPreset: (id) => storage.getPreset(id, store),
    resolveAdapter,
    getAdapterById,
    normalize,
    rankPresets,
    getActiveTab: async () => tab,
    navigateTab: async (id, u) => navigations.push({ id, url: u }),
  };
  return { route: createRouter(deps), navigations, store, tab };
}

const AMAZON_URL =
  "https://www.amazon.in/s?k=laptop&rh=" + encodeURIComponent("p_123:308445,p_36:2850000-6100000");

test("context reports supported site with parsed filters", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  const ctx = await route({ type: "context" });
  assertEqual(ctx.supported, true);
  assertEqual(ctx.siteId, "amazon");
  assertEqual(ctx.search, "laptop");
  assertEqual(ctx.filters.length, 2);
});

test("context reports unsupported for unknown site", async () => {
  const { route } = makeRouter({ url: "https://www.example.com/x" });
  const ctx = await route({ type: "context" });
  assertEqual(ctx.supported, false);
});

test("save stores a preset parsed from the active tab", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  const { preset } = await route({ type: "save", name: "My Laptops" });
  assertEqual(preset.siteId, "amazon");
  assertEqual(preset.name, "My Laptops");
  assertEqual(preset.filters.length, 2);
  assertEqual(preset.canonicalCategory, "laptop");
});

test("save fails when no filters are applied", async () => {
  const { route } = makeRouter({ url: "https://www.amazon.in/s?k=laptop" });
  let threw = false;
  try {
    await route({ type: "save", name: "x" });
  } catch {
    threw = true;
  }
  assert(threw, "should refuse to save with no filters");
});

test("list returns matched presets for the current search", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  await route({ type: "save", name: "Laptops preset" });
  const res = await route({ type: "list" });
  assertEqual(res.context.siteId, "amazon");
  assertEqual(res.matched.length, 1);
  assertEqual(res.matched[0].preset.name, "Laptops preset");
});

test("apply navigates the tab, reusing the current search term", async () => {
  // Save on a laptop page, then apply while browsing "gaming laptop".
  const r = makeRouter({ url: AMAZON_URL });
  const { preset } = await r.route({ type: "save", name: "p" });

  // user is now browsing a different but similar search
  r.tab.url = "https://www.amazon.in/s?k=" + encodeURIComponent("gaming laptop");

  const res = await r.route({ type: "apply", id: preset.id });
  assert(res.url.includes("gaming"), "keeps current search term");
  assert(res.url.includes("p_123"), "applies saved filters");
  assertEqual(r.navigations.length, 1);
  assertEqual(r.navigations[0].id, 7);
});

test("delete and rename work", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  const { preset } = await route({ type: "save", name: "old" });
  const renamed = await route({ type: "rename", id: preset.id, name: "new" });
  assertEqual(renamed.preset.name, "new");
  const del = await route({ type: "delete", id: preset.id });
  assertEqual(del.ok, true);
});

test("apply from an unsupported page uses the preset's saved search and site root", async () => {
  // Save a preset on Amazon, then navigate to an unrelated (unsupported) page
  // and apply it. The preset's own search must be used and the URL must be a
  // valid, re-parseable Amazon search URL.
  const r = makeRouter({ url: AMAZON_URL });
  const { preset } = await r.route({ type: "save", name: "p" });

  r.tab.url = "https://news.example.com/article";

  const res = await r.route({ type: "apply", id: preset.id });
  assert(res.url.startsWith("https://www.amazon.in/s"), "navigates to the amazon site root");
  const back = getAdapterById("amazon").parse(new URL(res.url));
  assertEqual(back.search, "laptop");
  assertEqual(back.filters.length, 2);
  assertEqual(r.navigations.length, 1);
});

test("unknown message type throws", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  let threw = false;
  try {
    await route({ type: "bogus" });
  } catch {
    threw = true;
  }
  assert(threw, "should reject unknown types");
});
