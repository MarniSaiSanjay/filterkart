// FilterCart search matcher.
// Decides which saved presets apply to the current page by comparing search
// terms. Two swappable pieces:
//   - SearchNormalizer: term -> canonical token set (lowercase, drop stopwords &
//     gender/age modifiers, apply synonyms, singularize).
//   - SimilarityProvider: score two terms 0..1. Default is rule-based (Jaccard).
// A model-based provider can be dropped in later via setSimilarityProvider().

const STOPWORDS = new Set([
  "for", "the", "a", "an", "and", "with", "of", "in", "to", "by", "on", "best", "online",
]);

// Gender / age modifiers treated as interchangeable → dropped so "men shoes",
// "shoes boy", "footwear" all collapse to the same category.
const DROP = new Set([
  "men", "man", "mens", "women", "woman", "womens", "boy", "boys", "girl", "girls",
  "kid", "kids", "unisex", "gents", "ladies", "male", "female",
]);

const SYNONYMS = {
  footwear: "shoe", shoes: "shoe", shoe: "shoe", sneaker: "shoe", sneakers: "shoe",
  trainer: "shoe", trainers: "shoe",
  laptops: "laptop", laptop: "laptop", notebook: "laptop",
  mobiles: "mobile", mobile: "mobile", smartphone: "mobile", smartphones: "mobile",
  phone: "mobile", phones: "mobile",
};

function singularize(w) {
  return w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w;
}

function rawTokens(term) {
  return String(term || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Term -> sorted, de-duplicated canonical token array.
export function normalizeTokens(term) {
  const out = [];
  for (let w of rawTokens(term)) {
    if (STOPWORDS.has(w) || DROP.has(w)) continue;
    if (SYNONYMS[w]) {
      out.push(SYNONYMS[w]);
      continue;
    }
    w = singularize(w);
    out.push(SYNONYMS[w] || w);
  }
  return [...new Set(out)].sort();
}

// Term -> canonical string (tokens joined by space).
export function normalize(term) {
  return normalizeTokens(term).join(" ");
}

export function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export const ruleBasedProvider = {
  id: "rule-based",
  similarity(a, b) {
    return jaccard(normalizeTokens(a), normalizeTokens(b));
  },
};

let activeProvider = ruleBasedProvider;

export function setSimilarityProvider(provider) {
  if (!provider || typeof provider.similarity !== "function") {
    throw new Error("provider.similarity(a,b) required");
  }
  activeProvider = provider;
}

export function getSimilarityProvider() {
  return activeProvider;
}

// Rank presets by similarity of their saved search to the current search.
// Returns [{ preset, score }] sorted desc, filtered by threshold.
export function rankPresets(presets, currentSearch, opts = {}) {
  const threshold = opts.threshold ?? 0.5;
  const provider = opts.provider || activeProvider;
  return (presets || [])
    .map((preset) => ({
      preset,
      score: provider.similarity(currentSearch, preset.search || preset.canonicalCategory || ""),
    }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
