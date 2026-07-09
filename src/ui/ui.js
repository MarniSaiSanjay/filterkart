// FilterKart shared UI helpers, used by both the popup and the manager page.
// Keeps SVG icons, category detection, tile colouring, DOM building and the
// background messaging bridge in one place so the two views stay consistent.

export function send(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) return reject(new Error(lastErr.message));
      if (!res) return reject(new Error("no response from background"));
      if (!res.ok) return reject(new Error(res.error || "request failed"));
      resolve(res.result);
    });
  });
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2), v);
    } else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

// --- Inline SVG icons (static markup, no user input) -----------------------

export const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  funnel: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
  spark: '<path d="M12 3l1.3 3.4L17 8l-3.7 1.6L12 13l-1.3-3.4L7 8l3.7-1.6z" stroke="none" fill="currentColor"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  "chevron-left": '<path d="M15 6l-6 6 6 6"/>',
  store: '<path d="M4 9l1.5-4h13L20 9"/><path d="M4 9v10h16V9"/><path d="M4 9h16"/><path d="M9 19v-5h6v5"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 1 4 10.5c-.7.7-1 1.3-1 2.5H9c0-1.2-.3-1.8-1-2.5A6 6 0 0 1 12 3z"/>',
  pencil: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  // category icons
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 20h20"/>',
  shoe: '<path d="M3 16v-5l4-1 3 3 8 1a3 3 0 0 1 3 3v1H3z"/><path d="M7 10v2M10 11v2"/>',
  shirt: '<path d="M8 4l4 2 4-2 4 3-3 3v10H7V10L4 7z"/>',
  headphones: '<path d="M4 13a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4" height="7" rx="1.5"/><rect x="17" y="13" width="4" height="7" rx="1.5"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8"/>',
  camera: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7l1.5-2h5L16 7"/><circle cx="12" cy="13" r="3"/>',
  watch: '<rect x="8" y="8" width="8" height="8" rx="2"/><path d="M10 8V4h4v4M10 16v4h4v-4"/>',
  tag: '<path d="M4 4h8l8 8-8 8-8-8z"/><circle cx="8.5" cy="8.5" r="1.4" stroke="none" fill="currentColor"/>',
  book: '<path d="M6 4h11a1 1 0 0 1 1 1v15H7a1 1 0 0 1-1-1z"/><path d="M6 17h12"/><path d="M9 4v13"/>',
  grocery: '<path d="M4 9h16l-1.4 9.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8z"/><path d="M9 9l3-5 3 5"/><path d="M9.5 13v3M14.5 13v3"/>',
  furniture: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 12a2 2 0 0 1 2 2v3h14v-3a2 2 0 0 1 2-2"/><path d="M5 17v2M19 17v2"/>',
  beauty: '<path d="M9 21h6v-9H9z"/><path d="M9.5 12l.6-4.5 3.4-2.5 1.4 3.5-.9 3.5"/>',
  toys: '<rect x="3" y="12" width="8" height="7" rx="1"/><rect x="13" y="12" width="8" height="7" rx="1"/><rect x="8" y="4" width="8" height="7" rx="1"/>',
  sports: '<path d="M4 9v6M8 7v10M16 7v10M20 9v6"/><path d="M8 12h8"/>',
  gaming: '<rect x="3" y="9" width="18" height="8" rx="4"/><path d="M8 11v4M6 13h4"/><circle cx="16.5" cy="12.5" r="0.9" stroke="none" fill="currentColor"/><circle cx="18" cy="14.5" r="0.9" stroke="none" fill="currentColor"/>',
  jewellery: '<circle cx="12" cy="15" r="5"/><path d="M9 10l1.5-3h3L16 10"/>',
  kitchen: '<path d="M4 9h16l-1 11H5z"/><path d="M4 9l2-5h12l2 5"/><path d="M12 9v11"/>',
};

export function icon(name, cls = "") {
  const span = el("span", { class: "ico" + (cls ? " " + cls : "") });
  span.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.tag}</svg>`;
  return span;
}

// A ring gauge whose filled arc reflects a 0..1 fraction, so the "NN% match"
// badge icon mirrors the actual percentage instead of a fixed wedge.
export function gaugeIcon(frac, cls = "") {
  const f = Math.max(0, Math.min(1, frac || 0));
  const r = 8;
  const c = 2 * Math.PI * r;
  const on = (c * f).toFixed(2);
  const off = (c * (1 - f)).toFixed(2);
  const span = el("span", { class: "ico" + (cls ? " " + cls : "") });
  span.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none">` +
    `<circle cx="12" cy="12" r="${r}" stroke="currentColor" stroke-opacity="0.25" stroke-width="3"/>` +
    `<circle cx="12" cy="12" r="${r}" stroke="currentColor" stroke-width="3" stroke-linecap="round" ` +
    `stroke-dasharray="${on} ${off}" transform="rotate(-90 12 12)"/>` +
    `</svg>`;
  return span;
}

// Pick a category icon from the preset's name/search keywords.
export function pickIcon(text) {
  const t = String(text || "").toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  if (has("phone", "mobile", "iphone", "smartphone", "galaxy")) return "phone";
  if (has("laptop", "notebook", "macbook", "computer")) return "laptop";
  if (has("shoe", "sneaker", "footwear", "boot", "running", "sandal", "slipper")) return "shoe";
  if (has("book", "novel", "kindle", "textbook", "stationery", "notebook")) return "book";
  if (has("grocery", "vegetable", "fruit", "food", "snack", "staple", "atta", "masala", "beverage", "supermarket")) return "grocery";
  if (has("furniture", "sofa", "chair", "table", "bed", "mattress", "wardrobe", "desk", "cupboard")) return "furniture";
  if (has("beauty", "makeup", "cosmetic", "lipstick", "skincare", "perfume", "fragrance", "cream", "grooming")) return "beauty";
  if (has("toy", "lego", "doll", "teddy", "puzzle", "kids", "baby")) return "toys";
  if (has("sport", "fitness", "gym", "dumbbell", "cricket", "football", "yoga", "cycle", "bicycle", "fitband")) return "sports";
  if (has("game", "gaming", "console", "playstation", "xbox", "controller", "nintendo")) return "gaming";
  if (has("jewel", "jewellery", "jewelry", "ring", "necklace", "earring", "bracelet", "gold", "diamond")) return "jewellery";
  if (has("kitchen", "cookware", "utensil", "mixer", "grinder", "cooker", "appliance")) return "kitchen";
  if (has("shirt", "tshirt", "t-shirt", "cloth", "apparel", "fashion", "dress", "kurta", "jean", "wear", "top")) return "shirt";
  if (has("head", "earphone", "earbud", "audio", "speaker", "buds")) return "headphones";
  if (has("tv", "television", "monitor")) return "tv";
  if (has("camera", "dslr", "lens")) return "camera";
  if (has("watch", "smartwatch")) return "watch";
  return "tag";
}

const TILE_COLORS = ["v", "g", "b", "o", "p", "t"]; // violet green blue orange pink teal
export function pickColor(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

export function timeAgo(ms) {
  if (!ms) return "";
  const s = Math.max(0, Date.now() - ms) / 1000;
  if (s < 45) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.round(d)}d ago`;
  const w = d / 7;
  if (w < 5) return `${Math.round(w)}w ago`;
  return new Date(ms).toLocaleDateString();
}
