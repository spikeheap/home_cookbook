import "$styles/index.css";

import { setupTheme } from "./lib/theme.js";
import { setupSearch } from "./lib/search.js";
import { setupScale } from "./lib/scale.js";
import { setupWakeLock } from "./lib/wake-lock.js";
import { setupPrintExpansion } from "./lib/print.js";
import { setupPlan } from "./lib/plan.js";

function init() {
  setupTheme({ btn: document.getElementById("theme-toggle") });

  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  if (searchInput && searchResults) {
    setupSearch({ input: searchInput, resultsEl: searchResults });
  }

  const recipeRoot = document.querySelector(".recipe");
  if (recipeRoot) {
    setupScale({ root: recipeRoot });
    setupWakeLock(recipeRoot.querySelector('[data-tool="wakelock"]'));
    setupPrintExpansion(recipeRoot);
  }

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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
