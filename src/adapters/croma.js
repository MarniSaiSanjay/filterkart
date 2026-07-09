// Croma adapter. Filters are colon-delimited inside a single `q` param
// (<term>:<sort>:<facet>:<value>...); results at /searchB, category pages at
// /<slug>/c/<id> whose path is preserved in `meta.path` (term can't derive it).
import { dedupeFilters, toURL } from "./base.js";

const CATEGORY = /\/([^/]+)\/c\/\d+/; // last slug before /c/<id>

export default {
  id: "croma",
  label: "Croma",

  matches(url) {
    return this.host(url) && (url.pathname.startsWith("/search") || CATEGORY.test(url.pathname));
  },

  host(url) {
    return /(^|\.)croma\.com$/.test(url.hostname);
  },

  parse(url) {
    const u = toURL(url);
    const q = u.searchParams.get("q") || "";
    const parts = q.split(":");
    // parts[0] = search term (empty on category pages), parts[1] = sort token,
    // then repeating facet/value pairs.
    let search = u.searchParams.get("text") || parts[0] || "";
    let meta;
    const cat = u.pathname.match(CATEGORY);
    if (cat) {
      meta = { path: u.pathname };
      if (!search) search = cat[1].replace(/-/g, " ");
    }
    const filters = [];
    for (let i = 2; i + 1 < parts.length; i += 2) {
      if (parts[i] && parts[i + 1]) filters.push({ facet: parts[i], value: parts[i + 1] });
    }
    return { search, filters: dedupeFilters(filters), meta };
  },

  build(baseUrl, search, filters, meta) {
    const u = toURL(baseUrl);
    const parts = [];
    if (meta && meta.path) {
      u.pathname = meta.path;
      parts.push(""); // empty term on category pages
    } else {
      u.pathname = "/searchB";
      parts.push(search || "");
    }
    parts.push("relevance");
    for (const f of dedupeFilters(filters)) parts.push(f.facet, f.value);
    const params = new URLSearchParams();
    params.set("q", parts.join(":"));
    if (!(meta && meta.path) && search) params.set("text", search);
    u.search = params.toString();
    return u.toString();
  },
};
