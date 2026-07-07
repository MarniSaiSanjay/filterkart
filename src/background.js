// FilterCart background service worker.
// Wires Chrome APIs to the dependency-injected message router.
import * as storage from "./core/storage.js";
import { resolveAdapter, getAdapterById } from "./core/registry.js";
import { normalize, rankPresets } from "./core/matcher.js";
import { createRouter } from "./core/messaging.js";

const deps = {
  listPresets: () => storage.listPresets(),
  createPreset: (p) => storage.createPreset(p),
  deletePreset: (id) => storage.deletePreset(id),
  updatePreset: (id, patch) => storage.updatePreset(id, patch),
  getPreset: (id) => storage.getPreset(id),
  resolveAdapter,
  getAdapterById,
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
  console.log("FilterCart installed");
});
