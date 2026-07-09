// FilterKart background service worker.
// Wires Chrome APIs to the dependency-injected message router.
import * as storage from "./core/storage.js";
import { ADAPTERS, resolveAdapter, getAdapterById, resolveSite } from "./core/registry.js";
import { normalize, rankPresets } from "./similarity/matcher.js";
import { createRouter, SITE_ROOTS } from "./core/messaging.js";

function siteHome(id) {
  const root = SITE_ROOTS[id];
  try {
    return root ? new URL(root).origin : null;
  } catch {
    return null;
  }
}

const deps = {
  listPresets: () => storage.listPresets(),
  createPreset: (p) => storage.createPreset(p),
  deletePreset: (id) => storage.deletePreset(id),
  updatePreset: (id, patch) => storage.updatePreset(id, patch),
  getPreset: (id) => storage.getPreset(id),
  getSettings: () => storage.getSettings(),
  setSettings: (patch) => storage.setSettings(patch),
  resolveAdapter,
  resolveSite,
  getAdapterById,
  listSites: () => ADAPTERS.map((a) => ({ id: a.id, label: a.label, home: siteHome(a.id) })),
  normalize,
  rankPresets,
  getActiveTab: async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  },
  navigateTab: (tabId, url) => chrome.tabs.update(tabId, { url }),
};

const route = createRouter(deps);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  route(msg).then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ ok: false, error: err.message })
  );
  return true; // keep the message channel open for the async response
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("FilterKart installed");
});
