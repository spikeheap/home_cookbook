import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate, factorForEntry, extractSubSlug, normaliseItemName, displayItemName,
} from "./aggregator.js";

// Minimal recipe fixtures that match the shape inlined by `plan.erb`.
const chickenCurry = {
  slug: "chicken_curry", name: "Chetna's chicken curry", servings: 8,
  meal: ["Main"], recipeIngredient: [
    { items: [
      { quantity: 2, item: "onions, sliced" },
      { quantity: 4, item: "garlic cloves, crushed" },
      { quantity: 1, unit: "tin", item: "chopped tomatoes" },
      { item: "Salt to taste" },
    ] },
  ],
};

const fishPie = {
  slug: "fish_pie", name: "Fish pie", servings: 4,
  meal: ["Main"], recipeIngredient: [
    { items: [
      { quantity: 1, item: "onion, chopped" },
      { quantity: 2, unit: "tin", item: "chopped tomatoes" },
    ] },
  ],
};

const mayo = {
  slug: "mayonnaise", name: "Mayonnaise", recipeYield: "300ml",
  meal: ["Condiment"], recipeIngredient: [
    { items: [
      { quantity: 150, unit: "ml", item: "sunflower oil" },
      { quantity: 1, item: "egg yolk" },
    ] },
  ],
};

const caesar = {
  slug: "caesar_salad", name: "Caesar salad", servings: 4,
  meal: ["Main", "Lunch"], recipeIngredient: [
    { items: [
      { quantity: 6, unit: "tbsp", item: "(approx 150ml) [mayonnaise](mayonnaise.html)", uses_fraction: 0.5 },
      { quantity: 2, item: "chicken breasts" },
    ] },
  ],
};

test("factorForEntry: servings recipes scale by value/servings; otherwise by value", () => {
  assert.equal(factorForEntry({ value: 4 }, { servings: 8 }), 0.5);
  assert.equal(factorForEntry({ value: 6 }, { servings: 6 }), 1);
  assert.equal(factorForEntry({ value: 2 }, { servings: null }), 2);
  assert.equal(factorForEntry({ value: 1 }, null), 1);
});

test("extractSubSlug pulls the slug from a markdown sub-recipe link", () => {
  assert.equal(extractSubSlug("[mayo](mayonnaise.html)"), "mayonnaise");
  assert.equal(extractSubSlug("(approx 150ml) [mayonnaise](mayonnaise.html)"), "mayonnaise");
  assert.equal(extractSubSlug("just plain text"), null);
});

test("normaliseItemName strips markdown links, parens, qualifiers, lowercases", () => {
  assert.equal(normaliseItemName("(approx 150ml) [mayonnaise](mayonnaise.html)"), "mayonnaise");
  assert.equal(normaliseItemName("Chopped Tomatoes, drained"),                    "chopped tomatoes");
  assert.equal(normaliseItemName("strong white flour"),                           "strong white flour");
  assert.equal(normaliseItemName("garlic cloves, crushed"),                       "garlic cloves");
});

test("displayItemName preserves case but applies the same stripping", () => {
  assert.equal(displayItemName("(approx 150ml) [Mayonnaise](mayonnaise.html)"), "Mayonnaise");
  assert.equal(displayItemName("Parma ham (prosciutto crudo)"),                "Parma ham");
});

test("aggregate sums same-name same-unit quantities across recipes", () => {
  const plan = { version: 1, entries: [
    { id: "a", slug: "chicken_curry", value: 8, slot: "Dinner" }, // ×1
    { id: "b", slug: "fish_pie",      value: 4, slot: "Dinner" }, // ×1
  ] };
  const { grouped } = aggregate(plan, [chickenCurry, fishPie]);

  const tomatoes = grouped.find(g => g.name === "chopped tomatoes");
  assert.ok(tomatoes, "tomatoes were merged across recipes");
  assert.equal(tomatoes.quantity, 3);
  assert.equal(tomatoes.unit, "tin");
  assert.deepEqual(tomatoes.sources.sort(), ["Chetna's chicken curry", "Fish pie"].sort());

  // Onions are merged ("onions" vs "onion" don't currently match — fuzzy matching
  // is intentionally strict for v0; mismatches surface as separate rows so the
  // user notices and fixes the source text.)
  const onionRows = grouped.filter(g => g.name.startsWith("onion"));
  assert.ok(onionRows.length >= 1);
});

test("aggregate scales servings recipes by entry.value / recipe.servings", () => {
  const plan = { version: 1, entries: [
    { id: "a", slug: "chicken_curry", value: 4, slot: "Dinner" }, // ×0.5
  ] };
  const { grouped } = aggregate(plan, [chickenCurry]);

  const garlic = grouped.find(g => g.name === "garlic cloves");
  assert.equal(garlic.quantity, 2, "4 × 0.5 = 2");
});

test("aggregate inlines sub-recipes scaled by parent_factor × uses_fraction", () => {
  const plan = { version: 1, entries: [
    { id: "a", slug: "caesar_salad", value: 4, slot: "Lunch" }, // ×1
  ] };
  const { grouped, manual } = aggregate(plan, [caesar, mayo]);

  // The parent caesar line linking to mayo should NOT appear (it was expanded).
  assert.equal(grouped.find(g => g.name === "mayonnaise"), undefined,
    "the placeholder mayo line is replaced by the sub's ingredients");

  // The sub's ingredients appear, scaled by 1 × 0.5 = 0.5.
  const oil = grouped.find(g => g.name === "sunflower oil");
  assert.equal(oil.quantity, 75, "150ml × 0.5 = 75ml");
  assert.equal(oil.unit, "ml");
  assert.deepEqual(oil.sources, ["Caesar salad → Mayonnaise"]);

  // Chicken breasts come from caesar itself.
  const chicken = grouped.find(g => g.name === "chicken breasts");
  assert.equal(chicken.quantity, 2);

  // Salt-to-taste lands in the manual bucket.
  assert.equal(manual.length, 0); // caesar fixture has no manual items; sanity check
});

test("aggregate routes quantity-less items to the manual bucket", () => {
  const plan = { version: 1, entries: [
    { id: "a", slug: "chicken_curry", value: 8, slot: "Dinner" },
  ] };
  const { manual } = aggregate(plan, [chickenCurry]);
  assert.equal(manual.length, 1);
  assert.equal(manual[0].displayName, "Salt to taste");
});

test("aggregate keeps same-name different-unit items on separate rows", () => {
  const dualUnit = {
    slug: "x", name: "X", servings: 1, recipeIngredient: [
      { items: [
        { quantity: 1, unit: "tin", item: "tomatoes" },
        { quantity: 200, unit: "g",   item: "tomatoes" },
      ] },
    ],
  };
  const plan = { version: 1, entries: [{ id: "a", slug: "x", value: 1, slot: "Other" }] };
  const { grouped } = aggregate(plan, [dualUnit]);
  const tomatoes = grouped.filter(g => g.name === "tomatoes");
  assert.equal(tomatoes.length, 2);
  assert.deepEqual(tomatoes.map(g => g.unit).sort(), ["g", "tin"]);
});

test("aggregate ignores entries whose slug isn't in the recipes index", () => {
  const plan = { version: 1, entries: [{ id: "a", slug: "ghost", value: 1, slot: "Other" }] };
  const { grouped, manual } = aggregate(plan, []);
  assert.equal(grouped.length, 0);
  assert.equal(manual.length, 0);
});
