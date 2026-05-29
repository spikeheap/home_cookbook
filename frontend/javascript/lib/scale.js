// Recipe scaling via a stepper. Two modes, driven by the .tool--scale element:
//
//   - servings mode  (data-base-servings="N") — stepper value is the number of
//     people; the scaling factor is value / N. Minimum 1 person.
//   - multiplier mode (no data-base-servings)  — stepper value is the multiplier
//     itself, walking the MULTIPLIER_LADDER (½, 1, 2, 3, …).
//
// Items inside an inlined sub-recipe (.sub-recipe[data-uses-fraction]) are
// scaled by factor × uses_fraction, so caesar's mayonnaise inlines at ½ batch
// at scale 1 and becomes a full batch at ×2. Items without a numeric quantity
// get a "× N" hint at non-1 effective factor.

const ATTACHED_UNITS = new Set(["g", "kg", "mg", "ml", "l", "cl", "oz", "lb"]);

const COMMON_FRACTIONS = new Map([
  [0.5,    "½"], [0.25,    "¼"], [0.75,   "¾"],
  [1/3,    "⅓"], [2/3,     "⅔"],
  [0.2,    "⅕"], [0.4,     "⅖"], [0.6,    "⅗"], [0.8,    "⅘"],
  [1/6,    "⅙"], [5/6,     "⅚"],
  [0.125,  "⅛"], [0.375,   "⅜"], [0.625,  "⅝"], [0.875,  "⅞"],
]);

const MULTIPLIER_LADDER = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function formatQuantity(n) {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  for (const [value, glyph] of COMMON_FRACTIONS) {
    if (Math.abs(n - value) < 1e-3) return glyph;
    if (n > 1 && Math.abs((n - Math.floor(n)) - value) < 1e-3) {
      return `${Math.floor(n)}${glyph}`;
    }
  }
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function formatQtyWithUnit(qty, qtyMax, unit) {
  let text = formatQuantity(qty);
  if (qtyMax != null) text += "–" + formatQuantity(qtyMax);
  if (unit) text += (ATTACHED_UNITS.has(unit) ? "" : " ") + unit;
  return text;
}

function subFractionFor(el) {
  if (typeof el.closest !== "function") return 1;
  const sub = el.closest(".sub-recipe[data-uses-fraction]");
  if (!sub) return 1;
  const f = parseFloat(sub.dataset.usesFraction);
  return Number.isFinite(f) && f > 0 ? f : 1;
}

function nextOnLadder(current, direction) {
  const idx = MULTIPLIER_LADDER.indexOf(current);
  if (idx === -1) return direction === "up" ? 1 : 0.5;
  const next = direction === "up" ? idx + 1 : idx - 1;
  return MULTIPLIER_LADDER[Math.max(0, Math.min(MULTIPLIER_LADDER.length - 1, next))];
}

export function setupScale(opts = {}) {
  const { root } = opts;
  const tool = opts.tool ?? (root ? root.querySelector(".tool--scale") : null);
  if (!tool) return null;

  const baseAttr = tool.dataset ? tool.dataset.baseServings : null;
  const baseServings = baseAttr ? parseInt(baseAttr, 10) : null;
  const mode = baseServings && baseServings > 0 ? "servings" : "multiplier";

  const downBtn = opts.downBtn ?? tool.querySelector('[data-step="down"]');
  const upBtn   = opts.upBtn   ?? tool.querySelector('[data-step="up"]');
  const valueEl = opts.valueEl ?? tool.querySelector("[data-scale-value]");

  const qtyItems = opts.qtyItems ?? (
    opts.qtyElements
      ? opts.qtyElements.map(el => ({ el, subFrac: subFractionFor(el) }))
      : root
        ? Array.from(root.querySelectorAll(".ingredient__qty[data-quantity]"))
            .map(el => ({ el, subFrac: subFractionFor(el) }))
        : []
  );
  const hintItems = opts.hintItems ?? (
    opts.hintElements
      ? opts.hintElements.map(el => ({ el, subFrac: subFractionFor(el) }))
      : root
        ? Array.from(root.querySelectorAll("[data-scale-hint]"))
            .map(el => ({ el, subFrac: subFractionFor(el) }))
        : []
  );
  const usageEls = opts.usageEls ?? (root
    ? Array.from(root.querySelectorAll(".sub-recipe[data-uses-fraction] [data-sub-usage]"))
    : []);

  let value  = mode === "servings" ? baseServings : 1;
  let factor = 1;

  function render() {
    qtyItems.forEach(({ el, subFrac }) => {
      const eff     = factor * subFrac;
      const baseQty = parseFloat(el.dataset.quantity);
      const baseMax = el.dataset.quantityMax ? parseFloat(el.dataset.quantityMax) : null;
      const unit    = el.dataset.unit || null;
      el.textContent = formatQtyWithUnit(baseQty * eff, baseMax != null ? baseMax * eff : null, unit);
    });

    hintItems.forEach(({ el, subFrac }) => {
      const eff = factor * subFrac;
      if (eff === 1) {
        el.hidden = true;
        el.textContent = "";
      } else {
        el.hidden = false;
        el.textContent = `× ${formatQuantity(eff)}`;
      }
    });

    usageEls.forEach(el => {
      const sub = typeof el.closest === "function"
        ? el.closest(".sub-recipe[data-uses-fraction]")
        : null;
      if (!sub) return;
      const sf = parseFloat(sub.dataset.usesFraction);
      if (!Number.isFinite(sf)) return;
      el.textContent = `make ${formatQuantity(factor * sf)}× batch`;
    });

    if (valueEl) {
      valueEl.textContent = mode === "servings" ? String(value) : `×${formatQuantity(value)}`;
    }
  }

  function setValue(newValue) {
    if (!Number.isFinite(newValue) || newValue <= 0) return;
    if (mode === "servings") newValue = Math.max(1, Math.round(newValue));
    value  = newValue;
    factor = mode === "servings" ? value / baseServings : value;
    render();
  }

  if (downBtn) {
    downBtn.addEventListener("click", () => {
      setValue(mode === "servings" ? value - 1 : nextOnLadder(value, "down"));
    });
  }
  if (upBtn) {
    upBtn.addEventListener("click", () => {
      setValue(mode === "servings" ? value + 1 : nextOnLadder(value, "up"));
    });
  }

  render();

  return {
    setValue,
    getValue:  () => value,
    getFactor: () => factor,
    getMode:   () => mode,
  };
}
