import { test } from "node:test";
import assert from "node:assert/strict";
import { setupScale, formatQuantity } from "./scale.js";

// Hand-rolled fakes mirroring the small DOM surface scale.js touches.

function makeQty({ quantity, quantity_max = null, unit = null } = {}) {
  const dataset = { quantity: String(quantity) };
  if (quantity_max != null) dataset.quantityMax = String(quantity_max);
  if (unit != null)         dataset.unit        = unit;
  return {
    dataset,
    textContent: "",
    closest: () => null,
  };
}

function makeHint() {
  return {
    hidden: true,
    textContent: "",
    closest: () => null,
  };
}

function makeButton(scale) {
  const listeners = {};
  return {
    dataset: { scale: String(scale) },
    attrs:   {},
    listeners,
    addEventListener(type, fn) { listeners[type] = fn; },
    setAttribute(k, v)         { this.attrs[k] = v; },
    click()                    { listeners.click && listeners.click(); },
  };
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

test("returns null when there are no scale buttons", () => {
  const handle = setupScale({ buttons: [], qtyElements: [], hintElements: [] });
  assert.strictEqual(handle, null);
});

test("clicking a scale button multiplies each quantity and sets aria-pressed", () => {
  const qty1 = makeQty({ quantity: 200, unit: "g" });
  const qty2 = makeQty({ quantity: 1,   unit: "tsp" });
  const buttons = [makeButton(0.5), makeButton(1), makeButton(2), makeButton(3)];

  setupScale({ qtyElements: [qty1, qty2], hintElements: [], buttons });

  buttons[2].click(); // 2x

  assert.equal(qty1.textContent, "400g");
  assert.equal(qty2.textContent, "2 tsp");
  assert.equal(buttons[0].attrs["aria-pressed"], "false");
  assert.equal(buttons[1].attrs["aria-pressed"], "false");
  assert.equal(buttons[2].attrs["aria-pressed"], "true");
  assert.equal(buttons[3].attrs["aria-pressed"], "false");
});

test("ranges scale both endpoints", () => {
  const qty = makeQty({ quantity: 4, quantity_max: 6, unit: "slices" });
  const buttons = [makeButton(0.5), makeButton(2)];

  setupScale({ qtyElements: [qty], hintElements: [], buttons });

  buttons[1].click(); // 2x
  assert.equal(qty.textContent, "8–12 slices");

  buttons[0].click(); // 0.5x
  assert.equal(qty.textContent, "2–3 slices");
});

test("scaling halves to common fractions", () => {
  const qty = makeQty({ quantity: 1, unit: "tsp" });
  const buttons = [makeButton(0.5)];

  setupScale({ qtyElements: [qty], hintElements: [], buttons });
  buttons[0].click();

  assert.equal(qty.textContent, "½ tsp");
});

test("scale hint shows '× N' on unscaled items at non-1 factor, hides at 1", () => {
  const hint = makeHint();
  const buttons = [makeButton(1), makeButton(2)];

  setupScale({ qtyElements: [], hintElements: [hint], buttons });

  buttons[1].click();
  assert.equal(hint.hidden, false);
  assert.equal(hint.textContent, "× 2");

  buttons[0].click();
  assert.equal(hint.hidden, true);
  assert.equal(hint.textContent, "");
});

test("re-scaling always uses the original quantity (no compounding)", () => {
  const qty = makeQty({ quantity: 100, unit: "g" });
  const buttons = [makeButton(2), makeButton(3), makeButton(0.5)];

  setupScale({ qtyElements: [qty], hintElements: [], buttons });

  buttons[0].click();
  assert.equal(qty.textContent, "200g");
  buttons[1].click();
  assert.equal(qty.textContent, "300g");
  buttons[2].click();
  assert.equal(qty.textContent, "50g");
});

test("attached units render without a space; word units render with one", () => {
  const grams = makeQty({ quantity: 100, unit: "g" });
  const cup   = makeQty({ quantity: 1,   unit: "cup" });
  const buttons = [makeButton(1)];

  setupScale({ qtyElements: [grams, cup], hintElements: [], buttons });
  buttons[0].click();

  assert.equal(grams.textContent, "100g");
  assert.equal(cup.textContent,   "1 cup");
});

test("getFactor reports the active scale", () => {
  const buttons = [makeButton(2), makeButton(0.5)];
  const handle = setupScale({ qtyElements: [], hintElements: [], buttons });

  assert.equal(handle.getFactor(), 1);
  buttons[0].click();
  assert.equal(handle.getFactor(), 2);
  buttons[1].click();
  assert.equal(handle.getFactor(), 0.5);
});

test("apply() can be called directly to set a factor programmatically", () => {
  const qty = makeQty({ quantity: 50, unit: "ml" });
  const buttons = [makeButton(1), makeButton(2)];

  const handle = setupScale({ qtyElements: [qty], hintElements: [], buttons });
  handle.apply(3);

  assert.equal(qty.textContent, "150ml");
  assert.equal(handle.getFactor(), 3);
});
