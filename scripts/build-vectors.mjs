// Regenerates src/similarity/vectors.js (dev-only; run manually). Downloads
// GloVe 6B 50d, keeps the top-TOP_N words plus a curated shopping vocabulary,
// int8-quantizes them, and emits a cross-env ES module for offline semantic
// token similarity. Run: node scripts/build-vectors.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = path.join(ROOT, "src", "similarity", "vectors.js");
const CACHE = path.join(os.tmpdir(), "glove-wiki-gigaword-50.txt");
const URL_GZ =
  "https://github.com/RaRe-Technologies/gensim-data/releases/download/glove-wiki-gigaword-50/glove-wiki-gigaword-50.gz";
const TOP_N = 30000;
const DIM = 50;

// Curated shopping vocab: guarantees inclusion of category/attribute words that
// exist in GloVe but sit below TOP_N by general frequency. Only WORDS are listed
// here — cosine derives every equivalence between them automatically.
const DOMAIN = `
sofa couch settee recliner mattress cushion pillow blanket curtain
fridge refrigerator freezer microwave oven toaster blender mixer grinder juicer kettle
washer dishwasher vacuum heater cooler humidifier
footwear sneakers loafers sandals slippers heels boots trousers pants jeans denim shorts
trouser jeggings leggings kurta kurti saree salwar blazer coat jacket sweater hoodie cardigan
shirt tshirt tee blouse skirt dress gown frock lingerie
earphones earbuds headphones headset speaker speakers soundbar woofer
smartphone smartwatch tablet charger powerbank keyboard mouse monitor printer router
perfume deodorant lipstick mascara foundation moisturizer shampoo conditioner sunscreen serum
spectacles eyeglasses sunglasses goggles wallet handbag backpack luggage suitcase
`.trim().split(/\s+/);

async function loadGlove() {
  if (!fs.existsSync(CACHE)) {
    console.log("downloading GloVe 50d ...");
    const res = await fetch(URL_GZ);
    if (!res.ok) throw new Error("download failed: " + res.status);
    const gz = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(CACHE, zlib.gunzipSync(gz).toString("utf8"));
  }
  return fs.readFileSync(CACHE, "utf8").split("\n");
}

const lines = await loadGlove();
const order = [];
const vecs = new Map();
for (let i = 1; i < lines.length; i++) {
  const p = lines[i].split(" ");
  if (p.length < DIM + 1) continue;
  const w = p[0];
  if (i - 1 >= TOP_N && !DOMAIN.includes(w)) continue;
  const v = new Float32Array(DIM);
  for (let d = 0; d < DIM; d++) v[d] = +p[d + 1];
  if (!vecs.has(w)) { vecs.set(w, v); order.push(w); }
}

let maxAbs = 0;
for (const v of vecs.values()) for (const x of v) if (Math.abs(x) > maxAbs) maxAbs = Math.abs(x);
const scale = maxAbs / 127;

const words = order;
const q = new Int8Array(words.length * DIM);
for (let i = 0; i < words.length; i++) {
  const v = vecs.get(words[i]);
  for (let d = 0; d < DIM; d++) {
    let n = Math.round(v[d] / scale);
    if (n > 127) n = 127; else if (n < -128) n = -128;
    q[i * DIM + d] = n;
  }
}
const b64 = Buffer.from(q.buffer, q.byteOffset, q.byteLength).toString("base64");

const out = `// AUTO-GENERATED word vectors (GloVe 6B 50d, int8-quantized). Do not edit by hand.
// Source: glove-wiki-gigaword-50. Trimmed to top-${TOP_N} frequent words plus a
// curated shopping vocabulary. Provides offline semantic token similarity so the
// matcher recognizes synonyms (sofa~couch, tv~television) without a hand-listed
// pair table. Regenerate with: node scripts/build-vectors.mjs
export const DIM = ${DIM};
const SCALE = ${scale};
const WORDS = ${JSON.stringify(words.join(" "))}.split(" ");
const B64 = ${JSON.stringify(b64)};

// Decode base64 -> signed int8 (atob exists in both service workers and Node 18+).
const bin = atob(B64);
const q = new Int8Array(bin.length);
for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;

// word -> unit-normalized Float32Array(DIM), so cosine is a plain dot product.
export const VECTORS = new Map();
for (let i = 0; i < WORDS.length; i++) {
  const off = i * DIM;
  const v = new Float32Array(DIM);
  let norm = 0;
  for (let d = 0; d < DIM; d++) { const x = q[off + d] * SCALE; v[d] = x; norm += x * x; }
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < DIM; d++) v[d] /= norm;
  VECTORS.set(WORDS[i], v);
}

// Look up a word, tolerant of the matcher's naive singularize() (which can strip
// or mangle a trailing "s", e.g. glasses->glasse, trousers->trouser). Falls back
// to the plural and singular vocab forms so those tokens still resolve.
function getVec(w) {
  let v = VECTORS.get(w);
  if (!v && w.length > 2) v = VECTORS.get(w + "s");
  if (!v && w.endsWith("s")) v = VECTORS.get(w.slice(0, -1));
  return v || null;
}

// Cosine similarity of two words (0 if either is out of vocabulary).
export function wordCosine(a, b) {
  const A = getVec(a);
  const B = getVec(b);
  if (!A || !B) return 0;
  let dot = 0;
  for (let d = 0; d < DIM; d++) dot += A[d] * B[d];
  return dot;
}
`;
fs.writeFileSync(OUT, out);
console.log(`wrote ${OUT} — words: ${words.length}, file: ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
