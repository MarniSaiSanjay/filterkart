// FilterCart message router (dependency-injected so it is unit-testable).
// background.js supplies real chrome-backed deps; tests supply mocks.
//
// deps = {
//   listPresets, createPreset, deletePreset, updatePreset, getPreset,  // storage
//   resolveAdapter, getAdapterById,                                    // registry
//   normalize, rankPresets,                                            // matcher
//   getActiveTab: () => Promise<tab>,                                  // chrome.tabs
//   navigateTab: (tabId, url) => Promise<void>,
// }

const SITE_ROOTS = {
  flipkart: "https://www.flipkart.com/search",
  amazon: "https://www.amazon.in/s",
  myntra: "https://www.myntra.com/",
  ajio: "https://www.ajio.com/search/",
};

async function getContext(deps) {
  const tab = await deps.getActiveTab();
  if (!tab || !tab.url) return { supported: false };
  const adapter = deps.resolveAdapter(tab.url);
  if (!adapter) return { supported: false, url: tab.url };
  const { search, filters } = adapter.parse(new URL(tab.url));
  return {
    supported: true,
    siteId: adapter.id,
    label: adapter.label,
    search,
    filters,
    url: tab.url,
  };
}

async function listForContext(deps) {
  const context = await getContext(deps);
  const all = await deps.listPresets();
  if (!context.supported) return { context, matched: [], others: all };
  const forSite = all.filter((p) => p.siteId === context.siteId);
  const ranked = deps.rankPresets(forSite, context.search, { threshold: 0.5 });
  const matchedIds = new Set(ranked.map((r) => r.preset.id));
  const matched = ranked.map((r) => ({ preset: r.preset, score: r.score }));
  const others = forSite.filter((p) => !matchedIds.has(p.id));
  return { context, matched, others };
}

async function save(deps, msg) {
  const tab = await deps.getActiveTab();
  if (!tab || !tab.url) throw new Error("no active tab");
  const adapter = deps.resolveAdapter(tab.url);
  if (!adapter) throw new Error("this site is not supported");
  const { search, filters } = adapter.parse(new URL(tab.url));
  if (!filters.length) throw new Error("no filters selected on this page");
  const preset = await deps.createPreset({
    name: msg.name || search || adapter.label,
    siteId: adapter.id,
    canonicalCategory: deps.normalize(search),
    search,
    filters,
  });
  return { preset };
}

async function apply(deps, msg) {
  const preset = await deps.getPreset(msg.id);
  if (!preset) throw new Error("preset not found");
  const adapter = deps.getAdapterById(preset.siteId);
  if (!adapter) throw new Error("no adapter for " + preset.siteId);

  const tab = await deps.getActiveTab();
  const currentAdapter = tab && tab.url ? deps.resolveAdapter(tab.url) : null;
  const sameSite = currentAdapter && currentAdapter.id === preset.siteId;

  const base = new URL(sameSite ? tab.url : SITE_ROOTS[preset.siteId] || tab.url);

  // Apply the preset's filters to the user's current search when possible,
  // otherwise fall back to the search the preset was saved with.
  let search = preset.search;
  if (sameSite) {
    const cur = currentAdapter.parse(new URL(tab.url));
    if (cur.search) search = cur.search;
  }

  const url = adapter.build(base, search, preset.filters);
  if (tab && tab.id != null) await deps.navigateTab(tab.id, url);
  return { url };
}

export function createRouter(deps) {
  return async function route(msg) {
    switch (msg && msg.type) {
      case "context":
        return getContext(deps);
      case "list":
        return listForContext(deps);
      case "save":
        return save(deps, msg);
      case "apply":
        return apply(deps, msg);
      case "delete":
        return { ok: await deps.deletePreset(msg.id) };
      case "rename":
        return { preset: await deps.updatePreset(msg.id, { name: msg.name }) };
      default:
        throw new Error("unknown message type: " + (msg && msg.type));
    }
  };
}

export { SITE_ROOTS };
