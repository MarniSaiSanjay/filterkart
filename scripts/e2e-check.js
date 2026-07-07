// Ad-hoc end-to-end check: for a real result URL from each site, parse the
// filters, rebuild the URL, and re-parse — the filter set must survive the
// round-trip. Mirrors the save -> apply flow. Not part of `npm test`.
import { resolveAdapter } from "../src/core/registry.js";

const CASES = {
  flipkart:
    "https://www.flipkart.com/search?q=laptop&p%5B%5D=facets.brand%255B%255D%3DLenovo&p%5B%5D=facets.brand%255B%255D%3DHP",
  amazon:
    "https://www.amazon.in/s?k=laptop&rh=" +
    encodeURIComponent("p_123:308445|391242,p_36:2850000-6100000"),
  myntra: "https://www.myntra.com/sports-shoes?f=Brand%3ANike%2CPuma&rf=Price%3A1000_5000",
  ajio:
    "https://www.ajio.com/search/?text=shoes&query=" +
    encodeURIComponent(":relevance:brand:Nike:brand:Puma"),
};

let failed = 0;
for (const [site, url] of Object.entries(CASES)) {
  const adapter = resolveAdapter(url);
  if (!adapter || adapter.id !== site) {
    console.error(`FAIL ${site}: resolveAdapter -> ${adapter && adapter.id}`);
    failed++;
    continue;
  }
  const first = adapter.parse(new URL(url));
  const rebuilt = adapter.build(new URL(url), first.search, first.filters);
  const second = adapter.parse(new URL(rebuilt));

  const a = JSON.stringify([...first.filters].sort((x, y) => (x.facet + x.value).localeCompare(y.facet + y.value)));
  const b = JSON.stringify([...second.filters].sort((x, y) => (x.facet + x.value).localeCompare(y.facet + y.value)));
  const ok = a === b && first.search === second.search && first.filters.length > 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${site}: search="${first.search}" filters=${first.filters.length}`);
  if (!ok) {
    console.error(`   before: ${a}\n   after:  ${b}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
