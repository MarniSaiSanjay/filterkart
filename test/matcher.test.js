import { setFile, test, assert, assertEqual } from "./harness.js";
import {
  normalize,
  normalizeTokens,
  ruleBasedProvider,
  rankPresets,
  setSimilarityProvider,
  getSimilarityProvider,
} from "../src/similarity/matcher.js";

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

test("marketing/filler words are dropped so single-token presets still match", () => {
  // Reported case: preset "mobiles"/"mobil" vs search "mobile new".
  assertEqual(normalizeTokens("mobile new"), ["mobile"]);
  assertEqual(ruleBasedProvider.similarity("mobile new", "mobiles"), 1);
  assert(
    ruleBasedProvider.similarity("mobile new", "mobil") >= 0.6,
    "typo'd preset 'mobil' should still match 'mobile new'"
  );
  const presets = [{ id: "1", search: "mobiles" }, { id: "2", search: "mobil" }];
  const ids = rankPresets(presets, "mobile new", { threshold: 0.6 }).map((r) => r.preset.id);
  assert(ids.includes("1") && ids.includes("2"), "both mobile presets matched");
});

test("stacked filler words collapse to the category", () => {
  assertEqual(normalize("best cheap branded new shoes online"), "shoe");
});

test("similar shoe searches score 1.0", () => {
  assertEqual(ruleBasedProvider.similarity("men shoes", "footwear boy"), 1);
});

test("shoes vs laptop score 0", () => {
  assertEqual(ruleBasedProvider.similarity("shoes", "laptop"), 0);
});

test("refined query still matches its broad category (containment)", () => {
  // "gaming laptop" fully contains "laptop" -> should score high, not 0.5.
  const s = ruleBasedProvider.similarity("laptop", "gaming laptop");
  assert(s > 0.6 && s < 1, "expected high partial score, got " + s);
  // Real refinement patterns that used to fall below the 0.6 threshold.
  for (const [a, b] of [
    ["samsung mobile", "mobile"],
    ["red kurta", "kurta"],
    ["bluetooth speaker", "speaker"],
    ["apple iphone 15", "iphone"],
  ]) {
    assert(ruleBasedProvider.similarity(a, b) >= 0.6, `${a} ~ ${b} should match`);
  }
});

test("accessories do not match the product they attach to", () => {
  for (const [a, b] of [
    ["mobile cover", "mobile"],
    ["phone case", "mobile"],
    ["laptop bag", "laptop"],
    ["watch strap", "watch"],
    ["tv stand", "television"],
    ["laptop charger", "laptop"],
  ]) {
    assertEqual(ruleBasedProvider.similarity(a, b), 0);
  }
  // but the same accessory still matches itself
  assert(ruleBasedProvider.similarity("mobile cover", "phone cover") >= 0.6, "cover ~ cover matches");
});

test("unrelated multi-word searches sharing one token stay unmatched", () => {
  assert(ruleBasedProvider.similarity("shoe rack", "running shoe") < 0.6, "shoe rack != running shoe");
  assertEqual(ruleBasedProvider.similarity("mobile", "shoes"), 0);
});

test("expanded synonyms collapse common category variants", () => {
  assertEqual(ruleBasedProvider.similarity("notebook", "laptop"), 1);
  assertEqual(ruleBasedProvider.similarity("kurti", "kurta"), 1);
});

test("Indian apparel out-of-vocabulary terms collapse to a canonical", () => {
  assertEqual(ruleBasedProvider.similarity("sari", "saree"), 1);
  assertEqual(ruleBasedProvider.similarity("lehnga", "lehenga"), 1);
  assertEqual(ruleBasedProvider.similarity("ghagra", "lehenga"), 1);
  assertEqual(ruleBasedProvider.similarity("chunni", "dupatta"), 1);
  assertEqual(ruleBasedProvider.similarity("sherwanis", "sherwani"), 1);
  assertEqual(ruleBasedProvider.similarity("churidar", "salwar"), 1);
  assertEqual(ruleBasedProvider.similarity("jeggins", "jeggings"), 1);
});

test("word vectors match cross-word synonyms without a synonym table", () => {
  for (const [a, b] of [
    ["sofa", "couch"],
    ["television", "tv"],
    ["trousers", "pants"],
    ["fridge", "refrigerator"],
    ["earbuds", "earphones"],
  ]) {
    assert(ruleBasedProvider.similarity(a, b) >= 0.6, `${a} ~ ${b} should match semantically`);
  }
  // Unrelated categories stay apart (cosine below SEM_SIM_MIN -> 0).
  assertEqual(ruleBasedProvider.similarity("sofa", "laptop"), 0);
  assertEqual(ruleBasedProvider.similarity("television", "shoe"), 0);
  assertEqual(ruleBasedProvider.similarity("fridge", "shirt"), 0);
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
