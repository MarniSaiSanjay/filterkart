// Nykaa adapter. Filters are `<facet>_filter` params (comma-separated values);
// the category path (e.g. /makeup/lips/c/15) is preserved in `meta.path` since
// it can't be derived from the search term.
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
