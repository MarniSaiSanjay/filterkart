// FilterKart preset storage — CRUD over chrome.storage.sync.
//
// Preset schema:
//   {
//     id, name,
//     siteId,              // "amazon" | "flipkart" | "myntra" | "ajio"
//     canonicalCategory,   // normalized search category (for similarity matching)
//     search,              // original search term at save time
//     filters: [ { facet, value } ],
//     meta,                // optional adapter data for URL rebuild (e.g. category path)
//     createdAt,           // epoch ms
//   }

const KEY = "presets";

// Resolve a storage area. Falls back to an injected mock for tests/node.
function area(override) {
  if (override) return override;
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    return chrome.storage.sync;
  }
  throw new Error("no chrome.storage.sync available");
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    try {
      store.get(KEY, (res) => {
        const err = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve((res && res[KEY]) || []);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function setAll(store, presets) {
  return new Promise((resolve, reject) => {
    try {
      store.set({ [KEY]: presets }, () => {
        const err = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function generateId() {
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export async function listPresets(store) {
  return getAll(area(store));
}

export async function getPreset(id, store) {
  const all = await getAll(area(store));
  return all.find((p) => p.id === id) || null;
}

// Accepts a partial preset; fills id/createdAt and validates required fields.
export async function createPreset(preset, store) {
  const s = area(store);
  if (!preset || !preset.siteId) throw new Error("preset.siteId required");
  if (!preset.name) throw new Error("preset.name required");
  const record = {
    id: preset.id || generateId(),
    name: preset.name,
    siteId: preset.siteId,
    canonicalCategory: preset.canonicalCategory || "",
    search: preset.search || "",
    filters: Array.isArray(preset.filters) ? preset.filters : [],
    meta: preset.meta || null,
    createdAt: preset.createdAt || Date.now(),
    updatedAt: preset.updatedAt || preset.createdAt || Date.now(),
  };
  const all = await getAll(s);
  all.push(record);
  await setAll(s, all);
  return record;
}

// Merges patch into an existing preset by id. Returns updated preset or null.
export async function updatePreset(id, patch, store) {
  const s = area(store);
  const all = await getAll(s);
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch, id: all[idx].id, updatedAt: Date.now() };
  await setAll(s, all);
  return all[idx];
}

export async function deletePreset(id, store) {
  const s = area(store);
  const all = await getAll(s);
  const next = all.filter((p) => p.id !== id);
  await setAll(s, next);
  return next.length !== all.length;
}
