// Amazon adapter. Filter encoding completed in WI-06.
// Filters live in a single rh= param; search term is k=.
import { dedupeFilters } from "./base.js";

export default {
  id: "amazon",
  label: "Amazon",
  matches(url) {
    return /(^|\.)amazon\.in$/.test(url.hostname) && url.pathname.startsWith("/s");
  },
  parse(_url) {
    return { search: "", filters: [] };
  },
  build(baseUrl, _search, filters) {
    dedupeFilters(filters);
    return baseUrl.toString();
  },
};
