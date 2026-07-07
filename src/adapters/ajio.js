// Ajio adapter.
// Filters are encoded inside the `query=` param as colon-separated key:value
// pairs, prefixed by the sort token (default `relevance`):
//   query=:relevance:genderfilter:Women:genderfilter:Men
// Search term is the `text=` param.
import { dedupeFilters, toURL } from "./base.js";

export default {
  id: "ajio",
  label: "Ajio",

  matches(url) {
    return /(^|\.)ajio\.com$/.test(url.hostname) && url.pathname.startsWith("/search");
  },

  parse(url) {
    const u = toURL(url);
    const search = u.searchParams.get("text") || "";
    const query = u.searchParams.get("query") || "";
    const parts = query.split(":").filter((s) => s !== "");
    // parts[0] is the sort token (e.g. "relevance"); the rest are key/value pairs.
    const filters = [];
    for (let i = 1; i + 1 < parts.length; i += 2) {
      filters.push({ facet: parts[i], value: parts[i + 1] });
    }
    return { search, filters: dedupeFilters(filters) };
  },

  build(baseUrl, search, filters) {
    const u = toURL(baseUrl);
    u.pathname = "/search/";
    let query = ":relevance";
    for (const f of dedupeFilters(filters)) {
      query += `:${f.facet}:${f.value}`;
    }
    const params = new URLSearchParams();
    params.set("query", query);
    if (search) params.set("text", search);
    u.search = params.toString();
    return u.toString();
  },
};
