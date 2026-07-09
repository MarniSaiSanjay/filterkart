// Tests for the message router (src/core/messaging.js) with mocked deps.
import { setFile, test, assert, assertEqual } from "./harness.js";
import { mockStore } from "./mock-store.js";
import { createRouter } from "../src/core/messaging.js";
import * as storage from "../src/core/storage.js";
import { resolveAdapter, resolveSite, getAdapterById } from "../src/core/registry.js";
import { normalize, rankPresets } from "../src/similarity/matcher.js";

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
    getSettings: () => storage.getSettings(store),
    setSettings: (patch) => storage.setSettings(patch, store),
    resolveAdapter,
    resolveSite,
    getAdapterById,
    normalize,
    rankPresets,
    getActiveTab: async () => tab,
    navigateTab: async (id, u) => navigations.push({ id, url: u }),
    listSites: () => [
      { id: "flipkart", label: "Flipkart" },
      { id: "amazon", label: "Amazon" },
      { id: "myntra", label: "Myntra" },
      { id: "ajio", label: "Ajio" },
    ],
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
  assertEqual(ctx.knownSite, null);
});

test("context surfaces the site label on a supported site's non-results page", async () => {
  const { route } = makeRouter({ url: "https://www.amazon.in/ref=nav_logo" });
  const ctx = await route({ type: "context" });
  assertEqual(ctx.supported, false);
  assertEqual(ctx.knownSite, "Amazon");
});

test("save stores a preset parsed from the active tab", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  const { preset } = await route({ type: "save", name: "My Laptops" });
  assertEqual(preset.siteId, "amazon");
  assertEqual(preset.name, "My Laptops");
  assertEqual(preset.filters.length, 2);
  assertEqual(preset.canonicalCategory, "laptop");
});

test("save caps the preset name at 50 characters", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  const longName = "L".repeat(80);
  const { preset } = await route({ type: "save", name: longName });
  assertEqual(preset.name.length, 50);
  const { preset: renamed } = await route({ type: "rename", id: preset.id, name: "R".repeat(80) });
  assertEqual(renamed.name.length, 50);
});

test("save caps by code points without splitting an emoji surrogate pair", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  const emojiName = "\u{1F600}".repeat(80); // 80 emoji (each 2 UTF-16 units)
  const { preset } = await route({ type: "save", name: emojiName });
  assertEqual(Array.from(preset.name).length, 50);
  assert(!preset.name.includes("\uFFFD"), "must not contain a broken replacement char");
  assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(preset.name), "no dangling high surrogate");
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

test("save blocks an identical duplicate (same site, search and filters)", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  await route({ type: "save", name: "First" });
  let msg = "";
  try {
    await route({ type: "save", name: "Second" });
  } catch (e) {
    msg = e.message;
  }
  assert(msg.includes("already saved"), "should block the duplicate save");
  assert(msg.includes("First"), "should name the existing preset");
  const all = await route({ type: "all" });
  assertEqual(all.presets.length, 1);
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

test("all returns every preset plus the site list for the manager", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  await route({ type: "save", name: "Laptops" });
  const res = await route({ type: "all" });
  assertEqual(res.presets.length, 1);
  assertEqual(res.presets[0].name, "Laptops");
  assertEqual(res.sites.length, 4);
  assert(res.sites.some((s) => s.id === "amazon" && s.label === "Amazon"), "includes amazon site");
});

test("buildUrl produces a re-parseable site URL without navigating", async () => {
  const r = makeRouter({ url: AMAZON_URL });
  const { preset } = await r.route({ type: "save", name: "p" });

  // Simulate the manager tab (not a shopping page).
  r.tab.url = "chrome-extension://abc/src/manager/manager.html";

  const res = await r.route({ type: "buildUrl", id: preset.id });
  assert(res.url.startsWith("https://www.amazon.in/s"), "builds an amazon search URL");
  const back = getAdapterById("amazon").parse(new URL(res.url));
  assertEqual(back.search, "laptop");
  assertEqual(back.filters.length, 2);
  assertEqual(r.navigations.length, 0); // must NOT navigate any tab
});

const AMAZON_BARE = "https://www.amazon.in/s?k=laptop";
const AMAZON_URL2 =
  "https://www.amazon.in/s?k=laptop&rh=" + encodeURIComponent("p_89:Dell");

test("presets are auto-apply-included by default; setAutoApply can exclude one", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  const { preset } = await route({ type: "save", name: "p" });
  assertEqual(preset.autoApply, true); // opt-out model: included by default
  const res = await route({ type: "setAutoApply", id: preset.id, value: false });
  assertEqual(res.preset.autoApply, false);
  const all = await route({ type: "all" });
  assertEqual(all.presets[0].autoApply, false);
});

test("setAllAutoApply bulk-flips every preset's flag", async () => {
  const r = makeRouter({ url: AMAZON_URL });
  const a = await r.route({ type: "save", name: "a" });
  r.tab.url = AMAZON_URL2;
  await r.route({ type: "save", name: "b" });
  // Opt one out, then disable all.
  await r.route({ type: "setAutoApply", id: a.preset.id, value: false });

  const off = await r.route({ type: "setAllAutoApply", value: false });
  assertEqual(off.changed, 1); // only the still-included one changed
  let all = await r.route({ type: "all" });
  assert(all.presets.every((p) => p.autoApply === false), "all excluded");

  const on = await r.route({ type: "setAllAutoApply", value: true });
  assertEqual(on.changed, 2);
  all = await r.route({ type: "all" });
  assert(all.presets.every((p) => p.autoApply === true), "all included");
});

test("setGlobalAutoApply persists the master switch", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  const off = await route({ type: "getSettings" });
  assert(!off.settings.autoApply, "defaults off");
  const on = await route({ type: "setGlobalAutoApply", value: true });
  assertEqual(on.settings.autoApply, true);
  const again = await route({ type: "getSettings" });
  assertEqual(again.settings.autoApply, true);
});

test("autoApplyTarget only fires when the global master switch is on", async () => {
  const r = makeRouter({ url: AMAZON_URL });
  await r.route({ type: "save", name: "p" }); // included by default

  // Global off -> nothing, even though the preset is included.
  const off = await r.route({ type: "autoApplyTarget", url: AMAZON_BARE });
  assertEqual(off.url, null);

  // Global on -> fires.
  await r.route({ type: "setGlobalAutoApply", value: true });
  const on = await r.route({ type: "autoApplyTarget", url: AMAZON_BARE });
  assert(on.url && on.url.includes("p_123"), "applies the saved filters");
  assertEqual(on.key, "amazon|laptop");
  assertEqual(on.name, "p"); // preset name, surfaced to the auto-apply toast
});

test("a per-preset opt-out excludes just that preset while global is on", async () => {
  const r = makeRouter({ url: AMAZON_URL });
  const { preset } = await r.route({ type: "save", name: "p" });
  await r.route({ type: "setGlobalAutoApply", value: true });
  await r.route({ type: "setAutoApply", id: preset.id, value: false });

  const res = await r.route({ type: "autoApplyTarget", url: AMAZON_BARE });
  assertEqual(res.url, null);
});

test("autoApplyTarget skips a page that already has filters (loop guard)", async () => {
  const r = makeRouter({ url: AMAZON_URL });
  await r.route({ type: "save", name: "p" });
  await r.route({ type: "setGlobalAutoApply", value: true });

  const res = await r.route({ type: "autoApplyTarget", url: AMAZON_URL });
  assertEqual(res.url, null);
});

test("autoApplyTarget breaks a tie by most recently updated preset", async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const r = makeRouter({ url: AMAZON_URL });
  await r.route({ type: "setGlobalAutoApply", value: true });
  await r.route({ type: "save", name: "first" }); // included by default

  await sleep(5); // ensure a later updatedAt on the second preset
  // A second included preset for the same search but different filters.
  r.tab.url = AMAZON_URL2;
  await r.route({ type: "save", name: "second" });

  const res = await r.route({ type: "autoApplyTarget", url: AMAZON_BARE });
  assert(res.url.includes("Dell"), "most recent preset's filters win the tie");
  assert(!res.url.includes("p_123"), "not the older preset's filters");
});

test("importPresets adds valid presets and skips duplicates + junk", async () => {
  const r = makeRouter({ url: AMAZON_URL });
  await r.route({ type: "save", name: "existing" }); // laptop + p_123/p_36

  const res = await r.route({
    type: "importPresets",
    presets: [
      // duplicate of the existing preset -> skipped
      { name: "dupe", siteId: "amazon", search: "laptop", filters: [
        { facet: "p_123", value: "308445" }, { facet: "p_36", value: "2850000-6100000" },
      ] },
      // new, valid -> added
      { name: "shoes", siteId: "amazon", search: "shoes", filters: [{ facet: "p_89", value: "Nike" }] },
      // unknown site -> skipped
      { name: "bad site", siteId: "nosuchsite", search: "x", filters: [{ facet: "a", value: "b" }] },
      // no filters -> skipped
      { name: "empty", siteId: "amazon", search: "y", filters: [] },
      // not an object -> skipped
      "garbage",
    ],
  });
  assertEqual(res.added, 1);
  assertEqual(res.skipped, 4);
  const all = await r.route({ type: "all" });
  assertEqual(all.presets.length, 2);
});

test("importPresets keeps an autoApply:false exception and mints fresh ids", async () => {
  const r = makeRouter({ url: AMAZON_URL });
  const res = await r.route({
    type: "importPresets",
    presets: [
      // explicit opt-out is preserved
      { id: "should-be-ignored", name: "p", siteId: "amazon", search: "laptop", autoApply: false,
        filters: [{ facet: "p_89", value: "Dell" }] },
      // no autoApply field -> included by default (opt-out model)
      { name: "q", siteId: "amazon", search: "shoes", filters: [{ facet: "p_89", value: "Nike" }] },
    ],
  });
  assertEqual(res.added, 2);
  const all = await r.route({ type: "all" });
  const p = all.presets.find((x) => x.search === "laptop");
  const q = all.presets.find((x) => x.search === "shoes");
  assertEqual(p.autoApply, false);
  assertEqual(q.autoApply, true);
  assert(p.id !== "should-be-ignored", "assigns a fresh id");
});

test("list marks a preset applied when the page already carries its filters", async () => {
  const r = makeRouter({ url: AMAZON_URL });
  await r.route({ type: "save", name: "Laptops" }); // saved with the page's filters

  // Same URL: the page carries the preset's exact filters -> applied.
  const on = await r.route({ type: "list" });
  assertEqual(on.matched.length, 1);
  assertEqual(on.matched[0].applied, true);

  // Bare search: no filters on the page -> not applied.
  r.tab.url = AMAZON_BARE;
  const off = await r.route({ type: "list" });
  assertEqual(off.matched.length, 1);
  assertEqual(off.matched[0].applied, false);
});

test("removeTarget returns the bare search URL and the auto-apply guard key", async () => {
  const { route } = makeRouter({ url: AMAZON_URL });
  const res = await route({ type: "removeTarget", url: AMAZON_URL });
  assert(res.url, "returns a url");
  assert(!res.url.includes("p_123"), "strips the applied filters");
  assert(res.url.includes("k=laptop"), "keeps the search term");
  assertEqual(res.key, "amazon|laptop");
});

test("removeTarget returns null url for an unsupported site", async () => {
  const { route } = makeRouter({ url: "https://www.example.com/x" });
  const res = await route({ type: "removeTarget", url: "https://www.example.com/x" });
  assertEqual(res.url, null);
});

// Guards the class of bug where storage strips adapter-private filter data:
// Meesho needs each value's id + payload to actually filter, and those survive a
// save (createPreset) -> apply (getPreset -> build) cycle only via `meta`.
const MEESHO_URL =
  "https://www.meesho.com/search?q=kurti" +
  "&Gender[0][id]=443&Gender[0][label]=Women" +
  "&Gender[0][payload]=" +
  encodeURIComponent("eyJmaWVsZCI6ImxhYmVscy45Iiwib3AiOiJpbiIsInZhbHVlIjoiNDQzIn0=");

test("meesho id/payload survive a save + apply storage round-trip", async () => {
  const r = makeRouter({ url: MEESHO_URL });
  const { preset } = await r.route({ type: "save", name: "kurti" });
  const res = await r.route({ type: "apply", id: preset.id });
  assert(res.url.includes("443"), "apply URL must keep the filter id");
  assert(res.url.includes("payload"), "apply URL must keep the filter payload");
  assert(res.url.includes("label"), "apply URL keeps the human label too");
});
