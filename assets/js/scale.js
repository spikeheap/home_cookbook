// Recipe scaling: multiply ingredient quantities by ½ / 1 / 2 / 3.
//
// Items without a numeric quantity (e.g. "Salt and pepper to taste",
// markdown-only entries) get a "× N" hint when the recipe is at non-1
// scale, so the cook is reminded to adjust them by hand. Sub-recipe
// ingredients are deliberately not scaled — the right model for that
// would need a "fraction-of-yield" concept, see Readme.

const ATTACHED_UNITS = new Set(["g", "kg", "mg", "ml", "l", "cl", "oz", "lb"]);

const COMMON_FRACTIONS = new Map([
  [0.5,    "½"], [0.25,    "¼"], [0.75,   "¾"],
  [1/3,    "⅓"], [2/3,     "⅔"],
  [0.2,    "⅕"], [0.4,     "⅖"], [0.6,    "⅗"], [0.8,    "⅘"],
  [1/6,    "⅙"], [5/6,     "⅚"],
  [0.125,  "⅛"], [0.375,   "⅜"], [0.625,  "⅝"], [0.875,  "⅞"],
]);

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

function inSubRecipe(el) {
  return typeof el.closest === "function" ? !!el.closest(".sub-recipe") : false;
}

function gatherFromRoot(root) {
  const qtyElements = Array.from(root.querySelectorAll(".ingredient__qty[data-quantity]"))
    .filter(el => !inSubRecipe(el));
  const hintElements = Array.from(root.querySelectorAll("[data-scale-hint]"))
    .filter(el => !inSubRecipe(el));
  const buttons = Array.from(root.querySelectorAll(".tool--scale > button[data-scale]"));
  return { qtyElements, hintElements, buttons };
}

export function setupScale(opts = {}) {
  let { qtyElements, hintElements, buttons, root } = opts;

  if (root && (qtyElements == null || hintElements == null || buttons == null)) {
    const gathered = gatherFromRoot(root);
    qtyElements  = qtyElements  ?? gathered.qtyElements;
    hintElements = hintElements ?? gathered.hintElements;
    buttons      = buttons      ?? gathered.buttons;
  }
  if (!buttons || buttons.length === 0) return null;

  let factor = 1;

  function apply(newFactor) {
    factor = newFactor;

    qtyElements.forEach(el => {
      const baseQty = parseFloat(el.dataset.quantity);
      const baseMax = el.dataset.quantityMax ? parseFloat(el.dataset.quantityMax) : null;
      const unit    = el.dataset.unit || null;
      el.textContent = formatQtyWithUnit(baseQty * factor, baseMax != null ? baseMax * factor : null, unit);
    });

    hintElements.forEach(el => {
      if (factor === 1) {
        el.hidden = true;
        el.textContent = "";
      } else {
        el.hidden = false;
        el.textContent = `× ${formatQuantity(factor)}`;
      }
    });

    buttons.forEach(b => {
      const bf = parseFloat(b.dataset.scale);
      b.setAttribute("aria-pressed", bf === factor ? "true" : "false");
    });
  }

  buttons.forEach(b => {
    b.addEventListener("click", () => {
      const f = parseFloat(b.dataset.scale);
      if (Number.isFinite(f)) apply(f);
    });
  });

  return {
    apply,
    getFactor: () => factor,
  };
}

if (typeof document !== "undefined") {
  const root = document.querySelector(".recipe");
  if (root) setupScale({ root });
}
