// Builds a clean Chrome Web Store package: dist/filterkart.zip containing ONLY
// the files the extension actually runs (manifest + src/ + icons/). Dev-only
// folders (scripts/, test/, docs/, node_modules/) are excluded so they never
// ship. Zero dependencies — writes the zip with a self-contained STORE/deflate
// writer so it works on any OS without a `zip` binary.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "dist");
const OUT_ZIP = join(OUT_DIR, "filterkart.zip");

// Runtime-only inputs. Everything Chrome loads lives here; nothing else ships.
const INCLUDE = ["manifest.json", "src", "icons"];

// Only genuine runtime asset types are packaged. Anything else found inside the
// included folders (docs, source maps, unused logos, stray .md/.test files) is
// skipped and reported, so the shipped zip stays minimal and predictable.
const ALLOWED_EXT = new Set([
  ".js", ".css", ".html", ".json",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".woff2", ".woff", ".ttf",
]);

function extname(name) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

function walk(path, out = []) {
  const s = statSync(path);
  if (s.isDirectory()) {
    for (const name of readdirSync(path)) walk(join(path, name), out);
  } else {
    out.push(path);
  }
  return out;
}

// Precomputed CRC-32 table (IEEE polynomial), used for each zip entry.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function collectFiles() {
  const files = [];
  const skipped = [];
  for (const entry of INCLUDE) {
    const abs = join(ROOT, entry);
    for (const file of walk(abs)) {
      const name = relative(ROOT, file).split(sep).join("/"); // zip paths use "/"
      if (!ALLOWED_EXT.has(extname(name))) {
        skipped.push(name);
        continue;
      }
      files.push({ name, data: readFileSync(file) });
    }
  }
  if (skipped.length) console.log(`skipped ${skipped.length} non-runtime file(s): ${skipped.join(", ")}`);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

function buildZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const compressed = deflateRawSync(f.data);
    const method = compressed.length < f.data.length ? 8 : 0; // deflate, else store
    const body = method === 8 ? compressed : f.data;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);      // version needed
    local.writeUInt16LE(0, 6);       // flags
    local.writeUInt16LE(method, 8);  // compression
    local.writeUInt16LE(0, 10);      // mod time
    local.writeUInt16LE(0x21, 12);   // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);      // extra len
    locals.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);         // version made by
    cd.writeUInt16LE(20, 6);         // version needed
    cd.writeUInt16LE(0, 8);          // flags
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);         // mod time
    cd.writeUInt16LE(0x21, 14);      // mod date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(f.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);    // local header offset
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

const files = collectFiles();
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const zip = buildZip(files);
writeFileSync(OUT_ZIP, zip);
console.log(`packaged ${files.length} files -> ${relative(ROOT, OUT_ZIP)} (${(zip.length / 1e6).toFixed(2)} MB)`);
