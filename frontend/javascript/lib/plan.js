// Meal plan: a localStorage-backed list of `{ id, slug, value, slot }` entries,
// grouped into Breakfast / Lunch / Dinner / Other when rendered.
//
// `value` is the user-facing number — people count for recipes with `servings`,
// multiplier otherwise. The aggregator derives the scaling factor from it.

import { formatQuantity, nextOnLadder } from "./scale.js";

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

export function slotForRecipe(recipe) {
  const meals = recipe && Array.isArray(recipe.meal) ? recipe.meal : [];
  if (meals.includes("Breakfast")) return "Breakfast";
  if (meals.includes("Lunch"))     return "Lunch";
  if (meals.includes("Main"))      return "Dinner";
  return "Other";
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

export function setupPlan({ root, recipes, storage = (typeof localStorage !== "undefined" ? localStorage : null) }) {
  if (!root) return null;
  const listEl  = root.querySelector("[data-plan-list]");
  const emptyEl = root.querySelector("[data-plan-empty]");
  const clearBtn = root.querySelector('[data-plan-action="clear"]');
  if (!listEl) return null;

  const recipesIndex = new Map((recipes || []).map(r => [r.slug, r]));
  let plan = loadPlan(storage);

  function render() {
    if (plan.entries.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      listEl.innerHTML = "";
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    const groups = groupBySlot(plan.entries).filter(g => g.entries.length > 0);
    listEl.innerHTML = groups.map(g => renderGroup(g, recipesIndex)).join("");
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
