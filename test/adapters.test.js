import { setFile, test, assertEqual } from "./harness.js";
import flipkart from "../src/adapters/flipkart.js";
import amazon from "../src/adapters/amazon.js";

setFile("adapters");

// ---- Flipkart (WI-05) ----
// Real URL captured live: processor "7c Gen 2".
test("flipkart.parse extracts search + filter from live URL", () => {
  const url =
    "https://www.flipkart.com/search?q=laptop&p%5B%5D=facets.processor%255B%255D%3D7c%2BGen%2B2";
  const { search, filters } = flipkart.parse(new URL(url));
  assertEqual(search, "laptop");
  assertEqual(filters, [{ facet: "processor", value: "7c Gen 2" }]);
});

test("flipkart.build round-trips through parse", () => {
  const built = flipkart.build(new URL("https://www.flipkart.com/"), "laptop", [
    { facet: "brand", value: "Lenovo" },
    { facet: "rating", value: "4★ & above" },
  ]);
  const { search, filters } = flipkart.parse(new URL(built));
  assertEqual(search, "laptop");
  assertEqual(filters, [
    { facet: "brand", value: "Lenovo" },
    { facet: "rating", value: "4★ & above" },
  ]);
});

test("flipkart.build supports applying preset to a new search term", () => {
  const built = flipkart.build(new URL("https://www.flipkart.com/search?q=old"), "gaming laptop", [
    { facet: "brand", value: "ASUS" },
  ]);
  const { search, filters } = flipkart.parse(new URL(built));
  assertEqual(search, "gaming laptop");
  assertEqual(filters, [{ facet: "brand", value: "ASUS" }]);
});

// ---- Amazon (WI-06) ----
// Real URL verified live: HP|Lenovo brands + price band.
test("amazon.parse splits rh into per-value filters", () => {
  const url =
    "https://www.amazon.in/s?k=laptop&rh=" +
    encodeURIComponent("p_123:308445|391242,p_36:2850000-6100000");
  const { search, filters } = amazon.parse(new URL(url));
  assertEqual(search, "laptop");
  assertEqual(filters, [
    { facet: "p_123", value: "308445" },
    { facet: "p_123", value: "391242" },
    { facet: "p_36", value: "2850000-6100000" },
  ]);
});

test("amazon.build groups values per facet and round-trips", () => {
  const built = amazon.build(new URL("https://www.amazon.in/"), "laptop", [
    { facet: "p_123", value: "308445" },
    { facet: "p_123", value: "391242" },
    { facet: "p_36", value: "2850000-6100000" },
  ]);
  const { search, filters } = amazon.parse(new URL(built));
  assertEqual(search, "laptop");
  assertEqual(filters, [
    { facet: "p_123", value: "308445" },
    { facet: "p_123", value: "391242" },
    { facet: "p_36", value: "2850000-6100000" },
  ]);
});
