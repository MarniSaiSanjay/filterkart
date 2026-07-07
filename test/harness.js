// Minimal zero-dependency test helpers for FilterCart.
// Usage: import { test, run } and register tests, then call run() at file end,
// or use the aggregate runner in test/index.js.

const registered = [];
let currentFile = "unknown";

export function setFile(name) {
  currentFile = name;
}

export function test(name, fn) {
  registered.push({ file: currentFile, name, fn });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((msg || "not equal") + `\n  expected: ${e}\n  actual:   ${a}`);
  }
}

export async function run() {
  let passed = 0;
  const failures = [];
  for (const t of registered) {
    try {
      await t.fn();
      passed++;
    } catch (err) {
      failures.push({ ...t, err });
    }
  }
  const total = registered.length;
  for (const f of failures) {
    console.error(`FAIL [${f.file}] ${f.name}\n  ${f.err.message}`);
  }
  console.log(`\n${passed}/${total} tests passed`);
  if (failures.length) process.exit(1);
}
