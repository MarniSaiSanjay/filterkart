import { setFile, test, assertEqual } from "./harness.js";
import flipkart from "../src/adapters/flipkart.js";
import amazon from "../src/adapters/amazon.js";
import myntra from "../src/adapters/myntra.js";
import ajio from "../src/adapters/ajio.js";

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

// ---- Myntra (WI-07) ----
// Real URL verified live: Brand:Nike,Puma,ADIDAS on /sports-shoes.
test("myntra.parse reads category from path and brands from f", () => {
  const url = "https://www.myntra.com/sports-shoes?f=Brand:Nike,Puma,ADIDAS";
  const { search, filters } = myntra.parse(new URL(url));
  assertEqual(search, "sports-shoes");
  assertEqual(filters, [
    { facet: "Brand", value: "Nike" },
    { facet: "Brand", value: "Puma" },
    { facet: "Brand", value: "ADIDAS" },
  ]);
});

test("myntra.parse handles f (::) and rf (Price) together", () => {
  const url =
    "https://www.myntra.com/fwdgenzcollection?f=" +
    encodeURIComponent("Categories:Dresses::Gender:men women,women") +
    "&rf=" +
    encodeURIComponent("Price:0.0_600.0_0.0 TO 600.0");
  const { search, filters } = myntra.parse(new URL(url));
  assertEqual(search, "fwdgenzcollection");
  assertEqual(filters, [
    { facet: "Categories", value: "Dresses" },
    { facet: "Gender", value: "men women" },
    { facet: "Gender", value: "women" },
    { facet: "Price", value: "0.0_600.0_0.0 TO 600.0" },
  ]);
});

test("myntra.build routes Price to rf and round-trips", () => {
  const filters = [
    { facet: "Brand", value: "Nike" },
    { facet: "Brand", value: "Puma" },
    { facet: "Price", value: "0.0_600.0_0.0 TO 600.0" },
  ];
  const built = myntra.build(new URL("https://www.myntra.com/old"), "running-shoes", filters);
  assertEqual(built.includes("rf="), true);
  const { search, filters: out } = myntra.parse(new URL(built));
  assertEqual(search, "running-shoes");
  assertEqual(out, filters);
});

// ---- Ajio (WI-08) ----
// Real URL verified live: accumulating :genderfilter pairs in query=.
test("ajio.parse reads text + query key/value pairs (skips sort token)", () => {
  const url =
    "https://www.ajio.com/search/?query=" +
    encodeURIComponent(":relevance:genderfilter:Women:genderfilter:Men") +
    "&text=" +
    encodeURIComponent("running shoes");
  const { search, filters } = ajio.parse(new URL(url));
  assertEqual(search, "running shoes");
  assertEqual(filters, [
    { facet: "genderfilter", value: "Women" },
    { facet: "genderfilter", value: "Men" },
  ]);
});

test("ajio.build emits :relevance prefix and round-trips", () => {
  const filters = [
    { facet: "brand", value: "Nike" },
    { facet: "genderfilter", value: "Men" },
  ];
  const built = ajio.build(new URL("https://www.ajio.com/search/"), "shoes", filters);
  assertEqual(built.includes("relevance"), true);
  const { search, filters: out } = ajio.parse(new URL(built));
  assertEqual(search, "shoes");
  assertEqual(out, filters);
});

// Live drift (2026): /search/?text= redirects to /s/rd-<term>-<ids>?query=...
// The search term moves into the path slug and there is no text= param.
test("ajio.matches accepts the /s/ results path", () => {
  assertEqual(ajio.matches(new URL("https://www.ajio.com/s/rd-shoes-5488-78681?query=:relevance")), true);
  assertEqual(ajio.matches(new URL("https://www.ajio.com/search/?text=shoes")), true);
});

test("ajio.parse extracts the search term from the /s/rd- path slug", () => {
  const url =
    "https://www.ajio.com/s/rd-running-shoes-5488-78681?query=" +
    encodeURIComponent(":relevance:genderfilter:Men") +
    "&classifier=intent";
  const { search, filters } = ajio.parse(new URL(url));
  assertEqual(search, "running shoes");
  assertEqual(filters, [{ facet: "genderfilter", value: "Men" }]);
});
