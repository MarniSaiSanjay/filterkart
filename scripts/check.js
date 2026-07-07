// "Build" step for a no-bundler extension: syntax-check every JS file and
// validate manifest.json parses. Fails (exit 1) on any error.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", ".git", ".chrome-profile", "icons"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (extname(p) === ".js") out.push(p);
  }
  return out;
}

let errors = 0;

// 1. syntax-check JS files
for (const file of walk(ROOT)) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (e) {
    errors++;
    console.error(`SYNTAX ERROR: ${file}\n${e.stderr?.toString() || e.message}`);
  }
}

// 2. validate manifest.json
try {
  JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
} catch (e) {
  errors++;
  console.error(`manifest.json invalid: ${e.message}`);
}

if (errors) {
  console.error(`\nbuild failed: ${errors} error(s)`);
  process.exit(1);
}
console.log("build ok: all JS syntax-checked, manifest valid");
