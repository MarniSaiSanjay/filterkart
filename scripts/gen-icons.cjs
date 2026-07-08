// FilterKart icon generator.
// Design: a filter FUNNEL pouring into a shopping CART on a rounded gradient
// tile (teal -> indigo) with a gold spark accent -> literally "Filter + Cart".
// Size-aware: the 16px toolbar icon shows only the funnel + spark (the cart is
// too fine to read at that size); 48/128 show the full funnel + cart.
// Supersampled anti-aliasing, valid PNGs, no dependencies.
// Run: node scripts/gen-icons.cjs
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SS = 4;
const TOP = [34, 211, 189]; // #22d3bd teal
const BOT = [79, 70, 229]; // #4f46e5 indigo
const W = [255, 255, 255];
const SPARK = [255, 212, 59]; // #ffd43b

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inTile(x, y) {
  const m = 0.05, r = 0.24, lo = m, hi = 1 - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = x < lo + r ? lo + r : x > hi - r ? hi - r : x;
  const cy = y < lo + r ? lo + r : y > hi - r ? hi - r : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function grad(y) {
  return lerp(TOP, BOT, Math.min(1, Math.max(0, (y - 0.05) / 0.9)));
}
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
function star4(x, y, cx, cy, a) {
  const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
  if (dx > a || dy > a) return false;
  return Math.sqrt(dx / a) + Math.sqrt(dy / a) <= 1;
}

// Geometry differs slightly by size for legibility.
function layout(small) {
  return small
    ? { fTop: 0.26, fMid: 0.6, fBot: 0.78, fHalf: 0.28, spark: [0.75, 0.28, 0.12] }
    : { fTop: 0.22, fMid: 0.46, fBot: 0.56, fHalf: 0.25, spark: [0.76, 0.24, 0.1] };
}

function sample(x, y, size) {
  const small = size < 32;
  const L = layout(small);
  // gold spark (always, sits above tile at top-right)
  if (star4(x, y, L.spark[0], L.spark[1], L.spark[2])) return [...SPARK, 255];
  if (!inTile(x, y)) return [0, 0, 0, 0];

  // funnel (white)
  if (y >= L.fTop && y <= L.fMid) {
    const t = (y - L.fTop) / (L.fMid - L.fTop);
    const xL = 0.5 - L.fHalf * (1 - t) - 0.03 * t;
    const xR = 0.5 + L.fHalf * (1 - t) + 0.03 * t;
    if (x >= xL && x <= xR) return [...W, 255];
  }
  // funnel stem
  if (y > L.fMid && y <= L.fBot && x >= 0.47 && x <= 0.53) return [...W, 255];

  if (!small) {
    // cart body (open-top trapezoid outline)
    const cyT = 0.58, cyB = 0.72, cxL = 0.34, cxR = 0.7, wall = 0.045;
    const inOuter = x >= cxL && x <= cxR && y >= cyT && y <= cyB;
    const inInner = x >= cxL + wall && x <= cxR - wall && y >= cyT + wall && y <= cyB;
    if (inOuter && !inInner) return [...W, 255];
    // cart handle
    if (segDist(x, y, 0.28, 0.58, 0.34, 0.58) <= 0.026) return [...W, 255];
    if (segDist(x, y, 0.28, 0.58, 0.26, 0.52) <= 0.026) return [...W, 255];
    // wheels
    if (Math.hypot(x - 0.42, y - 0.79) <= 0.04) return [...W, 255];
    if (Math.hypot(x - 0.62, y - 0.79) <= 0.04) return [...W, 255];
  }

  const c = grad(y);
  return [c[0], c[1], c[2], 255];
}

function renderRGBA(size) {
  const buf = Buffer.alloc(size * size * 4, 0);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, size);
          if (c[3]) { r += c[0]; g += c[1]; b += c[2]; hits++; }
        }
      const i = (py * size + px) * 4;
      if (hits) {
        buf[i] = Math.round(r / hits); buf[i + 1] = Math.round(g / hits);
        buf[i + 2] = Math.round(b / hits); buf[i + 3] = Math.round((hits / (SS * SS)) * 255);
      }
    }
  return buf;
}

function crc32(b) { let c = ~0; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const tb = Buffer.from(t, "ascii"); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([tb, d])), 0); return Buffer.concat([l, tb, d, cr]); }
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(size, 0); ih.writeUInt32BE(size, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ih), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const outDir = path.resolve(__dirname, "..", "icons");
for (const size of [16, 48, 128]) {
  const png = encodePNG(size, renderRGBA(size));
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  console.log(`wrote icon${size}.png (${png.length} bytes)`);
}
