// Ajio adapter. Filter encoding completed in WI-08.
// Filters live in query=:relevance:<key>:<value>:… ; search term is text=.
import { dedupeFilters } from "./base.js";

export default {
  id: "ajio",
  label: "Ajio",
  matches(url) {
    return /(^|\.)ajio\.com$/.test(url.hostname) && url.pathname.startsWith("/search");
  },
  parse(_url) {
    return { search: "", filters: [] };
  },
  build(baseUrl, _search, filters) {
    dedupeFilters(filters);
    return baseUrl.toString();
  },
};
