// FilterKart message router (dependency-injected so it is unit-testable).
// background.js supplies real chrome-backed deps (storage, registry, matcher,
// tabs); tests supply mocks. See the deps object in background.js.

const NAME_MAX = 50; // preset name cap, mirrored by the UI inputs' maxlength

// Auto-apply only fires on a confident (essentially exact) search match, so an
// automatic page redirect never surprises the user on a loosely-related search.
const AUTO_APPLY_THRESHOLD = 0.999;

// Cap a name to NAME_MAX by code points, not UTF-16 units, so we never slice a
// surrogate pair (emoji) in half and store a broken "\uFFFD" character.
function capName(name) {
  return Array.from(name || "").slice(0, NAME_MAX).join("");
}

// Order-independent signature of a filter set, for duplicate detection.
function filterSig(filters) {
  return (filters || [])
    .map((f) => `${f.facet}\u0000${f.value}`)
    .sort()
    .join("\u0001");
}

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
  // A preset is "applied" when the current page already carries its exact filter
  // set — lets the popup show Remove instead of Apply, and self-corrects on
  // refresh/close since it's derived from the live page URL each time.
  const curSig = context.filters && context.filters.length ? filterSig(context.filters) : null;
  const matched = ranked.map((r) => ({
    preset: r.preset,
    score: r.score,
    applied: curSig != null && filterSig(r.preset.filters) === curSig,
  }));
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
  const all = await deps.listPresets();
  const sig = filterSig(filters);
  const dup = all.find(
    (p) =>
      p.siteId === adapter.id &&
      (p.search || "") === (search || "") &&
      filterSig(p.filters) === sig
  );
  if (dup) throw new Error(`You've already saved these filters as \u201C${dup.name}\u201D.`);
  const preset = await deps.createPreset({
    name: capName(msg.name || search || adapter.label),
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

// Flip a preset's auto-apply flag (an opt-out exception when the global master
// switch is on). updatePreset bumps updatedAt, so the most recently toggled
// preset also wins the "most recent" tie-break below.
async function setAutoApply(deps, msg) {
  const preset = await deps.updatePreset(msg.id, { autoApply: !!msg.value });
  if (!preset) throw new Error("preset not found");
  return { preset };
}

// Bulk opt-in/opt-out: set every preset's auto-apply flag at once. Used by the
// popup's "Enable all / Disable all" links (only meaningful while the global
// master switch is on). Skips presets already at the target value.
async function setAllAutoApply(deps, msg) {
  const value = !!msg.value;
  const presets = await deps.listPresets();
  let changed = 0;
  for (const p of presets) {
    if ((p.autoApply !== false) === value) continue;
    await deps.updatePreset(p.id, { autoApply: value });
    changed++;
  }
  return { changed };
}

// Read/write the global master switch that gates auto-apply for every preset.
async function getSettings(deps) {
  return { settings: await deps.getSettings() };
}
async function setGlobalAutoApply(deps, msg) {
  return { settings: await deps.setSettings({ autoApply: !!msg.value }) };
}

// Given a page URL, return the filtered URL to auto-redirect to (or {url:null}).
// Fires only on a *bare* search (a search with no filters yet) that matches an
// auto-apply preset; the empty-filters check also serves as the loop guard,
// since the redirected page then has filters and no longer qualifies.
async function autoApplyTarget(deps, msg) {
  if (!msg || !msg.url) return { url: null };
  const settings = await deps.getSettings();
  if (!settings.autoApply) return { url: null }; // global master switch is off
  let pageUrl;
  try {
    pageUrl = new URL(msg.url);
  } catch {
    return { url: null };
  }
  const adapter = deps.resolveAdapter(msg.url);
  if (!adapter) return { url: null };
  const { search, filters } = adapter.parse(pageUrl);
  if (!search) return { url: null };
  if (filters && filters.length) return { url: null };

  const all = await deps.listPresets();
  const candidates = all.filter(
    (p) => p.autoApply && p.siteId === adapter.id && p.filters && p.filters.length
  );
  if (!candidates.length) return { url: null };

  const ranked = deps.rankPresets(candidates, search, { threshold: AUTO_APPLY_THRESHOLD });
  if (!ranked.length) return { url: null };
  const topScore = ranked[0].score;
  // Among presets tied at the top score, apply the most recently updated one.
  const top = ranked
    .filter((r) => r.score >= topScore - 1e-9)
    .map((r) => r.preset)
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))[0];

  const url = adapter.build(pageUrl, search, top.filters, top.meta);
  return { url, key: adapter.id + "|" + String(search).trim().toLowerCase(), name: top.name };
}

// Build the URL that clears all filters from the current page (keeps the
// search). Returns the auto-apply guard key so the content script can suppress
// a re-auto-apply on the bare search it's about to navigate to.
async function removeTarget(deps, msg) {
  let pageUrl;
  try {
    pageUrl = new URL(msg.url);
  } catch {
    return { url: null };
  }
  const adapter = deps.resolveAdapter(msg.url);
  if (!adapter) return { url: null };
  const { search } = adapter.parse(pageUrl);
  if (!search) return { url: null };
  const url = adapter.build(pageUrl, search, [], null);
  return { url, key: adapter.id + "|" + String(search).trim().toLowerCase() };
}

// Everything the manager page needs to render: the full preset library plus
// the list of supported sites (id + label) for the sidebar.
async function all(deps) {
  const presets = await deps.listPresets();
  const sites = deps.listSites ? deps.listSites() : [];
  return { presets, sites };
}

// Coerce one imported record into a safe, storable preset (new id assigned by
// createPreset). Rejects records for unknown sites or with no valid filters.
function sanitizeImport(raw, deps) {
  if (!raw || typeof raw !== "object") return null;
  const siteId = typeof raw.siteId === "string" ? raw.siteId : "";
  const adapter = siteId && deps.getAdapterById(siteId);
  if (!adapter) return null;
  const filters = Array.isArray(raw.filters)
    ? raw.filters
        .filter((f) => f && typeof f === "object" && typeof f.facet === "string" && typeof f.value === "string")
        .map((f) => ({ facet: f.facet, value: f.value }))
    : [];
  if (!filters.length) return null;
  const search = typeof raw.search === "string" ? raw.search : "";
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name : search || adapter.label;
  return {
    name: capName(name),
    siteId,
    canonicalCategory:
      typeof raw.canonicalCategory === "string" ? raw.canonicalCategory : deps.normalize(search),
    search,
    filters,
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : null,
    autoApply: raw.autoApply !== false,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
}

// Bulk-create presets from an exported file, skipping invalid records and any
// that duplicate an existing preset (same site + search + filter set).
async function importPresets(deps, msg) {
  const incoming = Array.isArray(msg.presets) ? msg.presets : [];
  const existing = await deps.listPresets();
  const sigOf = (p) => `${p.siteId}\u0000${p.search || ""}\u0000${filterSig(p.filters)}`;
  const seen = new Set(existing.map(sigOf));
  let added = 0;
  let skipped = 0;
  for (const raw of incoming) {
    const preset = sanitizeImport(raw, deps);
    if (!preset) {
      skipped++;
      continue;
    }
    const sig = sigOf(preset);
    if (seen.has(sig)) {
      skipped++;
      continue;
    }
    seen.add(sig);
    await deps.createPreset(preset);
    added++;
  }
  return { added, skipped };
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
      case "setAutoApply":
        return setAutoApply(deps, msg);
      case "setAllAutoApply":
        return setAllAutoApply(deps, msg);
      case "getSettings":
        return getSettings(deps);
      case "setGlobalAutoApply":
        return setGlobalAutoApply(deps, msg);
      case "autoApplyTarget":
        return autoApplyTarget(deps, msg);
      case "removeTarget":
        return removeTarget(deps, msg);
      case "all":
        return all(deps);
      case "importPresets":
        return importPresets(deps, msg);
      case "delete":
        return { ok: await deps.deletePreset(msg.id) };
      case "rename":
        return { preset: await deps.updatePreset(msg.id, { name: capName(msg.name) }) };
      default:
        throw new Error("unknown message type: " + (msg && msg.type));
    }
  };
}
