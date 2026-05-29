import "$styles/index.css";

import { setupTheme } from "./lib/theme.js";
import { setupSearch } from "./lib/search.js";
import { setupScale } from "./lib/scale.js";
import { setupWakeLock } from "./lib/wake-lock.js";
import { setupPrintExpansion } from "./lib/print.js";
import { setupPlan, addRecipeToPlan } from "./lib/plan.js";

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

  setupCardAddButtons(document);

  const planRoot = document.querySelector(".plan");
  if (planRoot) {
    const dataEl = document.getElementById("plan-recipes-data");
    let recipes = [];
    if (dataEl) {
      try { recipes = JSON.parse(dataEl.textContent); }
      catch (_) { recipes = []; }
    }
    setupPlan({ root: planRoot, recipes });
  }
}

function flashAdded(btn, doneLabel, restoreLabel, ms = 1500) {
  btn.textContent = doneLabel;
  btn.dataset.state = "added";
  setTimeout(() => {
    btn.textContent = restoreLabel;
    delete btn.dataset.state;
  }, ms);
}

function setupRecipeAddToPlan(recipeRoot, scale) {
  const btn = recipeRoot.querySelector('[data-tool="add-to-plan"]');
  if (!btn) return;
  const slug = recipeRoot.dataset.recipeSlug;
  const slot = recipeRoot.dataset.recipeSlot || "Other";
  if (!slug) return;

  const labelEl = btn.querySelector(".tool__label");
  const original = labelEl ? labelEl.textContent : "Add to plan";

  btn.addEventListener("click", () => {
    const value = scale && typeof scale.getValue === "function" ? scale.getValue() : 1;
    addRecipeToPlan({ slug, value, slot });
    if (labelEl) flashAdded(labelEl, "Added", original);
  });
}

function setupCardAddButtons(scope) {
  scope.querySelectorAll(".card__add").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const slug  = btn.dataset.planAddSlug;
      const value = parseFloat(btn.dataset.planAddValue);
      const slot  = btn.dataset.planAddSlot;
      if (!slug || !slot || !Number.isFinite(value)) return;
      addRecipeToPlan({ slug, value, slot });
      flashAdded(btn, "✓", "+");
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
