// FilterKart adapter registry.
// Adding a site = import its adapter and add it to ADAPTERS. No other changes.
import { validateAdapter, toURL } from "../adapters/base.js";
import flipkart from "../adapters/flipkart.js";
import amazon from "../adapters/amazon.js";
import myntra from "../adapters/myntra.js";
import ajio from "../adapters/ajio.js";
import nykaa from "../adapters/nykaa.js";

export const ADAPTERS = [flipkart, amazon, myntra, ajio, nykaa].map(validateAdapter);

// Return the first adapter whose matches() accepts the URL, or null.
export function resolveAdapter(url) {
  let u;
  try {
    u = toURL(url);
  } catch {
    return null;
  }
  return ADAPTERS.find((a) => {
    try {
      return a.matches(u);
    } catch {
      return false;
    }
  }) || null;
}

export function getAdapterById(id) {
  return ADAPTERS.find((a) => a.id === id) || null;
}

// Return the first adapter whose site this URL belongs to (host-only, ignoring
// whether it is a results page), or null. Lets the popup show a site-aware
// hint when the user is on a supported site but not a search page.
export function resolveSite(url) {
  let u;
  try {
    u = toURL(url);
  } catch {
    return null;
  }
  return ADAPTERS.find((a) => {
    try {
      return typeof a.host === "function" && a.host(u);
    } catch {
      return false;
    }
  }) || null;
}
