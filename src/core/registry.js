// FilterCart adapter registry.
// Adding a site = import its adapter and add it to ADAPTERS. No other changes.
import { validateAdapter, toURL } from "../adapters/base.js";
import flipkart from "../adapters/flipkart.js";
import amazon from "../adapters/amazon.js";
import myntra from "../adapters/myntra.js";
import ajio from "../adapters/ajio.js";

export const ADAPTERS = [flipkart, amazon, myntra, ajio].map(validateAdapter);

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
