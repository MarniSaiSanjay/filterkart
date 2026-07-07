// Flipkart adapter. Filter encoding completed in WI-05.
// Filters live in repeated p[]=facets.<facet>[]=<value> params; search term is q=.
import { dedupeFilters } from "./base.js";

export default {
  id: "flipkart",
  label: "Flipkart",
  matches(url) {
    return /(^|\.)flipkart\.com$/.test(url.hostname) && url.pathname.startsWith("/search");
  },
  parse(_url) {
    return { search: "", filters: [] };
  },
  build(baseUrl, _search, filters) {
    dedupeFilters(filters);
    return baseUrl.toString();
  },
};
