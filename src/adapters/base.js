// FilterKart site-adapter contract and shared helpers. An adapter is a plain
// object { id, label, matches(url), parse(url), build(baseUrl, search, filters, meta) }
// mapping one site's URL filter encoding to/from { facet, value } pairs (`meta`
// is optional adapter-private data). See docs/PROJECT.md "Adding a New Site".

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
