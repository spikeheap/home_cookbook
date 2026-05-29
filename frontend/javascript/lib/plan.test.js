import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyPlan, loadPlan, savePlan,
  addEntry, removeEntry, updateEntry, clearEntries,
  modeForRecipe, defaultValueForRecipe, slotForRecipe, slotForMeal,
  nextStepValue, groupBySlot, addRecipeToPlan,
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

test("addRecipeToPlan ignores calls missing slug or slot", () => {
  const storage = fakeStorage();
  addRecipeToPlan({ slug: "", value: 1, slot: "Other", storage });
  addRecipeToPlan({ slug: "x", value: 1, slot: "", storage });
  assert.equal(loadPlan(storage).entries.length, 0);
});
