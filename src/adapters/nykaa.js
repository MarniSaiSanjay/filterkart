// Nykaa adapter.
// A search (e.g. ?q=lipstick) redirects to a category page whose path carries the
// category id: /makeup/lips/c/15. Filters are `<facet>_filter` query params with
// comma-separated values, e.g. brand_filter=27256,8861&price_range_filter=500-999.
// The category path can't be derived from the search term, so it is preserved in
// `meta.path` for faithful reconstruction from the manager / cross-site apply.
import { dedupeFilters, toURL } from "./base.js";

const CATEGORY = /^\/(.+)\/c\/\d+/; // captures the slug before /c/<id>

export default {
  id: "nykaa",
  label: "Nykaa",

  matches(url) {
    return this.host(url) && (CATEGORY.test(url.pathname) || url.pathname.startsWith("/search/result"));
  },

  host(url) {
    return /(^|\.)nykaa\.com$/.test(url.hostname);
  },

  parse(url) {
    const u = toURL(url);
    let search = u.searchParams.get("q") || "";
    let meta;
    const cat = u.pathname.match(CATEGORY);
    if (cat) {
      if (!search) search = cat[1].split("/").join(" ");
      meta = { path: u.pathname };
    }
    const filters = [];
    for (const [key, val] of u.searchParams) {
      if (!key.endsWith("_filter") || !val) continue;
      for (const v of val.split(",")) {
        if (v) filters.push({ facet: key, value: v });
      }
    }
    return { search, filters: dedupeFilters(filters), meta };
  },

  build(baseUrl, search, filters, meta) {
    const u = toURL(baseUrl);
    const params = new URLSearchParams();
    if (meta && meta.path) {
      u.pathname = meta.path;
    } else {
      u.pathname = "/search/result/";
      if (search) params.set("q", search);
    }
    const groups = new Map();
    for (const f of dedupeFilters(filters)) {
      if (!groups.has(f.facet)) groups.set(f.facet, []);
      groups.get(f.facet).push(f.value);
    }
    for (const [k, vs] of groups) params.set(k, vs.join(","));
    u.search = params.toString();
    return u.toString();
  },
};
