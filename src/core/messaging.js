// FilterKart message router (dependency-injected so it is unit-testable).
// background.js supplies real chrome-backed deps (storage, registry, matcher,
// tabs); tests supply mocks. See the deps object in background.js.

const NAME_MAX = 50; // preset name cap, mirrored by the UI inputs' maxlength

export const SITE_ROOTS = {
  flipkart: "https://www.flipkart.com/search",
  amazon: "https://www.amazon.in/s",
  myntra: "https://www.myntra.com/",
  ajio: "https://www.ajio.com/search/",
  nykaa: "https://www.nykaa.com/search/result/",
  meesho: "https://www.meesho.com/search",
  croma: "https://www.croma.com/searchB",
};

async function getContext(deps) {
  const tab = await deps.getActiveTab();
  if (!tab || !tab.url) return { supported: false };
  const adapter = deps.resolveAdapter(tab.url);
  if (!adapter) {
    // On a supported site but not a results page: surface the label so the
    // popup can show a site-aware hint instead of a generic message.
    const site = deps.resolveSite ? deps.resolveSite(tab.url) : null;
    return { supported: false, url: tab.url, knownSite: site ? site.label : null };
  }
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
  const ranked = deps.rankPresets(forSite, context.search, { threshold: 0.6 });
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
  const { search, filters, meta } = adapter.parse(new URL(tab.url));
  if (!filters.length) throw new Error("no filters selected on this page");
  const preset = await deps.createPreset({
    name: (msg.name || search || adapter.label).slice(0, NAME_MAX),
    siteId: adapter.id,
    canonicalCategory: deps.normalize(search),
    search,
    filters,
    meta,
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

  const url = adapter.build(base, search, preset.filters, preset.meta);
  if (tab && tab.id != null) await deps.navigateTab(tab.id, url);
  return { url };
}

// Build the URL a preset would open on its own site, without navigating any
// tab. Used by the manager page, which opens results in a fresh tab.
async function buildUrl(deps, msg) {
  const preset = await deps.getPreset(msg.id);
  if (!preset) throw new Error("preset not found");
  const adapter = deps.getAdapterById(preset.siteId);
  if (!adapter) throw new Error("no adapter for " + preset.siteId);
  const root = SITE_ROOTS[preset.siteId];
  if (!root) throw new Error("no root url for " + preset.siteId);
  const url = adapter.build(new URL(root), preset.search, preset.filters, preset.meta);
  return { url };
}

// Everything the manager page needs to render: the full preset library plus
// the list of supported sites (id + label) for the sidebar.
async function all(deps) {
  const presets = await deps.listPresets();
  const sites = deps.listSites ? deps.listSites() : [];
  return { presets, sites };
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
      case "buildUrl":
        return buildUrl(deps, msg);
      case "all":
        return all(deps);
      case "delete":
        return { ok: await deps.deletePreset(msg.id) };
      case "rename":
        return { preset: await deps.updatePreset(msg.id, { name: (msg.name || "").slice(0, NAME_MAX) }) };
      default:
        throw new Error("unknown message type: " + (msg && msg.type));
    }
  };
}
