import { setFile, test, assert, assertEqual } from "./harness.js";
import {
  normalize,
  normalizeTokens,
  jaccard,
  ruleBasedProvider,
  rankPresets,
  setSimilarityProvider,
  getSimilarityProvider,
} from "../src/core/matcher.js";

setFile("matcher");

test("normalize collapses the shoe family to the same canonical", () => {
  const expected = "shoe";
  assertEqual(normalize("men shoes"), expected);
  assertEqual(normalize("shoes"), expected);
  assertEqual(normalize("shoes men"), expected);
  assertEqual(normalize("shoes boy"), expected);
  assertEqual(normalize("footwear boy"), expected);
});

test("normalizeTokens drops stopwords and sorts", () => {
  assertEqual(normalizeTokens("Best Laptops for the Office"), ["laptop", "office"]);
});

test("similar shoe searches score 1.0", () => {
  assertEqual(ruleBasedProvider.similarity("men shoes", "footwear boy"), 1);
});

test("shoes vs laptop score 0", () => {
  assertEqual(ruleBasedProvider.similarity("shoes", "laptop"), 0);
});

test("partial overlap scores between 0 and 1", () => {
  const s = ruleBasedProvider.similarity("laptop", "gaming laptop");
  assert(s > 0 && s < 1, "expected partial score, got " + s);
  assertEqual(s, 0.5);
});

test("jaccard handles empty sets", () => {
  assertEqual(jaccard([], []), 1);
  assertEqual(jaccard(["a"], []), 0);
});

test("rankPresets returns similar presets sorted, filtered by threshold", () => {
  const presets = [
    { id: "1", search: "running shoes" },
    { id: "2", search: "laptop" },
    { id: "3", search: "footwear for men" },
  ];
  const ranked = rankPresets(presets, "shoes boy", { threshold: 0.5 });
  const ids = ranked.map((r) => r.preset.id);
  assert(ids.includes("1") && ids.includes("3"), "shoe presets matched");
  assert(!ids.includes("2"), "laptop excluded");
});

test("similarity provider is swappable", () => {
  const original = getSimilarityProvider();
  setSimilarityProvider({ id: "always1", similarity: () => 1 });
  assertEqual(getSimilarityProvider().id, "always1");
  const ranked = rankPresets([{ id: "x", search: "anything" }], "zzz", { threshold: 0.9 });
  assertEqual(ranked.length, 1);
  setSimilarityProvider(original);
  assertEqual(getSimilarityProvider().id, "rule-based");
});
