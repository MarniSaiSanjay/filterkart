// FilterKart search matcher.
// Decides which saved presets apply to the current page by comparing search
// terms. Two swappable pieces:
//   - normalize: term -> canonical token set (lowercase, drop stopwords &
//     gender/age modifiers, apply synonyms, singularize).
//   - SimilarityProvider: score two terms 0..1. Default is rule-based.
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

// --- Fuzzy token matching (typo tolerance) -----------------------------------
// Exact canonical tokens match first; otherwise score two tokens with the
// Jaro-Winkler string metric. Unlike raw Levenshtein, it keeps genuinely
// different short words ("cable"/"table") below real typos ("mobilsss"/"mobile").
const TOKEN_FUZZY_MIN = 0.88; // min Jaro-Winkler to accept two tokens as a match
const TOKEN_FUZZY_MINLEN = 4; // only fuzz tokens this long (avoids short-word noise)

// Jaro similarity: (m/|a| + m/|b| + (m - t)/m) / 3, where m = matching chars
// within a sliding window and t = half the number of transpositions.
function jaro(a, b) {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const aMatched = new Array(la).fill(false);
  const bMatched = new Array(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(i + window + 1, lb);
    for (let j = lo; j < hi; j++) {
      if (!bMatched[j] && a[i] === b[j]) {
        aMatched[i] = true;
        bMatched[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < la; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (matches / la + matches / lb + (matches - transpositions) / matches) / 3;
}

// Jaro-Winkler: boost the Jaro score for a shared prefix (up to 4 chars, p=0.1).
function jaroWinkler(a, b) {
  const j = jaro(a, b);
  let prefix = 0;
  const max = Math.min(4, a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  return j + prefix * 0.1 * (1 - j);
}

// Similarity of two single tokens: 1 if identical, else the Jaro-Winkler score
// once it clears TOKEN_FUZZY_MIN (0 below that, or when a token is too short to
// safely fuzz). Fuzzy hits stay < 1 so they render as partial rather than exact.
function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < TOKEN_FUZZY_MINLEN) return 0;
  const s = jaroWinkler(a, b);
  return s >= TOKEN_FUZZY_MIN ? s : 0;
}

// Soft Jaccard over token arrays: greedily pairs each A-token with its best
// unused B-token by tokenSimilarity, summing the (possibly fractional) weights.
// Reduces exactly to jaccard() when every match is an exact token match.
export function softSimilarity(aTokens, bTokens) {
  const A = [...new Set(aTokens)];
  const B = [...new Set(bTokens)];
  if (A.length === 0 && B.length === 0) return 1;
  if (A.length === 0 || B.length === 0) return 0;
  const used = new Array(B.length).fill(false);
  let matched = 0;
  for (const a of A) {
    let best = 0;
    let bestJ = -1;
    for (let j = 0; j < B.length; j++) {
      if (used[j]) continue;
      const s = tokenSimilarity(a, B[j]);
      if (s > best) {
        best = s;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && best > 0) {
      matched += best;
      used[bestJ] = true;
    }
  }
  return matched / (A.length + B.length - matched);
}

export const ruleBasedProvider = {
  id: "rule-based",
  similarity(a, b) {
    return softSimilarity(normalizeTokens(a), normalizeTokens(b));
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
