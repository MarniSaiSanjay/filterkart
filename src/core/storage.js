// FilterKart preset storage — one item per preset in chrome.storage.sync, keyed
// "preset:<id>", so each preset gets its own ~8 KB budget instead of sharing a
// single array (which capped the whole library at ~8 KB). A preset is
// { id, name, siteId, canonicalCategory, search, filters:[{facet,value}], meta,
// createdAt, updatedAt }.

const PREFIX = "preset:";

// Resolve a storage area. Falls back to an injected mock for tests/node.
function area(override) {
  if (override) return override;
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    return chrome.storage.sync;
  }
  throw new Error("no chrome.storage.sync available");
}

function lastError() {
  return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError;
}

// Promise wrappers over the callback-style storage API.
function pget(store, keys) {
  return new Promise((resolve, reject) => {
    try {
      store.get(keys, (res) => {
        const err = lastError();
        if (err) return reject(new Error(err.message));
        resolve(res || {});
      });
    } catch (e) {
      reject(e);
    }
  });
}

function pset(store, obj) {
  return new Promise((resolve, reject) => {
    try {
      store.set(obj, () => {
        const err = lastError();
        if (err) return reject(new Error(err.message));
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

function premove(store, keys) {
  return new Promise((resolve, reject) => {
    try {
      store.remove(keys, () => {
        const err = lastError();
        if (err) return reject(new Error(err.message));
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

const str = (v) => (typeof v === "string" ? v : "");

// Map low-level storage quota/limit errors to a message a user can act on.
function friendlyWriteError(e) {
  const msg = (e && e.message) || "";
  if (/quota|max_items|too many|bytes/i.test(msg)) {
    return new Error("Storage is full — delete a few presets and try again.");
  }
  return e instanceof Error ? e : new Error(msg || "could not save preset");
}

// Coerce a stored entry into the canonical preset shape. Returns null for
// entries that can't be salvaged (not an object, or missing id/siteId), so a
// single tampered record can't break rendering of the whole list.
function sanitizePreset(p) {
  if (!p || typeof p !== "object") return null;
  if (!str(p.id) || !str(p.siteId)) return null;
  const filters = Array.isArray(p.filters)
    ? p.filters
        .filter((f) => f && typeof f === "object")
        .map((f) => ({ facet: str(f.facet), value: str(f.value) }))
    : [];
  return {
    id: p.id,
    name: str(p.name),
    siteId: p.siteId,
    canonicalCategory: str(p.canonicalCategory),
    search: str(p.search),
    filters,
    meta: p.meta && typeof p.meta === "object" ? p.meta : null,
    createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
  };
}

// Read every preset item.
async function readAll(store) {
  const all = await pget(store, null);
  return Object.keys(all)
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => sanitizePreset(all[k]))
    .filter(Boolean);
}

export function generateId() {
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export async function listPresets(store) {
  return readAll(area(store));
}

export async function getPreset(id, store) {
  const s = area(store);
  // Per-preset keys let us read exactly one item instead of loading and
  // sanitizing the whole library just to find one (used by open/apply/rename/delete).
  const res = await pget(s, PREFIX + id);
  return sanitizePreset(res[PREFIX + id]);
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
  await pset(s, { [PREFIX + record.id]: record }).catch((e) => {
    throw friendlyWriteError(e);
  });
  return record;
}

// Merges patch into an existing preset by id. Returns updated preset or null.
export async function updatePreset(id, patch, store) {
  const s = area(store);
  const existing = await getPreset(id, s);
  if (!existing) return null;
  const updated = { ...existing, ...patch, id: existing.id, updatedAt: Date.now() };
  await pset(s, { [PREFIX + id]: updated }).catch((e) => {
    throw friendlyWriteError(e);
  });
  return updated;
}

export async function deletePreset(id, store) {
  const s = area(store);
  const existed = !!(await getPreset(id, s));
  await premove(s, PREFIX + id);
  return existed;
}
