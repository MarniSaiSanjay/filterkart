// Tests for the adapter registry (src/core/registry.js): resolve + lookup.
import { setFile, test, assert, assertEqual } from "./harness.js";
import { validateAdapter, toURL, dedupeFilters } from "../src/adapters/base.js";
import { resolveAdapter, getAdapterById, ADAPTERS } from "../src/core/registry.js";

setFile("registry");

test("validateAdapter accepts a complete adapter", () => {
  const a = { id: "x", label: "X", matches() {}, parse() {}, build() {} };
  assertEqual(validateAdapter(a).id, "x");
});

test("validateAdapter rejects missing fields", () => {
  let threw = false;
  try {
    validateAdapter({ id: "x", label: "X", matches() {}, parse() {} });
  } catch {
    threw = true;
  }
  assert(threw, "should throw when build missing");
});

test("dedupeFilters removes duplicates, drops invalid", () => {
  const out = dedupeFilters([
    { facet: "brand", value: "HP" },
    { facet: "brand", value: "HP" },
    { facet: "brand", value: "Dell" },
    { facet: "brand" },
    null,
  ]);
  assertEqual(out, [
    { facet: "brand", value: "HP" },
    { facet: "brand", value: "Dell" },
  ]);
});

test("toURL accepts string and URL", () => {
  assertEqual(toURL("https://a.com/x").pathname, "/x");
  assertEqual(toURL(new URL("https://a.com/y")).pathname, "/y");
});

test("all registered adapters are valid", () => {
  assert(ADAPTERS.length === 7, "seven adapters registered");
});

test("resolveAdapter picks the right site", () => {
  assertEqual(resolveAdapter("https://www.amazon.in/s?k=laptop").id, "amazon");
  assertEqual(resolveAdapter("https://www.flipkart.com/search?q=laptop").id, "flipkart");
  assertEqual(resolveAdapter("https://www.myntra.com/sports-shoes").id, "myntra");
  assertEqual(resolveAdapter("https://www.ajio.com/search/?text=shoes").id, "ajio");
});

test("resolveAdapter returns null for unknown/invalid", () => {
  assertEqual(resolveAdapter("https://www.example.com/x"), null);
  assertEqual(resolveAdapter("not a url"), null);
});

test("getAdapterById works", () => {
  assertEqual(getAdapterById("ajio").label, "Ajio");
  assertEqual(getAdapterById("nope"), null);
});
