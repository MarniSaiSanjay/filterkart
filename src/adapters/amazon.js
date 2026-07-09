// Amazon adapter. All filters live in one `rh=` param (facets comma-separated,
// values within a facet pipe-separated); search term is the `k=` param.
import { dedupeFilters, toURL } from "./base.js";

export default {
  id: "amazon",
  label: "Amazon",

  matches(url) {
    return this.host(url) && url.pathname.startsWith("/s");
  },

  host(url) {
    return /(^|\.)amazon\.in$/.test(url.hostname);
  },

  parse(url) {
    const u = toURL(url);
    const search = u.searchParams.get("k") || "";
    const rh = u.searchParams.get("rh") || "";
    const filters = [];
    for (const part of rh.split(",")) {
      if (!part) continue;
      const idx = part.indexOf(":");
      if (idx === -1) continue;
      const facet = part.slice(0, idx);
      for (const value of part.slice(idx + 1).split("|")) {
        if (value) filters.push({ facet, value });
      }
    }
    return { search, filters: dedupeFilters(filters) };
  },

  build(baseUrl, search, filters) {
    const u = toURL(baseUrl);
    u.pathname = "/s";
    const params = new URLSearchParams();
    if (search) params.set("k", search);
    const groups = new Map();
    for (const f of dedupeFilters(filters)) {
      if (!groups.has(f.facet)) groups.set(f.facet, []);
      groups.get(f.facet).push(f.value);
    }
    const rh = [...groups.entries()].map(([k, vs]) => `${k}:${vs.join("|")}`).join(",");
    if (rh) params.set("rh", rh);
    u.search = params.toString();
    return u.toString();
  },
};
