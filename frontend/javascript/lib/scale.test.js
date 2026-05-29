import { test } from "node:test";
import assert from "node:assert/strict";
import { setupScale, formatQuantity } from "./scale.js";

// Hand-rolled fakes mirroring the small DOM surface scale.js touches.

function makeSubRecipe(usesFraction) {
  return { dataset: { usesFraction: String(usesFraction) }, matches: sel => sel.includes(".sub-recipe") };
}

function makeQty({ quantity, quantity_max = null, unit = null, sub = null } = {}) {
  const dataset = { quantity: String(quantity) };
  if (quantity_max != null) dataset.quantityMax = String(quantity_max);
  if (unit != null)         dataset.unit        = unit;
  return {
    dataset,
    textContent: "",
    closest: sel => (sub && sel.includes(".sub-recipe") ? sub : null),
  };
}

function makeHint({ sub = null } = {}) {
  return {
    hidden: true,
    textContent: "",
    closest: sel => (sub && sel.includes(".sub-recipe") ? sub : null),
  };
}

function makeUsageEl(sub) {
  return {
    textContent: "",
    closest: sel => (sel.includes(".sub-recipe") ? sub : null),
  };
}

function makeButton() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, fn) { listeners[type] = fn; },
    click() { listeners.click && listeners.click(); },
  };
}

function makeValueEl() {
  return { textContent: "" };
}

function makeTool({ baseServings = null } = {}) {
  return { dataset: baseServings != null ? { baseServings: String(baseServings) } : {} };
}

function setup({ baseServings = null, qtys = [], hints = [], usageEls = [] } = {}) {
  const tool    = makeTool({ baseServings });
  const downBtn = makeButton();
  const upBtn   = makeButton();
  const valueEl = makeValueEl();
  const handle  = setupScale({
    tool, downBtn, upBtn, valueEl,
    qtyElements: qtys, hintElements: hints, usageEls,
  });
  return { handle, downBtn, upBtn, valueEl };
}

test("formatQuantity renders integers, common fractions, and falls back to decimals", () => {
  assert.equal(formatQuantity(1),    "1");
  assert.equal(formatQuantity(200),  "200");
  assert.equal(formatQuantity(0.5),  "½");
  assert.equal(formatQuantity(0.25), "¼");
  assert.equal(formatQuantity(0.75), "¾");
  assert.equal(formatQuantity(1/3),  "⅓");
  assert.equal(formatQuantity(1.5),  "1½");
  assert.equal(formatQuantity(2.25), "2¼");
  assert.equal(formatQuantity(0.07), "0.07");
});

test("returns null when there is no .tool--scale element", () => {
  const handle = setupScale({ root: null });
  assert.strictEqual(handle, null);
});

test("servings mode: stepper increments people and scales by value / baseServings", () => {
  const qty = makeQty({ quantity: 200, unit: "g" });
  const { handle, downBtn, upBtn, valueEl } = setup({ baseServings: 4, qtys: [qty] });

  assert.equal(handle.getMode(), "servings");
  assert.equal(handle.getValue(), 4);
  assert.equal(handle.getFactor(), 1);
  assert.equal(qty.textContent, "200g");
  assert.equal(valueEl.textContent, "4");

  upBtn.click();
  assert.equal(handle.getValue(), 5);
  assert.equal(qty.textContent, "250g");
  assert.equal(valueEl.textContent, "5");

  downBtn.click(); downBtn.click(); downBtn.click();
  assert.equal(handle.getValue(), 2);
  assert.equal(qty.textContent, "100g");
});

test("servings mode: minimum 1 person; further decreases are no-ops", () => {
  const { handle, downBtn } = setup({ baseServings: 2 });
  downBtn.click(); // 1
  downBtn.click(); // still 1
  downBtn.click();
  assert.equal(handle.getValue(), 1);
});

test("multiplier mode: walks the ½ / 1 / 2 / 3 … ladder", () => {
  const qty = makeQty({ quantity: 100, unit: "g" });
  const { handle, downBtn, upBtn, valueEl } = setup({ qtys: [qty] });

  assert.equal(handle.getMode(), "multiplier");
  assert.equal(handle.getValue(), 1);
  assert.equal(valueEl.textContent, "×1");

  upBtn.click();
  assert.equal(handle.getValue(), 2);
  assert.equal(qty.textContent, "200g");
  assert.equal(valueEl.textContent, "×2");

  upBtn.click();
  assert.equal(handle.getValue(), 3);
  assert.equal(qty.textContent, "300g");

  downBtn.click(); downBtn.click(); downBtn.click();
  assert.equal(handle.getValue(), 0.5);
  assert.equal(qty.textContent, "50g");
  assert.equal(valueEl.textContent, "×½");
});

test("multiplier mode: clamped at the top of the ladder", () => {
  const { handle, upBtn } = setup();
  for (let i = 0; i < 20; i++) upBtn.click();
  assert.equal(handle.getValue(), 10);
});

test("ranges scale both endpoints", () => {
  const qty = makeQty({ quantity: 4, quantity_max: 6, unit: "slices" });
  const { upBtn } = setup({ qtys: [qty] });

  upBtn.click(); // ×2
  assert.equal(qty.textContent, "8–12 slices");
});

test("scale hint shows '× N' on unscaled items at non-1 factor, hides at 1", () => {
  const hint = makeHint();
  const { downBtn, upBtn } = setup({ hints: [hint] });

  upBtn.click(); // ×2
  assert.equal(hint.hidden, false);
  assert.equal(hint.textContent, "× 2");

  downBtn.click(); // back to ×1
  assert.equal(hint.hidden, true);
  assert.equal(hint.textContent, "");
});

test("re-scaling always uses the original quantity (no compounding)", () => {
  const qty = makeQty({ quantity: 100, unit: "g" });
  const { upBtn, downBtn } = setup({ qtys: [qty] });

  upBtn.click(); assert.equal(qty.textContent, "200g");
  upBtn.click(); assert.equal(qty.textContent, "300g");
  downBtn.click(); downBtn.click(); downBtn.click(); // back to ½
  assert.equal(qty.textContent, "50g");
});

test("attached units render without a space; word units render with one", () => {
  const grams = makeQty({ quantity: 100, unit: "g" });
  const cup   = makeQty({ quantity: 1,   unit: "cup" });
  setup({ qtys: [grams, cup] });

  assert.equal(grams.textContent, "100g");
  assert.equal(cup.textContent,   "1 cup");
});

test("initial render normalises decimal quantities into fraction glyphs", () => {
  const qty = makeQty({ quantity: 0.5, unit: "tsp" });
  setup({ qtys: [qty] });
  assert.equal(qty.textContent, "½ tsp");
});

test("sub-recipe items scale by factor × uses_fraction", () => {
  const sub      = makeSubRecipe(0.5);
  const parent   = makeQty({ quantity: 4, unit: "people" });
  const subItem  = makeQty({ quantity: 200, unit: "ml", sub });
  const { upBtn } = setup({ qtys: [parent, subItem] });

  // At scale ×1, sub item shows half of base: 100ml.
  assert.equal(subItem.textContent, "100ml");
  assert.equal(parent.textContent,  "4 people");

  upBtn.click(); // ×2 — sub item becomes a full batch (200ml).
  assert.equal(subItem.textContent, "200ml");
  assert.equal(parent.textContent,  "8 people");
});

test("sub-recipe hint shows the combined effective factor", () => {
  const sub  = makeSubRecipe(0.5);
  const hint = makeHint({ sub });
  const { upBtn } = setup({ hints: [hint] });

  // ×1 factor × 0.5 sub = 0.5 effective → hint visible.
  assert.equal(hint.hidden, false);
  assert.equal(hint.textContent, "× ½");

  upBtn.click(); // ×2 × 0.5 = 1 → hint hidden again.
  assert.equal(hint.hidden, true);
});

test("sub-recipe usage label updates with the parent stepper", () => {
  const sub      = makeSubRecipe(0.5);
  const usageEl  = makeUsageEl(sub);
  const { upBtn, downBtn } = setup({ baseServings: 4, usageEls: [usageEl] });

  assert.equal(usageEl.textContent, "make ½× batch");
  upBtn.click(); // 5 people → 5/4 × 0.5 = 0.625
  assert.equal(usageEl.textContent, "make ⅝× batch");
  downBtn.click(); downBtn.click(); downBtn.click(); // 2 people → 2/4 × 0.5 = ¼
  assert.equal(usageEl.textContent, "make ¼× batch");
});

test("setValue can be called directly to set a stepper value", () => {
  const qty = makeQty({ quantity: 50, unit: "ml" });
  const { handle, valueEl } = setup({ baseServings: 2, qtys: [qty] });

  handle.setValue(6);
  assert.equal(handle.getValue(), 6);
  assert.equal(handle.getFactor(), 3);
  assert.equal(qty.textContent, "150ml");
  assert.equal(valueEl.textContent, "6");
});
