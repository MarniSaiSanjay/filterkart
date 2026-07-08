// Flipkart adapter.
// Filters are repeated `p[]` params, each value shaped `facets.<facet>[]=<value>`.
// In a live URL the inner `[]` and `=` are percent-encoded, so after
// URLSearchParams decoding a value looks like: facets.brand%5B%5D=Lenovo
// Search term is the `q=` param.
import { dedupeFilters, toURL } from "./base.js";

const INNER = /^facets\.(.+?)(?:%5B%5D|\[\])=(.*)$/i;

function parseInner(raw) {
  const m = INNER.exec(raw);
  if (!m) return null;
  let value = m[2];
  try {
    value = decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    // leave value as-is if it isn't valid percent-encoding
  }
  return { facet: m[1], value };
}

export default {
  id: "flipkart",
  label: "Flipkart",

  matches(url) {
    return this.host(url) && url.pathname.startsWith("/search");
  },

  host(url) {
    return /(^|\.)flipkart\.com$/.test(url.hostname);
  },

  parse(url) {
    const u = toURL(url);
    const search = u.searchParams.get("q") || "";
    const filters = [];
    for (const raw of u.searchParams.getAll("p[]")) {
      const f = parseInner(raw);
      if (f) filters.push(f);
    }
    return { search, filters: dedupeFilters(filters) };
  },

  build(baseUrl, search, filters) {
    const u = toURL(baseUrl);
    u.pathname = "/search";
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    for (const f of dedupeFilters(filters)) {
      params.append("p[]", `facets.${f.facet}%5B%5D=${encodeURIComponent(f.value)}`);
    }
    u.search = params.toString();
    return u.toString();
  },
};
