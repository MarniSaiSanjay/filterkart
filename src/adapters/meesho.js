// Meesho adapter.
// Meesho encodes each selected filter value as a triple of query params:
//   <Facet>[<i>][id]=443&<Facet>[<i>][label]=Women&<Facet>[<i>][payload]=<base64>
// where <base64> decodes to {field, op, value}. The payload is opaque and its
// `field` mapping is facet-specific, so we store and replay all three parts
// verbatim rather than interpreting them. Search term is the `q` param.
import { toURL } from "./base.js";

// Matches keys like `Gender[0][id]` / `Price[1][payload]`. Facet may contain
// spaces (e.g. "Print Or Pattern Type"), so allow anything up to the first `[`.
const KEY = /^([^[]+)\[(\d+)\]\[(id|label|payload)\]$/;

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
    const seen = new Set();
    for (const g of groups.values()) {
      if (!g.id && !g.payload) continue;
      const key = g.facet + "\u0000" + (g.id || g.label);
      if (seen.has(key)) continue;
      seen.add(key);
      filters.push({ facet: g.facet, value: g.label || g.id, id: g.id, payload: g.payload });
    }
    return { search, filters };
  },

  build(baseUrl, search, filters) {
    const u = toURL(baseUrl);
    u.pathname = "/search";
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    // Re-emit each facet's values with per-facet incrementing indices.
    const counts = new Map();
    const seen = new Set();
    for (const f of filters || []) {
      if (!f || !f.facet) continue;
      const dk = f.facet + "\u0000" + (f.id || f.value);
      if (seen.has(dk)) continue;
      seen.add(dk);
      const i = counts.get(f.facet) || 0;
      counts.set(f.facet, i + 1);
      const base = `${f.facet}[${i}]`;
      if (f.id != null) params.set(`${base}[id]`, f.id);
      if (f.value != null) params.set(`${base}[label]`, f.value);
      if (f.payload != null) params.set(`${base}[payload]`, f.payload);
    }
    u.search = params.toString();
    return u.toString();
  },
};
