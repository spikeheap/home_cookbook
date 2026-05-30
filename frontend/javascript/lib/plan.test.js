import { test } from "node:test";
import assert from "node:assert/strict";
import LZString from "lz-string";
import {
  emptyPlan, loadPlan, savePlan,
  addEntry, removeEntry, updateEntry, clearEntries,
  modeForRecipe, defaultValueForRecipe, slotForRecipe, slotForMeal,
  nextStepValue, groupBySlot, addRecipeToPlan, renderEntry,
  isInPlan, togglePlanEntry,
  encodePlan, decodePlan, mergeEntries, replaceEntries,
  safeHref,
  SLOT_ORDER,
} from "./plan.js";

function fakeStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
    _store: store,
  };
}

test("emptyPlan returns the canonical empty shape", () => {
  assert.deepEqual(emptyPlan(), { version: 1, entries: [] });
});

test("loadPlan falls back to empty for missing, corrupt, or wrong-version data", () => {
  assert.deepEqual(loadPlan(null), emptyPlan());
  assert.deepEqual(loadPlan(fakeStorage()), emptyPlan());

  const corrupt = fakeStorage();
  corrupt.setItem("cookbook.plan", "{not json");
  assert.deepEqual(loadPlan(corrupt), emptyPlan());

  const wrongVersion = fakeStorage();
  wrongVersion.setItem("cookbook.plan", JSON.stringify({ version: 99, entries: [] }));
  assert.deepEqual(loadPlan(wrongVersion), emptyPlan());
});

test("savePlan + loadPlan round-trip preserves entries", () => {
  const storage = fakeStorage();
  const plan = { version: 1, entries: [{ id: "x", slug: "focaccia", value: 1, slot: "Other" }] };
  savePlan(plan, storage);
  assert.deepEqual(loadPlan(storage), plan);
});

test("addEntry assigns an id and appends; removeEntry and updateEntry are immutable", () => {
  const p0 = emptyPlan();
  const p1 = addEntry(p0, { slug: "chicken_curry", value: 4, slot: "Dinner" });
  assert.equal(p0.entries.length, 0, "original plan untouched");
  assert.equal(p1.entries.length, 1);
  const id = p1.entries[0].id;
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);

  const p2 = updateEntry(p1, id, { value: 6 });
  assert.equal(p1.entries[0].value, 4);
  assert.equal(p2.entries[0].value, 6);

  const p3 = removeEntry(p2, id);
  assert.equal(p3.entries.length, 0);
});

test("clearEntries leaves version intact", () => {
  const p = addEntry(emptyPlan(), { slug: "x", value: 1, slot: "Other" });
  const cleared = clearEntries(p);
  assert.deepEqual(cleared, { version: 1, entries: [] });
});

test("modeForRecipe and defaultValueForRecipe pick servings or multiplier", () => {
  assert.equal(modeForRecipe({ servings: 4 }), "servings");
  assert.equal(modeForRecipe({ servings: null }), "multiplier");
  assert.equal(modeForRecipe({}), "multiplier");

  assert.equal(defaultValueForRecipe({ servings: 6 }), 6);
  assert.equal(defaultValueForRecipe({ servings: null }), 1);
});

test("slotForRecipe maps meal arrays to Breakfast/Lunch/Dinner/Other", () => {
  assert.equal(slotForRecipe({ meal: ["Breakfast"] }),         "Breakfast");
  assert.equal(slotForRecipe({ meal: ["Lunch"] }),             "Lunch");
  assert.equal(slotForRecipe({ meal: ["Main"] }),              "Dinner");
  assert.equal(slotForRecipe({ meal: ["Main", "Lunch"] }),     "Lunch", "Lunch wins when both are tagged");
  assert.equal(slotForRecipe({ meal: ["Side"] }),              "Other");
  assert.equal(slotForRecipe({ meal: ["Sweet", "Snack"] }),    "Other");
  assert.equal(slotForRecipe({}),                              "Other");
});

test("nextStepValue: servings mode is integer, min 1; multiplier mode walks the ladder", () => {
  assert.equal(nextStepValue(4, "up",   "servings"), 5);
  assert.equal(nextStepValue(4, "down", "servings"), 3);
  assert.equal(nextStepValue(1, "down", "servings"), 1, "clamped to 1");

  assert.equal(nextStepValue(1, "up",   "multiplier"), 2);
  assert.equal(nextStepValue(1, "down", "multiplier"), 0.5);
  assert.equal(nextStepValue(0.5, "down", "multiplier"), 0.5, "clamped at the bottom of the ladder");
});

test("groupBySlot returns the four slots in canonical order", () => {
  const entries = [
    { id: "a", slug: "x", value: 1, slot: "Dinner" },
    { id: "b", slug: "y", value: 1, slot: "Breakfast" },
    { id: "c", slug: "z", value: 1, slot: "Dinner" },
  ];
  const grouped = groupBySlot(entries);
  assert.deepEqual(grouped.map(g => g.slot), SLOT_ORDER);
  assert.deepEqual(grouped.map(g => g.entries.length), [1, 0, 2, 0]);
});

test("groupBySlot routes unknown slots into Other", () => {
  const entries = [{ id: "a", slug: "x", value: 1, slot: "Brunch" }];
  const grouped = groupBySlot(entries);
  const other = grouped.find(g => g.slot === "Other");
  assert.equal(other.entries.length, 1);
});

test("slotForMeal accepts a raw meal array (used by data-attribute readers)", () => {
  assert.equal(slotForMeal(["Breakfast"]),       "Breakfast");
  assert.equal(slotForMeal(["Main", "Lunch"]),   "Lunch");
  assert.equal(slotForMeal([]),                  "Other");
  assert.equal(slotForMeal(null),                "Other");
});

test("addRecipeToPlan appends an entry and persists it", () => {
  const storage = fakeStorage();
  addRecipeToPlan({ slug: "focaccia", value: 1, slot: "Other", storage });
  addRecipeToPlan({ slug: "chicken_curry", value: 8, slot: "Dinner", storage });
  const loaded = loadPlan(storage);
  assert.equal(loaded.entries.length, 2);
  assert.deepEqual(loaded.entries.map(e => e.slug), ["focaccia", "chicken_curry"]);
});

test("renderEntry degrades gracefully when the recipe is missing from the index", () => {
  // Reproduces the original crash: stale slug after a recipe is renamed/removed.
  const entry = { id: "abc", slug: "ghost", value: 4, slot: "Dinner" };
  const html = renderEntry(entry, undefined);
  assert.match(html, /plan-entry--missing/);
  assert.match(html, /Unknown recipe: ghost/);
  // The remove button must still render so the user can clean up the stale entry.
  assert.match(html, /data-plan-remove="abc"/);
});

test("renderEntry renders a stepper and link when the recipe is present", () => {
  const entry  = { id: "x", slug: "chicken_curry", value: 6, slot: "Dinner" };
  const recipe = { slug: "chicken_curry", name: "Chetna's chicken curry", url: "/recipes/chicken_curry", servings: 8, meal: ["Main"] };
  const html = renderEntry(entry, recipe);
  assert.match(html, /href="\/recipes\/chicken_curry"/);
  assert.match(html, /Chetna&#39;s chicken curry/);
  assert.match(html, /data-plan-step="up"/);
});

test("addRecipeToPlan ignores calls missing slug or slot", () => {
  const storage = fakeStorage();
  addRecipeToPlan({ slug: "", value: 1, slot: "Other", storage });
  addRecipeToPlan({ slug: "x", value: 1, slot: "", storage });
  assert.equal(loadPlan(storage).entries.length, 0);
});

test("isInPlan reflects whether a slug has any matching entry", () => {
  const storage = fakeStorage();
  assert.equal(isInPlan("focaccia", storage), false);
  addRecipeToPlan({ slug: "focaccia", value: 1, slot: "Other", storage });
  assert.equal(isInPlan("focaccia", storage), true);
  assert.equal(isInPlan("other_recipe", storage), false);
  assert.equal(isInPlan("", storage), false);
});

test("togglePlanEntry adds when absent, removes when present", () => {
  const storage = fakeStorage();

  const first = togglePlanEntry({ slug: "dal", value: 6, slot: "Dinner", storage });
  assert.equal(first.added, true);
  assert.equal(loadPlan(storage).entries.length, 1);

  const second = togglePlanEntry({ slug: "dal", value: 6, slot: "Dinner", storage });
  assert.equal(second.added, false);
  assert.equal(loadPlan(storage).entries.length, 0);

  const third = togglePlanEntry({ slug: "dal", value: 4, slot: "Dinner", storage });
  assert.equal(third.added, true, "re-adding works after removal");
});

test("togglePlanEntry ignores empty slug/slot and reports the unchanged plan", () => {
  const storage = fakeStorage();
  const { added } = togglePlanEntry({ slug: "", value: 1, slot: "Other", storage });
  assert.equal(added, false);
  assert.equal(loadPlan(storage).entries.length, 0);
});

// ---- URL sharing ----------------------------------------------------------

test("encodePlan strips ids and decodePlan round-trips the entries", () => {
  const plan = {
    version: 1,
    entries: [
      { id: "device-a-1", slug: "focaccia",      value: 1,   slot: "Other"     },
      { id: "device-a-2", slug: "chicken_curry", value: 6,   slot: "Dinner"    },
      { id: "device-a-3", slug: "pancakes",      value: 0.5, slot: "Breakfast" },
    ],
  };
  const encoded = encodePlan(plan);
  assert.equal(typeof encoded, "string");
  assert.ok(encoded.length > 0);
  assert.ok(!encoded.includes("device-a-"), "encoded form must not leak per-device ids");

  const result = decodePlan(encoded);
  assert.equal(result.ok, true);
  assert.deepEqual(result.entries, [
    { slug: "focaccia",      value: 1,   slot: "Other"     },
    { slug: "chicken_curry", value: 6,   slot: "Dinner"    },
    { slug: "pancakes",      value: 0.5, slot: "Breakfast" },
  ]);
});

test("encodePlan handles an empty plan", () => {
  const encoded = encodePlan(emptyPlan());
  const result = decodePlan(encoded);
  assert.equal(result.ok, true);
  assert.deepEqual(result.entries, []);
});

test("decodePlan returns ok:false on malformed input without throwing", () => {
  assert.equal(decodePlan("").ok, false);
  assert.equal(decodePlan(null).ok, false);
  assert.equal(decodePlan(undefined).ok, false);
  assert.equal(decodePlan(123).ok, false);
  // Random garbage that doesn't decompress cleanly.
  assert.equal(decodePlan("!!!not-valid-lz!!!").ok, false);
});

test("decodePlan rejects payloads with the wrong schema version", () => {
  const wrongVersion = LZStringEncode({ v: 999, entries: [] });
  const result = decodePlan(wrongVersion);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "version");
});

test("decodePlan rejects payloads with a non-array entries field", () => {
  const badShape = LZStringEncode({ v: 1, entries: "nope" });
  const result = decodePlan(badShape);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "shape");
});

test("decodePlan drops individual entries that fail field-level validation", () => {
  const payload = LZStringEncode({
    v: 1,
    entries: [
      { slug: "ok",           value: 2, slot: "Dinner" },
      { slug: "",             value: 2, slot: "Dinner" }, // empty slug
      { slug: "missing_slot", value: 2 },                  // no slot
      { slug: "nan_value",    value: NaN, slot: "Other" }, // not finite
      { slug: "wrong_types",  value: "two", slot: "Other" },
      "not an object",
      null,
      { slug: "also_ok",      value: 1, slot: "Lunch" },
    ],
  });
  const result = decodePlan(payload);
  assert.equal(result.ok, true);
  assert.deepEqual(result.entries.map(e => e.slug), ["ok", "also_ok"]);
});

test("replaceEntries generates fresh ids and discards the previous plan entries", () => {
  const plan = addEntry(emptyPlan(), { slug: "existing", value: 1, slot: "Other" });
  const imported = [
    { slug: "focaccia",      value: 1, slot: "Other"  },
    { slug: "chicken_curry", value: 6, slot: "Dinner" },
  ];
  const next = replaceEntries(plan, imported);
  assert.deepEqual(next.entries.map(e => e.slug), ["focaccia", "chicken_curry"]);
  next.entries.forEach(e => {
    assert.equal(typeof e.id, "string");
    assert.ok(e.id.length > 0);
  });
  // Ids must differ between regenerated entries.
  const [a, b] = next.entries;
  assert.notEqual(a.id, b.id);
});

test("mergeEntries appends new slugs and skips duplicates", () => {
  let plan = addEntry(emptyPlan(), { slug: "focaccia",      value: 1, slot: "Other" });
  plan     = addEntry(plan,        { slug: "chicken_curry", value: 4, slot: "Dinner" });
  const imported = [
    { slug: "chicken_curry", value: 8, slot: "Dinner" }, // duplicate slug — drop
    { slug: "pancakes",      value: 1, slot: "Breakfast" },
    { slug: "focaccia",      value: 2, slot: "Other" },  // duplicate slug — drop
  ];
  const next = mergeEntries(plan, imported);
  assert.deepEqual(next.entries.map(e => e.slug), [
    "focaccia", "chicken_curry", "pancakes",
  ]);
  // Existing entries are kept verbatim (ids untouched, values unchanged).
  assert.equal(next.entries[0].value, 1);
  assert.equal(next.entries[1].value, 4);
  // New entry got a fresh id.
  assert.equal(typeof next.entries[2].id, "string");
  assert.ok(next.entries[2].id.length > 0);
});

test("mergeEntries on an empty plan behaves like a fresh import with new ids", () => {
  const next = mergeEntries(emptyPlan(), [
    { slug: "a", value: 1, slot: "Other" },
    { slug: "b", value: 1, slot: "Other" },
  ]);
  assert.equal(next.entries.length, 2);
  assert.notEqual(next.entries[0].id, next.entries[1].id);
});

test("import flow keeps unknown slugs — plan renderer degrades them gracefully", () => {
  // Sender's plan contains a recipe the receiver doesn't have.
  const sender = {
    version: 1,
    entries: [{ id: "x", slug: "renamed_or_removed", value: 2, slot: "Dinner" }],
  };
  const encoded = encodePlan(sender);
  const result = decodePlan(encoded);
  assert.equal(result.ok, true);
  assert.deepEqual(result.entries.map(e => e.slug), ["renamed_or_removed"]);

  const next = replaceEntries(emptyPlan(), result.entries);
  // renderEntry without a recipe in the index produces the missing-row markup.
  const html = renderEntry(next.entries[0], undefined);
  assert.match(html, /plan-entry--missing/);
});

// Tiny encoder so tests can build deliberately-shaped payloads (including
// wrong-version / wrong-shape) without re-implementing lz-string.
function LZStringEncode(obj) {
  return LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}

// ---- Security: safeHref ---------------------------------------------------

test("safeHref rejects javascript:, data:, vbscript:, and non-string input", () => {
  assert.equal(safeHref("javascript:alert(1)"),         "#");
  assert.equal(safeHref("JavaScript:alert(1)"),         "#");
  assert.equal(safeHref("data:text/html,<script>1</script>"), "#");
  assert.equal(safeHref("vbscript:msgbox(1)"),          "#");
  assert.equal(safeHref(""),                            "#");
  assert.equal(safeHref(null),                          "#");
  assert.equal(safeHref(undefined),                     "#");
  assert.equal(safeHref(42),                            "#");
  assert.equal(safeHref({}),                            "#");
});

test("safeHref allows site-relative paths and absolute http(s) URLs", () => {
  assert.equal(safeHref("/recipes/x"),                  "/recipes/x");
  assert.equal(safeHref("/recipes/x?q=1#frag"),         "/recipes/x?q=1#frag");
  assert.equal(safeHref("https://example.com"),         "https://example.com");
  assert.equal(safeHref("http://example.com"),          "http://example.com");
  assert.equal(safeHref("HTTPS://Example.com/path"),    "HTTPS://Example.com/path");
});

test("renderEntry routes a poisoned recipe.url through safeHref", () => {
  const entry  = { id: "x", slug: "evil", value: 1, slot: "Dinner" };
  const recipe = { slug: "evil", name: "Evil", url: "javascript:alert(1)", servings: 4, meal: ["Main"] };
  const html = renderEntry(entry, recipe);
  // The href becomes "#" rather than the poisoned scheme.
  assert.match(html, /href="#"/);
  assert.doesNotMatch(html, /javascript:/);
});

// ---- Security: decodePlan size cap ---------------------------------------

test("decodePlan returns ok:false { reason: 'too_big' } for a ~250 KB payload", () => {
  // Build a payload whose decompressed JSON exceeds the 200 KB cap.
  // A long string of 'a's compresses extremely well via lz-string, so the
  // encoded fragment is small but expands back to >200 KB.
  const bigString = "a".repeat(250_000);
  const payload   = { v: 1, entries: [{ slug: bigString, value: 1, slot: "Other" }] };
  const encoded   = LZString.compressToEncodedURIComponent(JSON.stringify(payload));

  const result = decodePlan(encoded);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "too_big");
});

test("decodePlan stays under the cap for a legitimate plan", () => {
  // 50 entries (well past any realistic shared plan) decompresses to ~5 KB.
  const entries = Array.from({ length: 50 }, (_, i) => ({
    slug:  `recipe_${i}`,
    value: 1,
    slot:  "Dinner",
  }));
  const encoded = LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, entries }));
  const result  = decodePlan(encoded);
  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 50);
});

// ---- Security: decodePlan + decodeURIComponent ---------------------------

test("decodePlan rejects garbage that fails URIComponent decoding upstream", () => {
  // A bare `%` is illegal in URI escapes — encodeURIComponent on a real
  // share fragment will never produce it. We pass it straight to
  // decodePlan to confirm the function doesn't blow up on hostile input;
  // the upstream setupPlan hash-import path bails before reaching here
  // (covered by the M3 fix in plan.js).
  const result = decodePlan("%E0%A4%A");
  assert.equal(result.ok, false);
  // Either "decompress" (lz-string returns "" / null) or "json" — both are
  // acceptable rejections; the point is no throw.
  assert.ok(["decompress", "json", "shape"].includes(result.reason), `got reason: ${result.reason}`);
});
