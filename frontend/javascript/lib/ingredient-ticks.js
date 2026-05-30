// Tick ingredients off as you cook. Click an <li class="ingredient"> to
// toggle a strikethrough; the state is persisted per-recipe in
// localStorage so a reload (or accidental navigation) doesn't lose your
// progress. A "Reset" button takes the count's slot in the heading row
// whenever ≥1 item is ticked, and reverts to the count when none are.
//
// Keys: zero-based index of each <li class="ingredient"> within the
// .recipe-ingredients root in document order. Sub-recipe items count
// too — they're nested inside the outer <li>'s details body, so each
// gets its own index without colliding with the parent row. The
// strikethrough cascade onto sub-recipe items when a parent row is
// ticked is handled purely in CSS (descendant selector on .ticked),
// which means un-ticking a parent restores the un-ticked children
// while leaving any individually-ticked children struck through.

const STORAGE_PREFIX = "cookbook.ticks.";
const TICKED_CLASS = "ticked";

export function setupIngredientTicks(recipeRoot) {
  const panel = recipeRoot.querySelector(".recipe-ingredients");
  if (!panel) return;
  const slug = recipeRoot.dataset.recipeSlug;
  if (!slug) return;

  const items = Array.from(panel.querySelectorAll("li.ingredient"));
  if (items.length === 0) return;
  items.forEach((li, i) => { li.dataset.tickIndex = String(i); });

  const resetBtn = panel.querySelector("[data-ingredients-reset]");
  const countEl = panel.querySelector("[data-ingredients-count]");
  const storageKey = STORAGE_PREFIX + slug;

  const read = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter(Number.isInteger) : []);
    } catch {
      return new Set();
    }
  };

  const write = (set) => {
    try {
      if (set.size === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify([...set]));
    } catch {}
  };

  const ticked = read();

  const syncResetVisibility = () => {
    const hasTicks = ticked.size > 0;
    if (resetBtn) {
      if (hasTicks) resetBtn.removeAttribute("hidden");
      else resetBtn.setAttribute("hidden", "");
    }
    if (countEl) {
      if (hasTicks) countEl.setAttribute("hidden", "");
      else countEl.removeAttribute("hidden");
    }
  };

  // Hydrate ticked state from storage. Drop stored indices that no longer
  // map to an item (recipe edits since last tick).
  for (const idx of [...ticked]) {
    if (idx < 0 || idx >= items.length) {
      ticked.delete(idx);
      continue;
    }
    items[idx].classList.add(TICKED_CLASS);
  }
  if (ticked.size !== read().size) write(ticked);
  syncResetVisibility();

  panel.addEventListener("click", (e) => {
    if (e.target.closest("summary")) return;       // sub-recipe disclosure
    if (e.target.closest("a")) return;             // links inside ingredient text
    if (e.target.closest("[data-ingredients-reset]")) return;
    if (e.target.closest("[data-ingredients-toggle]")) return;
    const li = e.target.closest("li.ingredient");
    if (!li || !panel.contains(li)) return;
    const idx = Number(li.dataset.tickIndex);
    if (!Number.isInteger(idx)) return;
    if (ticked.has(idx)) {
      ticked.delete(idx);
      li.classList.remove(TICKED_CLASS);
    } else {
      ticked.add(idx);
      li.classList.add(TICKED_CLASS);
    }
    write(ticked);
    syncResetVisibility();
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      ticked.clear();
      items.forEach((li) => li.classList.remove(TICKED_CLASS));
      write(ticked);
      syncResetVisibility();
    });
  }
}
