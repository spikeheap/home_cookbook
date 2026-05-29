// Meal plan: a localStorage-backed list of `{ id, slug, value, slot }` entries,
// grouped into Breakfast / Lunch / Dinner / Other when rendered.
//
// `value` is the user-facing number — people count for recipes with `servings`,
// multiplier otherwise. The aggregator derives the scaling factor from it.

import { formatQuantity, formatQuantityWithUnit, nextOnLadder } from "./scale.js";
import { aggregate } from "./aggregator.js";

const STORAGE_KEY = "cookbook.plan";
const VERSION     = 1;

export const SLOT_ORDER = ["Breakfast", "Lunch", "Dinner", "Other"];

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `e${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyPlan() {
  return { version: VERSION, entries: [] };
}

export function loadPlan(storage) {
  if (!storage) return emptyPlan();
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); } catch (_) { return emptyPlan(); }
  if (!raw) return emptyPlan();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === VERSION && Array.isArray(parsed.entries)) {
      return parsed;
    }
  } catch (_) {}
  return emptyPlan();
}

export function savePlan(plan, storage) {
  if (!storage) return;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(plan)); } catch (_) {}
}

export function addEntry(plan, { slug, value, slot }) {
  const entry = { id: newId(), slug, value, slot };
  return { ...plan, entries: [...plan.entries, entry] };
}

export function removeEntry(plan, id) {
  return { ...plan, entries: plan.entries.filter(e => e.id !== id) };
}

export function updateEntry(plan, id, patch) {
  return {
    ...plan,
    entries: plan.entries.map(e => (e.id === id ? { ...e, ...patch } : e)),
  };
}

export function clearEntries(plan) {
  return { ...plan, entries: [] };
}

export function modeForRecipe(recipe) {
  return recipe && recipe.servings && recipe.servings > 0 ? "servings" : "multiplier";
}

export function defaultValueForRecipe(recipe) {
  return modeForRecipe(recipe) === "servings" ? recipe.servings : 1;
}

export function slotForMeal(meals) {
  if (Array.isArray(meals)) {
    if (meals.includes("Breakfast")) return "Breakfast";
    if (meals.includes("Lunch"))     return "Lunch";
    if (meals.includes("Main"))      return "Dinner";
  }
  return "Other";
}

export function slotForRecipe(recipe) {
  return slotForMeal(recipe && recipe.meal);
}

export function addRecipeToPlan({ slug, value, slot, storage = (typeof localStorage !== "undefined" ? localStorage : null) }) {
  if (!slug || !slot) return null;
  const plan = loadPlan(storage);
  const next = addEntry(plan, { slug, value, slot });
  savePlan(next, storage);
  return next;
}

export function nextStepValue(value, direction, mode) {
  if (mode === "servings") {
    return direction === "up" ? value + 1 : Math.max(1, value - 1);
  }
  return nextOnLadder(value, direction);
}

export function groupBySlot(entries) {
  const buckets = Object.fromEntries(SLOT_ORDER.map(s => [s, []]));
  for (const e of entries) {
    const slot = SLOT_ORDER.includes(e.slot) ? e.slot : "Other";
    buckets[slot].push(e);
  }
  return SLOT_ORDER.map(slot => ({ slot, entries: buckets[slot] }));
}

// ---- DOM wiring ------------------------------------------------------------

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderEntry(entry, recipe) {
  const mode  = modeForRecipe(recipe);
  const label = mode === "servings" ? "Serves" : "Make";
  const valueText = mode === "servings" ? String(entry.value) : `×${formatQuantity(entry.value)}`;
  return `
    <li class="plan-entry" data-plan-entry-id="${esc(entry.id)}">
      <a class="plan-entry__name" href="${esc(recipe.url)}">${esc(recipe.name)}</a>
      <div class="plan-entry__stepper">
        <span class="plan-entry__label">${esc(label)}</span>
        <button type="button" class="plan-entry__step" data-plan-step="down" data-plan-id="${esc(entry.id)}" aria-label="Decrease">−</button>
        <span class="plan-entry__value">${esc(valueText)}</span>
        <button type="button" class="plan-entry__step" data-plan-step="up"   data-plan-id="${esc(entry.id)}" aria-label="Increase">+</button>
      </div>
      <button type="button" class="plan-entry__remove" data-plan-remove="${esc(entry.id)}" aria-label="Remove from plan">×</button>
    </li>
  `;
}

function renderGroup({ slot, entries }, recipesIndex) {
  const items = entries
    .map(e => renderEntry(e, recipesIndex.get(e.slug)))
    .filter(Boolean)
    .join("");
  return `
    <section class="plan-group" data-plan-slot="${esc(slot)}">
      <h2 class="plan-group__title">${esc(slot)} <span class="plan-group__count">${entries.length}</span></h2>
      <ul class="plan-group__list">${items}</ul>
    </section>
  `;
}

function renderShopItem(item) {
  const qty     = formatQuantityWithUnit(item.quantity, item.unit);
  const sources = item.sources.length > 2
    ? `${item.sources.length} recipes`
    : item.sources.join(", ");
  return `
    <li>
      <span class="plan-shop__qty">${esc(qty)}</span>
      <span class="plan-shop__name">${esc(item.displayName)}</span>
      <span class="plan-shop__sources">${esc(sources)}</span>
    </li>
  `;
}

function renderManualItem(item) {
  return `
    <li>
      <span class="plan-shop__name">${esc(item.displayName)}</span>
      <span class="plan-shop__sources">${esc(item.source)}</span>
    </li>
  `;
}

function shoppingListText(agg) {
  const lines = agg.grouped.map(g => `${formatQuantityWithUnit(g.quantity, g.unit)} ${g.displayName}`.trim());
  if (agg.manual.length > 0) {
    lines.push("", "To add manually:");
    for (const m of agg.manual) lines.push(`- ${m.displayName}`);
  }
  return lines.join("\n");
}

export function setupPlan({ root, recipes, storage = (typeof localStorage !== "undefined" ? localStorage : null) }) {
  if (!root) return null;
  const listEl       = root.querySelector("[data-plan-list]");
  const emptyEl      = root.querySelector("[data-plan-empty]");
  const clearBtn     = root.querySelector('[data-plan-action="clear"]');
  const copyBtn      = root.querySelector('[data-plan-action="copy"]');
  const shopEl       = root.querySelector("[data-plan-shop]");
  const shopCountEl  = root.querySelector("[data-plan-shop-count]");
  const shopItemsEl  = root.querySelector("[data-plan-shop-items]");
  const shopManualEl       = root.querySelector("[data-plan-shop-manual]");
  const shopManualItemsEl  = root.querySelector("[data-plan-shop-manual-items]");
  if (!listEl) return null;

  const recipesIndex = new Map((recipes || []).map(r => [r.slug, r]));
  let plan = loadPlan(storage);

  function renderShop() {
    if (!shopEl) return;
    if (plan.entries.length === 0) { shopEl.hidden = true; return; }

    const agg   = aggregate(plan, recipes || []);
    const total = agg.grouped.length + agg.manual.length;
    if (total === 0) { shopEl.hidden = true; return; }

    shopEl.hidden = false;
    if (shopCountEl) shopCountEl.textContent = `${total} item${total === 1 ? "" : "s"}`;
    if (shopItemsEl) shopItemsEl.innerHTML = agg.grouped.map(renderShopItem).join("");

    if (shopManualEl) {
      if (agg.manual.length === 0) {
        shopManualEl.hidden = true;
        if (shopManualItemsEl) shopManualItemsEl.innerHTML = "";
      } else {
        shopManualEl.hidden = false;
        if (shopManualItemsEl) shopManualItemsEl.innerHTML = agg.manual.map(renderManualItem).join("");
      }
    }
  }

  function render() {
    if (plan.entries.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      listEl.innerHTML = "";
      renderShop();
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    const groups = groupBySlot(plan.entries).filter(g => g.entries.length > 0);
    listEl.innerHTML = groups.map(g => renderGroup(g, recipesIndex)).join("");
    renderShop();
  }

  function commit(next) {
    plan = next;
    savePlan(plan, storage);
    render();
  }

  listEl.addEventListener("click", e => {
    const removeBtn = e.target.closest("[data-plan-remove]");
    if (removeBtn) {
      commit(removeEntry(plan, removeBtn.dataset.planRemove));
      return;
    }
    const stepBtn = e.target.closest("[data-plan-step]");
    if (stepBtn) {
      const id     = stepBtn.dataset.planId;
      const dir    = stepBtn.dataset.planStep;
      const entry  = plan.entries.find(x => x.id === id);
      if (!entry) return;
      const recipe = recipesIndex.get(entry.slug);
      if (!recipe) return;
      const mode      = modeForRecipe(recipe);
      const nextValue = nextStepValue(entry.value, dir, mode);
      commit(updateEntry(plan, id, { value: nextValue }));
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (plan.entries.length === 0) return;
      if (typeof confirm === "function" && !confirm("Clear the meal plan?")) return;
      commit(clearEntries(plan));
    });
  }

  if (copyBtn) {
    const originalLabel = copyBtn.textContent;
    copyBtn.addEventListener("click", async () => {
      const text = shoppingListText(aggregate(plan, recipes || []));
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied";
        setTimeout(() => { copyBtn.textContent = originalLabel; }, 1500);
      } catch (_) {
        copyBtn.textContent = "Copy failed";
        setTimeout(() => { copyBtn.textContent = originalLabel; }, 1500);
      }
    });
  }

  render();

  return {
    add({ slug }) {
      const recipe = recipesIndex.get(slug);
      if (!recipe) return;
      commit(addEntry(plan, {
        slug,
        value: defaultValueForRecipe(recipe),
        slot:  slotForRecipe(recipe),
      }));
    },
    getPlan: () => plan,
  };
}
