// FilterKart search matcher: decides which saved presets apply to the current
// page. normalize() turns a term into canonical tokens; a SimilarityProvider
// scores two terms 0..1. Token matching is layered: exact -> Jaro-Winkler typo
// -> word-vector meaning. Swap the provider via setSimilarityProvider().
import { wordCosine } from "./vectors.js";

// Marketing/filler words that carry no category meaning ("mobile new", "cheap
// branded shoes"), dropped before matching. Plurals are explicit (runs before
// singularize()).
const STOPWORDS = new Set([
  // grammatical
  "for", "the", "a", "an", "and", "with", "of", "in", "to", "by", "on",
  // quality / newness descriptors
  "new", "latest", "best", "top", "good", "great", "genuine", "original",
  "authentic", "branded", "premium", "luxury", "deluxe", "classic", "quality",
  "certified", "official", "better", "popular", "bestseller", "bestsellers",
  "special", "upgraded", "high", "low",
  // price / offer
  "cheap", "cheapest", "affordable", "budget", "sale", "discount", "discounts",
  "discounted", "offer", "offers", "deal", "deals", "lowest", "cost", "value",
  "price", "prices", "rated", "rating", "ratings",
  // shopping intent
  "buy", "shop", "shopping", "online", "order", "store", "purchase", "get",
  "review", "reviews", "all",
]);

// Gender / age modifiers treated as interchangeable → dropped so "men shoes",
// "shoes boy", "footwear" all collapse to the same category.
const DROP = new Set([
  "men", "man", "mens", "women", "woman", "womens", "boy", "boys", "girl", "girls",
  "kid", "kids", "unisex", "gents", "ladies", "male", "female",
]);

// Accessory words: an "X accessory" (phone case, laptop bag) is a different
// product from "X", so a term carrying one must not match a term without it.
// Singular form (checked after singularize()).
const ACCESSORY = new Set([
  "cover", "case", "pouch", "sleeve", "skin", "guard", "protector", "screenguard",
  "rack", "stand", "mount", "holder", "strap", "band", "charger", "cable",
  "tripod", "bag",
]);

// Synonym safety net for what word-vectors DON'T cover: canonical head-noun
// merges, pairs GloVe under-rates (laptop~notebook), and Indian apparel GloVe
// barely knows or lacks entirely. Keys match before and after singularize().
const SYNONYMS = {
  // footwear -> single canonical (also strips attribute words down to "shoe")
  footwear: "shoe", shoes: "shoe", shoe: "shoe", sneaker: "shoe", sneakers: "shoe",
  trainer: "shoe", trainers: "shoe",
  // computing / phones (vectors under-rate laptop~notebook, so keep explicit)
  laptops: "laptop", laptop: "laptop", notebook: "laptop", notebooks: "laptop",
  mobiles: "mobile", mobile: "mobile", smartphone: "mobile", smartphones: "mobile",
  phone: "mobile", phones: "mobile",
  // Indian apparel that GloVe barely covers (or is fully out-of-vocabulary)
  kurti: "kurta", kurtis: "kurta", kurta: "kurta", kurtas: "kurta",
  saree: "saree", sarees: "saree", sari: "saree", saris: "saree",
  lehenga: "lehenga", lehengas: "lehenga", lehnga: "lehenga", lehngas: "lehenga",
  ghagra: "lehenga", chaniya: "lehenga",
  dupatta: "dupatta", dupattas: "dupatta", chunni: "dupatta", chunnis: "dupatta",
  odhni: "dupatta",
  sherwani: "sherwani", sherwanis: "sherwani", sherwaani: "sherwani",
  salwar: "salwar", salwars: "salwar", shalwar: "salwar", churidar: "salwar",
  churidars: "salwar", palazzo: "salwar", palazzos: "salwar",
  jeggings: "jegging", jegging: "jegging", jeggins: "jegging", jeggies: "jegging",
  // activity terms (vectors see these as related, not substitutable)
  running: "sport", sports: "sport", sport: "sport",
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

const TOKEN_FUZZY_MIN = 0.88;    // min Jaro-Winkler to accept two tokens as a match
const TOKEN_FUZZY_MINLEN = 4;    // only fuzz tokens this long (avoids short-word noise)
const SEM_SIM_MIN = 0.6;         // min word-vector cosine to accept two words as synonyms

// Jaro similarity: matching chars within a sliding window, minus transpositions.
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

// Jaro-Winkler: boost Jaro for a shared prefix (up to 4 chars, p=0.1).
function jaroWinkler(a, b) {
  const j = jaro(a, b);
  let prefix = 0;
  const max = Math.min(4, a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  return j + prefix * 0.1 * (1 - j);
}

// Similarity of two tokens 0..1, tried in order of precision: exact -> typo
// (Jaro-Winkler) -> meaning (word-vector cosine). Fuzzy/semantic hits stay < 1
// so they read as partial and the caller's threshold makes the final call.
function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= TOKEN_FUZZY_MINLEN) {
    const jw = jaroWinkler(a, b);
    if (jw >= TOKEN_FUZZY_MIN) return jw;
  }
  const cos = wordCosine(a, b);
  return cos >= SEM_SIM_MIN ? cos : 0;
}

// Containment-aware similarity over token arrays. Pairs each A-token with its
// best unused B-token, then blends Dice (symmetric) with overlap (containment,
// so a broad preset "mobile" still fully matches "samsung mobile").
function softSimilarity(aTokens, bTokens) {
  const A = [...new Set(aTokens)];
  const B = [...new Set(bTokens)];
  if (A.length === 0 && B.length === 0) return 1;
  if (A.length === 0 || B.length === 0) return 0;
  const used = new Array(B.length).fill(false);
  let matched = 0;
  // Phase 1: claim identical tokens first, so an exact pair is never stolen by a
  // weaker fuzzy/semantic match (e.g. "apple" grabbing "iphone").
  const leftover = [];
  for (const a of A) {
    const j = B.indexOf(a);
    if (j >= 0 && !used[j]) {
      used[j] = true;
      matched += 1;
    } else {
      leftover.push(a);
    }
  }
  // Phase 2: greedily pair the rest by fuzzy/semantic token similarity.
  for (const a of leftover) {
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
  const dice = (2 * matched) / (A.length + B.length);
  const overlap = matched / Math.min(A.length, B.length);
  return 0.5 * dice + 0.5 * overlap;
}

// True when the two token sets carry different accessory words — i.e. an
// accessory vs its product, or two different accessories: not the same category.
function accessoryMismatch(A, B) {
  const acc = (t) => ACCESSORY.has(t);
  const aAcc = new Set(A.filter(acc));
  const bAcc = new Set(B.filter(acc));
  for (const t of aAcc) if (!bAcc.has(t)) return true;
  for (const t of bAcc) if (!aAcc.has(t)) return true;
  return false;
}

export const ruleBasedProvider = {
  id: "rule-based",
  similarity(a, b) {
    const A = normalizeTokens(a);
    const B = normalizeTokens(b);
    if (accessoryMismatch(A, B)) return 0;
    return softSimilarity(A, B);
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
