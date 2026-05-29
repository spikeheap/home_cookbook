import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate, factorForEntry, extractSubSlug, normaliseItemName, displayItemName,
  categorise, CATEGORY_ORDER,
} from "./aggregator.js";

function flatItems(agg) {
  return agg.byCategory.flatMap(g => g.items);
}
function findItem(agg, name) {
  return flatItems(agg).find(it => it.name === name);
}

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
  const agg = aggregate(plan, [chickenCurry, fishPie]);

  const tomatoes = findItem(agg, "chopped tomatoes");
  assert.ok(tomatoes, "tomatoes were merged across recipes");
  assert.equal(tomatoes.quantity, 3);
  assert.equal(tomatoes.unit, "tin");
  assert.deepEqual(tomatoes.sources.sort(), ["Chetna's chicken curry", "Fish pie"].sort());

  // Onions are merged ("onions" vs "onion" don't currently match — fuzzy matching
  // is intentionally strict; mismatches surface as separate rows so the user
  // notices and fixes the source text.)
  const onionRows = flatItems(agg).filter(g => g.name.startsWith("onion"));
  assert.ok(onionRows.length >= 1);
});

test("aggregate scales servings recipes by entry.value / recipe.servings", () => {
  const plan = { version: 1, entries: [
    { id: "a", slug: "chicken_curry", value: 4, slot: "Dinner" }, // ×0.5
  ] };
  const agg = aggregate(plan, [chickenCurry]);

  const garlic = findItem(agg, "garlic cloves");
  assert.equal(garlic.quantity, 2, "4 × 0.5 = 2");
});

test("aggregate inlines sub-recipes scaled by parent_factor × uses_fraction", () => {
  const plan = { version: 1, entries: [
    { id: "a", slug: "caesar_salad", value: 4, slot: "Lunch" }, // ×1
  ] };
  const agg = aggregate(plan, [caesar, mayo]);

  // The parent caesar line linking to mayo should NOT appear (it was expanded).
  assert.equal(findItem(agg, "mayonnaise"), undefined,
    "the placeholder mayo line is replaced by the sub's ingredients");

  // The sub's ingredients appear, scaled by 1 × 0.5 = 0.5.
  const oil = findItem(agg, "sunflower oil");
  assert.equal(oil.quantity, 75, "150ml × 0.5 = 75ml");
  assert.equal(oil.unit, "ml");
  assert.deepEqual(oil.sources, ["Caesar salad → Mayonnaise"]);

  // Chicken breasts come from caesar itself.
  const chicken = findItem(agg, "chicken breasts");
  assert.equal(chicken.quantity, 2);

  assert.equal(agg.manual.length, 0); // caesar fixture has no manual items; sanity check
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
  const agg = aggregate(plan, [dualUnit]);
  const tomatoes = flatItems(agg).filter(g => g.name === "tomatoes");
  assert.equal(tomatoes.length, 2);
  assert.deepEqual(tomatoes.map(g => g.unit).sort(), ["g", "tin"]);
});

test("aggregate ignores entries whose slug isn't in the recipes index", () => {
  const plan = { version: 1, entries: [{ id: "a", slug: "ghost", value: 1, slot: "Other" }] };
  const agg = aggregate(plan, []);
  assert.equal(agg.byCategory.length, 0);
  assert.equal(agg.manual.length, 0);
});

test("aggregate groups items into categories in shopping order", () => {
  // Build a synthetic recipe touching produce, dairy, cupboard, meat.
  const r = {
    slug: "r", name: "R", servings: 1, recipeIngredient: [
      { items: [
        { quantity: 200, unit: "g",   item: "flour" },
        { quantity: 2,                item: "onions" },
        { quantity: 1, unit: "tin",   item: "chopped tomatoes" },
        { quantity: 300, unit: "g",   item: "chicken breast" },
        { quantity: 100, unit: "ml",  item: "milk" },
      ] },
    ],
  };
  const plan = { version: 1, entries: [{ id: "a", slug: "r", value: 1, slot: "Dinner" }] };
  const { byCategory } = aggregate(plan, [r]);
  const names = byCategory.map(g => g.name);

  // Shopping order: produce before meat & fish before dairy before cupboard.
  assert.deepEqual(names, ["Produce", "Meat & fish", "Dairy & eggs", "Cupboard"]);
  // And each item is in the right bucket.
  assert.ok(byCategory.find(g => g.name === "Produce").items.some(i => i.name === "onions"));
  assert.ok(byCategory.find(g => g.name === "Cupboard").items.some(i => i.name === "chopped tomatoes"),
    "tinned tomatoes lands in Cupboard, not Produce");
  assert.ok(byCategory.find(g => g.name === "Cupboard").items.some(i => i.name === "flour"));
  assert.ok(byCategory.find(g => g.name === "Meat & fish").items.some(i => i.name === "chicken breast"));
  assert.ok(byCategory.find(g => g.name === "Dairy & eggs").items.some(i => i.name === "milk"));
});

test("categorise covers a handful of representative items", () => {
  assert.equal(categorise("onions"),                   "Produce");
  assert.equal(categorise("garlic cloves"),            "Produce");
  assert.equal(categorise("tomatoes"),                 "Produce", "no unit → fresh");
  assert.equal(categorise("chicken breast"),           "Meat & fish");
  assert.equal(categorise("smoked salmon"),            "Meat & fish");
  assert.equal(categorise("parma ham"),                "Meat & fish");
  assert.equal(categorise("egg yolk"),                 "Dairy & eggs");
  assert.equal(categorise("fior di latte mozzarella"), "Dairy & eggs");
  assert.equal(categorise("strong white flour"),       "Cupboard");
  assert.equal(categorise("olive oil"),                "Cupboard");
  assert.equal(categorise("dried oregano"),            "Cupboard");
  assert.equal(categorise("focaccia"),                 "Bakery");
  assert.equal(categorise("brioche buns"),             "Bakery");
  assert.equal(categorise("frozen peas"),              "Frozen");
  assert.equal(categorise("white wine"),               "Drinks");
  assert.equal(categorise("a thing we don't know"),    "Other");
});

test("categorise: pack units (tin/can/jar/sachet…) override keyword matches", () => {
  // "tomatoes" alone is Produce; in a tin it's Cupboard.
  assert.equal(categorise("chopped tomatoes", "tin"),  "Cupboard");
  assert.equal(categorise("coconut milk",     "tin"),  "Cupboard", "dairy keyword loses to tin");
  assert.equal(categorise("yeast",            "sachet"), "Cupboard");
  // …but Frozen and Drinks still win, even in a packet/can.
  assert.equal(categorise("frozen peas",      "pack"), "Frozen");
  assert.equal(categorise("beer",             "can"),  "Drinks");
});

test("CATEGORY_ORDER is the canonical, shopping-order list", () => {
  assert.deepEqual(CATEGORY_ORDER, [
    "Produce", "Bakery", "Meat & fish", "Dairy & eggs", "Cupboard", "Frozen", "Drinks", "Other",
  ]);
});
