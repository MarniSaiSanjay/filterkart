// Myntra adapter.
// Category/search lives in the URL path (e.g. /sports-shoes).
// Filters live in `f=` and range filters (Price) in `rf=`.
//   f=Brand:Nike,Puma::Gender:men women,women
//   rf=Price:0.0_600.0_0.0 TO 600.0
// Facets are joined by "::" and values within a facet by ",".
import { dedupeFilters, toURL } from "./base.js";

// Facets that Myntra encodes in `rf=` rather than `f=`.
const RANGE_FACETS = new Set(["Price"]);

function parseGroup(str) {
  const out = [];
  if (!str) return out;
  for (const seg of str.split("::")) {
    const idx = seg.indexOf(":");
    if (idx === -1) continue;
    const facet = seg.slice(0, idx);
    for (const value of seg.slice(idx + 1).split(",")) {
      if (value) out.push({ facet, value });
    }
  }
  return out;
}

function encodeGroups(groups) {
  return [...groups.entries()].map(([k, vs]) => `${k}:${vs.join(",")}`).join("::");
}

export default {
  id: "myntra",
  label: "Myntra",

  matches(url) {
    return /(^|\.)myntra\.com$/.test(url.hostname) && url.pathname.length > 1;
  },

  parse(url) {
    const u = toURL(url);
    const search = u.pathname.replace(/^\/+|\/+$/g, "");
    const filters = [
      ...parseGroup(u.searchParams.get("f")),
      ...parseGroup(u.searchParams.get("rf")),
    ];
    return { search, filters: dedupeFilters(filters) };
  },

  build(baseUrl, search, filters) {
    const u = toURL(baseUrl);
    if (search) u.pathname = "/" + search.replace(/^\/+/, "");
    const fGroups = new Map();
    const rfGroups = new Map();
    for (const f of dedupeFilters(filters)) {
      const target = RANGE_FACETS.has(f.facet) ? rfGroups : fGroups;
      if (!target.has(f.facet)) target.set(f.facet, []);
      target.get(f.facet).push(f.value);
    }
    const params = new URLSearchParams();
    const f = encodeGroups(fGroups);
    if (f) params.set("f", f);
    const rf = encodeGroups(rfGroups);
    if (rf) params.set("rf", rf);
    u.search = params.toString();
    return u.toString();
  },
};
