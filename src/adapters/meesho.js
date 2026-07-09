// Meesho adapter. Each filter value is encoded as three params
// <Facet>[i][id|label|payload]. The id and opaque payload are REQUIRED for the
// filter to actually apply on Meesho, but they aren't part of the portable
// {facet, value} shape that storage keeps — so they're stashed in adapter-private
// `meta.encoded`, keyed by facet+value (which storage preserves). Without this,
// a saved preset rebuilds a label-only URL that Meesho silently ignores.
// Search term is the `q` param.
import { toURL } from "./base.js";

// Matches keys like `Gender[0][id]` / `Price[1][payload]`. Facet may contain
// spaces (e.g. "Print Or Pattern Type"), so allow anything up to the first `[`.
const KEY = /^([^[]+)\[(\d+)\]\[(id|label|payload)\]$/;

const mk = (facet, value) => facet + "\u0000" + value;

export default {
  id: "meesho",
  label: "Meesho",

  matches(url) {
    return this.host(url) && url.pathname.startsWith("/search");
  },

  host(url) {
    return /(^|\.)meesho\.com$/.test(url.hostname);
  },

  parse(url) {
    const u = toURL(url);
    const search = u.searchParams.get("q") || "";
    // Reassemble each facet/index triple from its three separate params.
    const groups = new Map();
    for (const [key, val] of u.searchParams) {
      const m = KEY.exec(key);
      if (!m) continue;
      const [, facet, idx, part] = m;
      const gk = facet + "\u0000" + idx;
      if (!groups.has(gk)) groups.set(gk, { facet, id: "", label: "", payload: "" });
      groups.get(gk)[part] = val;
    }
    const filters = [];
    const encoded = {};
    const seen = new Set();
    for (const g of groups.values()) {
      if (!g.id && !g.payload) continue;
      const value = g.label || g.id;
      const key = mk(g.facet, value);
      if (seen.has(key)) continue;
      seen.add(key);
      filters.push({ facet: g.facet, value });
      encoded[key] = { id: g.id, payload: g.payload };
    }
    const meta = filters.length ? { encoded } : undefined;
    return { search, filters, meta };
  },

  build(baseUrl, search, filters, meta) {
    const u = toURL(baseUrl);
    u.pathname = "/search";
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    const encoded = (meta && meta.encoded) || {};
    // Re-emit each facet's values with per-facet incrementing indices, restoring
    // the id/payload for each value from meta so the URL actually filters.
    const counts = new Map();
    const seen = new Set();
    for (const f of filters || []) {
      if (!f || !f.facet) continue;
      const key = mk(f.facet, f.value);
      if (seen.has(key)) continue;
      seen.add(key);
      const enc = encoded[key] || {};
      const i = counts.get(f.facet) || 0;
      counts.set(f.facet, i + 1);
      const base = `${f.facet}[${i}]`;
      if (enc.id) params.set(`${base}[id]`, enc.id);
      if (f.value != null) params.set(`${base}[label]`, f.value);
      if (enc.payload) params.set(`${base}[payload]`, enc.payload);
    }
    u.search = params.toString();
    return u.toString();
  },
};
