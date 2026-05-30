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
  const toggle = recipeRoot.querySelector("[data-ingredients-toggle]");
  const panel = recipeRoot.querySelector("#ingredients-panel");
  if (!toggle || !panel) return;

  const html = document.documentElement;

  let outsideHandler = null;
  let keyHandler = null;

  const isOpen = () => html.classList.contains(OPEN_CLASS);

  const close = () => {
    if (!isOpen()) return;
    html.classList.remove(OPEN_CLASS);
    toggle.setAttribute("aria-expanded", "false");
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
    toggle.setAttribute("aria-expanded", "true");

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

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    isOpen() ? close() : open();
  });
}
