// Ajio adapter.
// Filters are encoded inside the `query=` param as colon-separated key:value
// pairs, prefixed by the sort token (default `relevance`):
//   query=:relevance:genderfilter:Women:genderfilter:Men
// The search term is either the `text=` param (classic /search/ URL) or, on the
// redirected results page, the path slug: /s/rd-<term>-<numericIds> (e.g.
// /s/rd-running-shoes-5488-78681 -> "running shoes").
import { dedupeFilters, toURL } from "./base.js";

// Extract the search term from a /s/rd-<slug>-<ids> results path.
function searchFromPath(pathname) {
  const m = pathname.match(/^\/s\/(?:rd-)?(.+?)\/?$/);
  if (!m) return "";
  const words = [];
  for (const seg of m[1].split("-")) {
    if (/^\d+$/.test(seg)) break; // stop at the first numeric id segment
    words.push(seg);
  }
  return words.join(" ");
}

export default {
  id: "ajio",
  label: "Ajio",

  matches(url) {
    return (
      this.host(url) &&
      (url.pathname.startsWith("/search") || url.pathname.startsWith("/s/"))
    );
  },

  host(url) {
    return /(^|\.)ajio\.com$/.test(url.hostname);
  },

  parse(url) {
    const u = toURL(url);
    const search = u.searchParams.get("text") || searchFromPath(u.pathname);
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
