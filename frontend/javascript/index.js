import "$styles/index.css";

import { setupTheme } from "./lib/theme.js";
import { setupSearch } from "./lib/search.js";
import { setupScale } from "./lib/scale.js";
import { setupWakeLock } from "./lib/wake-lock.js";

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
    if (scale) {
      // Normalise rendered quantities (e.g. 0.5 → ½) without blocking paint.
      const normalise = () => scale.apply(1);
      const schedule = typeof requestIdleCallback === "function"
        ? () => requestIdleCallback(normalise)
        : () => setTimeout(normalise, 0);
      if (document.readyState === "complete") schedule();
      else window.addEventListener("load", schedule, { once: true });
    }

    setupWakeLock(recipeRoot.querySelector('[data-tool="wakelock"]'));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
