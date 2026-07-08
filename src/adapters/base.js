// FilterKart site-adapter contract and shared helpers.
//
// An adapter teaches FilterKart how one shopping site encodes filters in its URL.
// Each adapter is a plain object:
//
//   {
//     id: string,                          // stable site id, e.g. "amazon"
//     label: string,                       // human name, e.g. "Amazon"
//     matches(url: URL): boolean,          // is this a supported results page?
//     parse(url: URL): { search, filters, meta? } // pull out search term + filters
//     build(baseUrl: URL, search, filters, meta?): string  // produce a results URL
//   }
//
// `filters` is always an array of { facet, value } pairs. Adapters own the
// mapping between those pairs and their site's URL encoding. `meta` is optional
// adapter-private data (e.g. a category path) round-tripped from parse to build.

// Assert an object satisfies the adapter contract. Throws on violation.
export function validateAdapter(a) {
  const req = ["id", "label", "matches", "parse", "build"];
  for (const k of req) {
    if (a[k] === undefined || a[k] === null) {
      throw new Error(`adapter missing "${k}"`);
    }
  }
  for (const fn of ["matches", "parse", "build"]) {
    if (typeof a[fn] !== "function") throw new Error(`adapter.${fn} must be a function`);
  }
  return a;
}

// Normalize a URL-ish input into a URL object.
export function toURL(input) {
  return input instanceof URL ? input : new URL(input);
}

// De-duplicate an array of { facet, value } pairs (order-preserving).
export function dedupeFilters(filters) {
  const seen = new Set();
  const out = [];
  for (const f of filters || []) {
    if (!f || f.facet == null || f.value == null) continue;
    const key = f.facet + "\u0000" + f.value;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ facet: String(f.facet), value: String(f.value) });
  }
  return out;
}
