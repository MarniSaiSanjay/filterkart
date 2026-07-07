// Myntra adapter. Filter encoding completed in WI-07.
// Filters live in f= (facets joined by "::", values by ","); price in rf=; category in path.
import { dedupeFilters } from "./base.js";

export default {
  id: "myntra",
  label: "Myntra",
  matches(url) {
    return /(^|\.)myntra\.com$/.test(url.hostname);
  },
  parse(_url) {
    return { search: "", filters: [] };
  },
  build(baseUrl, _search, filters) {
    dedupeFilters(filters);
    return baseUrl.toString();
  },
};
