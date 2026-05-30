import "$styles/index.css";

import { setupTheme } from "./lib/theme.js";
import { setupSearch } from "./lib/search.js";
import { setupScale } from "./lib/scale.js";
import { setupWakeLock } from "./lib/wake-lock.js";
import { setupPrintExpansion } from "./lib/print.js";
import {
  setupPlan, togglePlanEntry, isInPlan,
  applyPlanMode, setupPlanModeToggle,
} from "./lib/plan.js";

// Apply the stored plan-mode flag at module load so the .plan-mode class
// lands as early as possible — minimises the brief flash of hidden buttons
// for users who have plan mode on. (Default off, in which case the CSS
// already hides them.)
applyPlanMode();

function init() {
  setupTheme({ btn: document.getElementById("theme-toggle") });

  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  if (searchInput && searchResults) {
    setupSearch({ input: searchInput, resultsEl: searchResults });
  }

  const recipeRoot = document.querySelector(".recipe");
  if (recipeRoot) {
    const scale = setupScale({ root: recipeRoot });
    setupWakeLock(recipeRoot.querySelector('[data-tool="wakelock"]'));
    setupPrintExpansion(recipeRoot);
    setupRecipeAddToPlan(recipeRoot, scale);
  }

  setupAddButtons(document);

  const planRoot = document.querySelector(".plan");
  if (planRoot) {
    const dataEl = document.getElementById("plan-recipes-data");
    let recipes = [];
    if (dataEl) {
      try {
        recipes = JSON.parse(dataEl.textContent);
      } catch (err) {
        console.warn("plan: failed to parse #plan-recipes-data; rendering with empty index", err);
        recipes = [];
      }
    } else {
      console.warn("plan: #plan-recipes-data not found on the page");
    }
    setupPlan({ root: planRoot, recipes });
    setupPlanModeToggle({ root: planRoot });
  }
}

function setAddedState(btn, added, { addedLabel, restLabel } = {}) {
  if (added) {
    btn.dataset.state = "added";
    if (addedLabel != null) btn.textContent = addedLabel;
  } else {
    delete btn.dataset.state;
    if (restLabel != null) btn.textContent = restLabel;
  }
}

function setupRecipeAddToPlan(recipeRoot, scale) {
  const btn = recipeRoot.querySelector('[data-tool="add-to-plan"]');
  if (!btn) return;
  const slug = recipeRoot.dataset.recipeSlug;
  const slot = recipeRoot.dataset.recipeSlot || "Other";
  if (!slug) return;

  const labelEl   = btn.querySelector(".tool__label");
  const addLabel  = "Add to plan";
  const inLabel   = "In plan";
  const setLabel  = (text) => { if (labelEl) labelEl.textContent = text; };

  const initial = isInPlan(slug);
  setAddedState(btn, initial);
  setLabel(initial ? inLabel : addLabel);

  btn.addEventListener("click", () => {
    const value = scale && typeof scale.getValue === "function" ? scale.getValue() : 1;
    const { added } = togglePlanEntry({ slug, value, slot });
    setAddedState(btn, added);
    setLabel(added ? inLabel : addLabel);
  });
}

function setupAddButtons(scope) {
  scope.querySelectorAll("[data-plan-add-slug]").forEach(btn => {
    const slug  = btn.dataset.planAddSlug;
    const value = parseFloat(btn.dataset.planAddValue);
    const slot  = btn.dataset.planAddSlot;
    if (!slug || !slot || !Number.isFinite(value)) return;

    setAddedState(btn, isInPlan(slug), { addedLabel: "✓", restLabel: "+" });

    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const { added } = togglePlanEntry({ slug, value, slot });
      setAddedState(btn, added, { addedLabel: "✓", restLabel: "+" });
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
