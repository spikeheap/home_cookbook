// Mobile peek-sheet behaviour for the ingredients panel on a recipe page.
//
// The whole .recipe-ingredients section is pinned to the bottom of the
// viewport on mobile; the heading peeks above the fold at all times.
// Tapping the heading's <button> toggles the sheet between collapsed
// (heading only) and expanded (full list). Close paths: tap heading
// again, tap outside the panel, Esc.
//
// On desktop (>=56rem) the toggle button is styled flat and the chevron
// is hidden, so taps do nothing visible — this module is effectively a
// no-op there.

const OPEN_CLASS = "ingredients-open";

export function setupIngredientsSheet(recipeRoot) {
  const toggles = Array.from(recipeRoot.querySelectorAll("[data-ingredients-toggle]"));
  const panel = recipeRoot.querySelector("#ingredients-panel");
  if (toggles.length === 0 || !panel) return;

  const html = document.documentElement;
  const setExpanded = (v) => toggles.forEach(t => t.setAttribute("aria-expanded", String(v)));

  let outsideHandler = null;
  let keyHandler = null;

  const isOpen = () => html.classList.contains(OPEN_CLASS);

  const close = () => {
    if (!isOpen()) return;
    html.classList.remove(OPEN_CLASS);
    setExpanded(false);
    if (outsideHandler) {
      document.removeEventListener("click", outsideHandler, true);
      outsideHandler = null;
    }
    if (keyHandler) {
      document.removeEventListener("keydown", keyHandler);
      keyHandler = null;
    }
  };

  const open = () => {
    if (isOpen()) return;
    html.classList.add(OPEN_CLASS);
    setExpanded(true);

    // Defer attaching the outside-click listener so the click that opened
    // the sheet doesn't immediately close it.
    requestAnimationFrame(() => {
      outsideHandler = (e) => {
        if (panel.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        close();
      };
      document.addEventListener("click", outsideHandler, true);
    });

    keyHandler = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", keyHandler);
  };

  toggles.forEach(toggle => {
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      isOpen() ? close() : open();
    });
  });

  // Make the entire peek-sheet header a touch target, not just the text
  // and chevron buttons — tapping the empty middle of the row toggles too.
  // The inner toggle buttons stopPropagation, so they don't double-fire;
  // the reset button is excluded so it can clear ticks without toggling.
  const heading = recipeRoot.querySelector(".recipe-ingredients__heading");
  if (heading) {
    heading.addEventListener("click", (e) => {
      if (e.target.closest("[data-ingredients-reset]")) return;
      isOpen() ? close() : open();
    });
  }
}
