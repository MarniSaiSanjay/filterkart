// Tests for preset storage CRUD (src/core/storage.js) against a mock store.
import { setFile, test, assert, assertEqual } from "./harness.js";
import { mockStore } from "./mock-store.js";
import {
  listPresets,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  generateId,
} from "../src/core/storage.js";

setFile("storage");

test("generateId produces unique-ish ids", () => {
  const a = generateId();
  const b = generateId();
  assert(a !== b, "ids should differ");
  assert(a.startsWith("p_"), "id prefix");
});

test("create then list returns the preset", async () => {
  const s = mockStore();
  const rec = await createPreset(
    { name: "Laptops", siteId: "amazon", filters: [{ facet: "brand", value: "HP" }] },
    s
  );
  assert(rec.id, "id assigned");
  assert(rec.createdAt, "createdAt assigned");
  const all = await listPresets(s);
  assertEqual(all.length, 1);
  assertEqual(all[0].name, "Laptops");
});

test("createPreset requires siteId and name", async () => {
  const s = mockStore();
  let threw = false;
  try {
    await createPreset({ name: "x" }, s);
  } catch {
    threw = true;
  }
  assert(threw, "should throw without siteId");
});

test("getPreset finds by id, null when missing", async () => {
  const s = mockStore();
  const rec = await createPreset({ name: "A", siteId: "myntra" }, s);
  const found = await getPreset(rec.id, s);
  assertEqual(found.name, "A");
  const missing = await getPreset("nope", s);
  assertEqual(missing, null);
});

test("updatePreset merges patch, keeps id", async () => {
  const s = mockStore();
  const rec = await createPreset({ name: "Old", siteId: "ajio" }, s);
  const upd = await updatePreset(rec.id, { name: "New" }, s);
  assertEqual(upd.name, "New");
  assertEqual(upd.id, rec.id);
  const missing = await updatePreset("nope", { name: "x" }, s);
  assertEqual(missing, null);
});

test("deletePreset removes and reports", async () => {
  const s = mockStore();
  const rec = await createPreset({ name: "Z", siteId: "flipkart" }, s);
  const ok = await deletePreset(rec.id, s);
  assertEqual(ok, true);
  const again = await deletePreset(rec.id, s);
  assertEqual(again, false);
  const all = await listPresets(s);
  assertEqual(all.length, 0);
});

test("listPresets sanitizes tampered entries", async () => {
  const s = mockStore({
    presets: [
      { id: "p1", siteId: "amazon", name: "Good", filters: [{ facet: "brand", value: "HP" }] },
      { id: "p2", siteId: "myntra", name: "BadFilters", filters: "not-an-array" },
      { id: "p3", siteId: "ajio", filters: [{ facet: "x", value: "y" }, "junk", null] },
      { siteId: "flipkart", name: "NoId" },
      "totally-not-an-object",
      null,
    ],
  });
  const all = await listPresets(s);
  assertEqual(all.length, 3);
  assertEqual(all.map((p) => p.id).join(","), "p1,p2,p3");
  const bad = all.find((p) => p.id === "p2");
  assert(Array.isArray(bad.filters), "filters coerced to array");
  assertEqual(bad.filters.length, 0);
  const p3 = all.find((p) => p.id === "p3");
  assertEqual(p3.name, "");
  assertEqual(p3.filters.length, 1);
});

test("listPresets tolerates non-array storage value", async () => {
  const s = mockStore({ presets: { not: "a list" } });
  const all = await listPresets(s);
  assertEqual(all.length, 0);
});
