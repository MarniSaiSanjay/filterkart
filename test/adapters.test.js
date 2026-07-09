// Round-trip tests for each site adapter (parse/build) on real captured URLs.
import { setFile, test, assertEqual } from "./harness.js";
import flipkart from "../src/adapters/flipkart.js";
import amazon from "../src/adapters/amazon.js";
import myntra from "../src/adapters/myntra.js";
import ajio from "../src/adapters/ajio.js";
import nykaa from "../src/adapters/nykaa.js";
import meesho from "../src/adapters/meesho.js";
import croma from "../src/adapters/croma.js";

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

// ---- Nykaa ----
// Real URL captured live: search redirects to a category page (/makeup/lips/c/15)
// and filters are <facet>_filter params with comma-separated values.
test("nykaa.parse reads category path (meta) and comma-split _filter params", () => {
  const url =
    "https://www.nykaa.com/makeup/lips/c/15?page_no=1&sort=popularity&brand_filter=27256,8861&price_range_filter=500-999";
  const { search, filters, meta } = nykaa.parse(new URL(url));
  assertEqual(search, "makeup lips");
  assertEqual(meta, { path: "/makeup/lips/c/15" });
  assertEqual(filters, [
    { facet: "brand_filter", value: "27256" },
    { facet: "brand_filter", value: "8861" },
    { facet: "price_range_filter", value: "500-999" },
  ]);
});

test("nykaa.matches accepts category and search-result pages only", () => {
  assertEqual(nykaa.matches(new URL("https://www.nykaa.com/makeup/lips/c/15")), true);
  assertEqual(nykaa.matches(new URL("https://www.nykaa.com/search/result/?q=lipstick")), true);
  assertEqual(nykaa.matches(new URL("https://www.nykaa.com/")), false);
});

test("nykaa.build restores the category path from meta and round-trips", () => {
  const filters = [
    { facet: "brand_filter", value: "27256" },
    { facet: "brand_filter", value: "8861" },
    { facet: "price_range_filter", value: "500-999" },
  ];
  const meta = { path: "/makeup/lips/c/15" };
  const built = nykaa.build(new URL("https://www.nykaa.com/search/result/"), "makeup lips", filters, meta);
  assertEqual(built.includes("/makeup/lips/c/15"), true);
  const out = nykaa.parse(new URL(built));
  assertEqual(out.meta, meta);
  assertEqual(out.filters, filters);
});

// ---- Meesho ----
// Real URL captured live: each value is a <Facet>[i][id]/[label]/[payload] triple;
// payload is base64({field,op,value}). id/payload are REQUIRED to filter, so they
// live in adapter-private `meta.encoded` (keyed facet+value) which storage keeps.
test("meesho.parse puts {facet,value} in filters and id/payload in meta", () => {
  const url =
    "https://www.meesho.com/search?q=kurti" +
    "&Gender[0][id]=443&Gender[0][label]=Women" +
    "&Gender[0][payload]=eyJmaWVsZCI6ImxhYmVscy45Iiwib3AiOiJpbiIsInZhbHVlIjoiNDQzIn0%3D";
  const { search, filters, meta } = meesho.parse(new URL(url));
  assertEqual(search, "kurti");
  assertEqual(filters, [{ facet: "Gender", value: "Women" }]);
  assertEqual(meta, {
    encoded: {
      ["Gender\u0000Women"]: {
        id: "443",
        payload: "eyJmaWVsZCI6ImxhYmVscy45Iiwib3AiOiJpbiIsInZhbHVlIjoiNDQzIn0=",
      },
    },
  });
});

test("meesho.matches accepts /search results pages only", () => {
  assertEqual(meesho.matches(new URL("https://www.meesho.com/search?q=kurti")), true);
  assertEqual(meesho.matches(new URL("https://www.meesho.com/")), false);
});

test("meesho.build restores id/payload from meta and round-trips", () => {
  const filters = [
    { facet: "Gender", value: "Women" },
    { facet: "Color", value: "Red" },
    { facet: "Color", value: "Blue" },
  ];
  const meta = {
    encoded: {
      ["Gender\u0000Women"]: { id: "443", payload: "eyJhIjoxfQ==" },
      ["Color\u0000Red"]: { id: "12", payload: "eyJiIjoyfQ==" },
      ["Color\u0000Blue"]: { id: "34", payload: "eyJjIjozfQ==" },
    },
  };
  const built = meesho.build(new URL("https://www.meesho.com/search"), "kurti", filters, meta);
  assertEqual(built.includes("Color") && built.includes("%5B1%5D"), true);
  assertEqual(built.includes("payload"), true);
  const { search, filters: outFilters, meta: outMeta } = meesho.parse(new URL(built));
  assertEqual(search, "kurti");
  assertEqual(outFilters, filters);
  assertEqual(outMeta, meta);
});

// ---- Croma ----
// Real URLs captured live (user-provided): colon-delimited `q` chain
// term:sort:facet:value:... ; search at /searchB (+ text=), category at /c/<id>.
test("croma.parse reads the term + facet chain from a real search URL", () => {
  const url =
    "https://www.croma.com/searchB?q=" +
    encodeURIComponent(
      "mobile:relevance:lower_categories:95:price_group:National_50,001 - 60,000:SG-M&TProcessorDetails-ProcessorBrand:Google"
    ) +
    "&text=mobile";
  const { search, filters, meta } = croma.parse(new URL(url));
  assertEqual(search, "mobile");
  assertEqual(meta, undefined);
  assertEqual(filters, [
    { facet: "lower_categories", value: "95" },
    { facet: "price_group", value: "National_50,001 - 60,000" },
    { facet: "SG-M&TProcessorDetails-ProcessorBrand", value: "Google" },
  ]);
});

test("croma.matches accepts /search and /c/ category pages only", () => {
  assertEqual(croma.matches(new URL("https://www.croma.com/searchB?q=mobile%3Arelevance")), true);
  assertEqual(croma.matches(new URL("https://www.croma.com/campaign/x/c/7070?q=%3Arelevance")), true);
  assertEqual(croma.matches(new URL("https://www.croma.com/")), false);
});

test("croma.build round-trips a search preset through parse", () => {
  const filters = [
    { facet: "price_group", value: "National_50,001 - 60,000" },
    { facet: "SG-M&TProcessorDetails-ProcessorBrand", value: "Google" },
  ];
  const built = croma.build(new URL("https://www.croma.com/searchB"), "mobile", filters);
  assertEqual(built.includes("text=mobile"), true);
  const { search, filters: out, meta } = croma.parse(new URL(built));
  assertEqual(search, "mobile");
  assertEqual(meta, undefined);
  assertEqual(out, filters);
});

test("croma.parse reads category path (meta) and round-trips via build", () => {
  const url =
    "https://www.croma.com/campaign/top-selling-croma-refrigerators/c/7070?q=" +
    encodeURIComponent(":relevance:delivery_mode:Home Delivery:SG-RefrigeratorCategory-IdealFamilySize:Family of 3");
  const { search, filters, meta } = croma.parse(new URL(url));
  assertEqual(meta, { path: "/campaign/top-selling-croma-refrigerators/c/7070" });
  assertEqual(search, "top selling croma refrigerators");
  assertEqual(filters, [
    { facet: "delivery_mode", value: "Home Delivery" },
    { facet: "SG-RefrigeratorCategory-IdealFamilySize", value: "Family of 3" },
  ]);
  const built = croma.build(new URL("https://www.croma.com/searchB"), search, filters, meta);
  assertEqual(built.includes("/c/7070"), true);
  const out = croma.parse(new URL(built));
  assertEqual(out.meta, meta);
  assertEqual(out.filters, filters);
});
