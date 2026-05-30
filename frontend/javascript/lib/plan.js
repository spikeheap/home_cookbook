// Meal plan: a localStorage-backed list of `{ id, slug, value, slot }` entries,
// grouped into Breakfast / Lunch / Dinner / Other when rendered.
//
// `value` is the user-facing number — people count for recipes with `servings`,
// multiplier otherwise. The aggregator derives the scaling factor from it.

import { formatQuantity, formatQuantityWithUnit, nextOnLadder } from "./scale.js";

// aggregator.js carries the ~85 KB ingredient dictionary; only the /plan/ page
// ever calls into it. Lazy-loaded here so every other page (homepage, recipe
// pages, listings) doesn't pay for the dictionary in its main bundle.
let _aggregate;
async function getAggregate() {
  if (!_aggregate) {
    const mod = await import("./aggregator.js");
    _aggregate = mod.aggregate;
  }
  return _aggregate;
}

// lz-string (~6 KB minified) is only needed by the share encode/decode flow
// on /plan/. Lazy-loaded so it doesn't ship on every other page.
let _lzPromise;
function getLZString() {
  if (!_lzPromise) _lzPromise = import("lz-string").then(m => m.default || m);
  return _lzPromise;
}

const STORAGE_KEY = "cookbook.plan";
const VERSION     = 1;
const SHARE_VERSION = 1;

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

// ---- Plan mode -------------------------------------------------------------
//
// "Plan mode" gates the cross-site plan UI (+ buttons on cards, list rows,
// recipe pages). When off, the site looks like a plain cookbook; when on,
// the augmentation appears. The toggle lives on /plan/ only — the underlying
// plan data is unaffected by flipping the mode.

const PLAN_MODE_KEY = "cookbook.planMode";

export function getPlanMode(storage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  if (!storage) return false;
  try { return storage.getItem(PLAN_MODE_KEY) === "on"; } catch (_) { return false; }
}

export function setPlanMode(on, {
  root    = (typeof document !== "undefined" ? document.documentElement : null),
  storage = (typeof localStorage !== "undefined" ? localStorage : null),
} = {}) {
  const value = !!on;
  if (storage) {
    try { storage.setItem(PLAN_MODE_KEY, value ? "on" : "off"); } catch (_) {}
  }
  if (root && root.classList && typeof root.classList.toggle === "function") {
    root.classList.toggle("plan-mode", value);
  }
  return value;
}

// Apply the stored plan-mode flag to the document root. Called from index.js
// on every page so the .plan-mode class lands as early as the module runs.
export function applyPlanMode({
  root    = (typeof document !== "undefined" ? document.documentElement : null),
  storage = (typeof localStorage !== "undefined" ? localStorage : null),
} = {}) {
  const on = getPlanMode(storage);
  if (root && root.classList && typeof root.classList.toggle === "function") {
    root.classList.toggle("plan-mode", on);
  }
  return on;
}

export function setupPlanModeToggle({
  root,
  storage = (typeof localStorage !== "undefined" ? localStorage : null),
} = {}) {
  if (!root) return null;
  const checkbox = root.querySelector("[data-plan-mode-toggle]");
  if (!checkbox) return null;

  const html = (typeof document !== "undefined") ? document.documentElement : null;

  const current = getPlanMode(storage);
  checkbox.checked = current;
  if (html) html.classList.toggle("plan-mode", current);

  checkbox.addEventListener("change", () => {
    setPlanMode(checkbox.checked, { root: html, storage });
  });

  return { getMode: () => getPlanMode(storage) };
}

// ---- Share via URL ---------------------------------------------------------
//
// Encodes a plan into a URL-safe string using lz-string. Per-device `id`s are
// stripped (the importer regenerates them). The payload carries its own schema
// version so we can detect mismatches on decode.

export async function encodePlan(plan) {
  const payload = {
    v: SHARE_VERSION,
    entries: (plan && Array.isArray(plan.entries) ? plan.entries : []).map(e => ({
      slug:  e.slug,
      value: e.value,
      slot:  e.slot,
    })),
  };
  const LZString = await getLZString();
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

function isValidShareEntry(e) {
  return e
    && typeof e.slug === "string" && e.slug.length > 0
    && typeof e.value === "number" && Number.isFinite(e.value)
    && typeof e.slot === "string" && e.slot.length > 0;
}

// Returns `{ ok: true, entries: [...] }` on a well-formed payload, or
// `{ ok: false, reason }` otherwise. Never throws on malformed input — callers
// log a warning and treat it as a no-op (matches the recipes-JSON pattern).
export async function decodePlan(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0) {
    return { ok: false, reason: "empty" };
  }
  const LZString = await getLZString();
  let json;
  try { json = LZString.decompressFromEncodedURIComponent(encoded); }
  catch (_) { return { ok: false, reason: "decompress" }; }
  if (!json) return { ok: false, reason: "decompress" };

  // lz-string is an excellent zip-bomb vector: ~50 KB of fragment can
  // decompress to ~10 MB of repetitive JSON. Legitimate plans serialise to
  // well under 10 KB, so cap conservatively at 200 KB and bail early.
  if (json.length > 200_000) return { ok: false, reason: "too_big" };

  let parsed;
  try { parsed = JSON.parse(json); }
  catch (_) { return { ok: false, reason: "json" }; }

  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "shape" };
  if (parsed.v !== SHARE_VERSION) return { ok: false, reason: "version" };
  if (!Array.isArray(parsed.entries)) return { ok: false, reason: "shape" };

  const entries = parsed.entries.filter(isValidShareEntry).map(e => ({
    slug:  e.slug,
    value: e.value,
    slot:  e.slot,
  }));
  return { ok: true, entries };
}

// Build a fresh plan from imported entries (generates new ids).
export function replaceEntries(plan, importedEntries) {
  const entries = importedEntries.map(e => ({
    id:    newId(),
    slug:  e.slug,
    value: e.value,
    slot:  e.slot,
  }));
  return { ...plan, entries };
}

// Append entries whose slug isn't already in the plan (generates new ids).
export function mergeEntries(plan, importedEntries) {
  const existingSlugs = new Set(plan.entries.map(e => e.slug));
  const additions = importedEntries
    .filter(e => !existingSlugs.has(e.slug))
    .map(e => ({ id: newId(), slug: e.slug, value: e.value, slot: e.slot }));
  return { ...plan, entries: [...plan.entries, ...additions] };
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

export function isInPlan(slug, storage = (typeof localStorage !== "undefined" ? localStorage : null)) {
  if (!slug) return false;
  return loadPlan(storage).entries.some(e => e.slug === slug);
}

// Toggle a recipe in/out of the plan. If the slug is already present, the
// existing entry is removed; otherwise a new entry is added. Returns the new
// plan and whether the recipe ended up added or removed, so callers can update
// button state without re-reading storage.
export function togglePlanEntry({ slug, value, slot, storage = (typeof localStorage !== "undefined" ? localStorage : null) }) {
  if (!slug || !slot) return { plan: loadPlan(storage), added: false };
  const plan = loadPlan(storage);
  const existing = plan.entries.find(e => e.slug === slug);
  if (existing) {
    const next = removeEntry(plan, existing.id);
    savePlan(next, storage);
    return { plan: next, added: false };
  }
  const next = addEntry(plan, { slug, value, slot });
  savePlan(next, storage);
  return { plan: next, added: true };
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

// Defence in depth for `href=` interpolation. `esc()` only HTML-escapes;
// it doesn't reject dangerous schemes like `javascript:` or `data:`. We
// allow only site-relative paths and absolute http(s) URLs; anything
// else (or non-string input) becomes `#`, which navigates nowhere.
export function safeHref(u) {
  if (typeof u !== "string") return "#";
  return /^(\/|https?:\/\/)/i.test(u) ? u : "#";
}

export function renderEntry(entry, recipe) {
  if (!recipe) {
    // Stale entry — recipe was renamed/removed since this was added. Render a
    // degraded row so the user can at least remove it.
    return `
      <li class="plan-entry plan-entry--missing" data-plan-entry-id="${esc(entry.id)}">
        <span class="plan-entry__name plan-entry__name--missing">Unknown recipe: ${esc(entry.slug)}</span>
        <button type="button" class="plan-entry__remove" data-plan-remove="${esc(entry.id)}" aria-label="Remove from plan">×</button>
      </li>
    `;
  }
  const mode  = modeForRecipe(recipe);
  const label = mode === "servings" ? "Serves" : "Make";
  const valueText = mode === "servings" ? String(entry.value) : `×${formatQuantity(entry.value)}`;
  return `
    <li class="plan-entry" data-plan-entry-id="${esc(entry.id)}">
      <a class="plan-entry__name" href="${esc(safeHref(recipe.url))}">${esc(recipe.name)}</a>
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
    .join("");
  return `
    <section class="plan-group" data-plan-slot="${esc(slot)}">
      <h2 class="plan-group__title">${esc(slot)} <span class="plan-group__count">${entries.length}</span></h2>
      <ul class="plan-group__list">${items}</ul>
    </section>
  `;
}

function shopItemKey(item)   { return `r:${item.displayName}|${item.unit || ""}`; }
function manualItemKey(item) { return `m:${item.displayName}|${item.source || ""}`; }

function renderShopItem(item, ticked) {
  const qty     = formatQuantityWithUnit(item.quantity, item.unit);
  const sources = item.sources.length > 2
    ? `${item.sources.length} recipes`
    : item.sources.join(", ");
  const key = shopItemKey(item);
  const cls = ticked.has(key) ? "plan-shop__item ticked" : "plan-shop__item";
  return `
    <li class="${cls}" data-shop-key="${esc(key)}">
      <span class="plan-shop__qty">${esc(qty)}</span>
      <span class="plan-shop__name">${esc(item.displayName)}</span>
      <span class="plan-shop__sources">${esc(sources)}</span>
    </li>
  `;
}

function renderShopCategory(category, ticked) {
  const items = category.items.map(item => renderShopItem(item, ticked)).join("");
  return `
    <section class="plan-shop__category">
      <h3 class="plan-shop__category-title">${esc(category.name)} <span class="plan-shop__category-count">${category.items.length}</span></h3>
      <ul class="plan-shop__category-list">${items}</ul>
    </section>
  `;
}

function renderManualItem(item, ticked) {
  const key = manualItemKey(item);
  const cls = ticked.has(key)
    ? "plan-shop__item plan-shop__item--manual ticked"
    : "plan-shop__item plan-shop__item--manual";
  return `
    <li class="${cls}" data-shop-key="${esc(key)}">
      <span class="plan-shop__name">${esc(item.displayName)}</span>
      <span class="plan-shop__sources">${esc(item.source)}</span>
    </li>
  `;
}

// Two-step `window.confirm` prompt covering replace / merge / cancel:
//
//   - empty plan        → one confirm: OK imports, Cancel discards.
//   - non-empty plan    → first OK accepts the link, then a second confirm
//                         chooses replace (OK) or merge (Cancel).
//
// Returns "replace" | "merge" | "cancel".
function resolveImportChoice(count, hasExisting) {
  if (typeof confirm !== "function") return hasExisting ? "merge" : "replace";

  const noun = `${count} entr${count === 1 ? "y" : "ies"}`;
  if (!hasExisting) {
    return confirm(`Import ${noun} from this link?`) ? "replace" : "cancel";
  }
  if (!confirm(`Import ${noun} from this link?\nOK to add to your plan, Cancel to ignore.`)) {
    return "cancel";
  }
  return confirm("Replace your existing plan?\nOK to replace, Cancel to merge (skipping duplicates).")
    ? "replace"
    : "merge";
}

function shoppingListText(agg) {
  const allItems = agg.byCategory.flatMap(g => g.items);
  const lines = allItems.map(g => `${formatQuantityWithUnit(g.quantity, g.unit)} ${g.displayName}`.trim());
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
  const shareBtn     = root.querySelector('[data-plan-action="share"]');
  const shopEl       = root.querySelector("[data-plan-shop]");
  const shopCountEl  = root.querySelector("[data-plan-shop-count]");
  const shopItemsEl  = root.querySelector("[data-plan-shop-items]");
  const shopManualEl       = root.querySelector("[data-plan-shop-manual]");
  const shopManualItemsEl  = root.querySelector("[data-plan-shop-manual-items]");
  const shopResetBtn = root.querySelector("[data-plan-shop-reset]");
  if (!listEl) return null;

  const recipesIndex = new Map((recipes || []).map(r => [r.slug, r]));
  let plan = loadPlan(storage);

  // Shop ticks — set of stable item keys, persisted in its own storage key.
  // Pruned after each shop render so keys whose items have left the
  // aggregated list don't linger forever.
  const SHOP_TICKS_KEY = "cookbook.plan-ticks";
  const shopTicks = new Set();
  try {
    const raw = storage && storage.getItem(SHOP_TICKS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach(k => typeof k === "string" && shopTicks.add(k));
    }
  } catch {}
  const persistShopTicks = () => {
    if (!storage) return;
    try {
      if (shopTicks.size === 0) storage.removeItem(SHOP_TICKS_KEY);
      else storage.setItem(SHOP_TICKS_KEY, JSON.stringify([...shopTicks]));
    } catch {}
  };
  const syncShopResetVisibility = () => {
    const hasTicks = shopTicks.size > 0;
    if (shopResetBtn) {
      if (hasTicks) shopResetBtn.removeAttribute("hidden");
      else shopResetBtn.setAttribute("hidden", "");
    }
    if (shopCountEl) {
      if (hasTicks) shopCountEl.setAttribute("hidden", "");
      else shopCountEl.removeAttribute("hidden");
    }
  };

  async function renderShop() {
    if (!shopEl) return;
    if (plan.entries.length === 0) { shopEl.hidden = true; return; }

    const aggregate = await getAggregate();
    const agg = aggregate(plan, recipes || []);
    const total = agg.byCategory.reduce((sum, c) => sum + c.items.length, 0) + agg.manual.length;
    if (total === 0) { shopEl.hidden = true; return; }

    shopEl.hidden = false;
    if (shopCountEl) shopCountEl.textContent = `${total} item${total === 1 ? "" : "s"}`;
    if (shopItemsEl) shopItemsEl.innerHTML = agg.byCategory.map(c => renderShopCategory(c, shopTicks)).join("");

    if (shopManualEl) {
      if (agg.manual.length === 0) {
        shopManualEl.hidden = true;
        if (shopManualItemsEl) shopManualItemsEl.innerHTML = "";
      } else {
        shopManualEl.hidden = false;
        if (shopManualItemsEl) shopManualItemsEl.innerHTML = agg.manual.map(item => renderManualItem(item, shopTicks)).join("");
      }
    }

    // Prune stored ticks whose items have left the current aggregate.
    const liveKeys = new Set();
    for (const cat of agg.byCategory) for (const it of cat.items) liveKeys.add(shopItemKey(it));
    for (const it of agg.manual) liveKeys.add(manualItemKey(it));
    let pruned = false;
    for (const k of [...shopTicks]) {
      if (!liveKeys.has(k)) { shopTicks.delete(k); pruned = true; }
    }
    if (pruned) persistShopTicks();
    syncShopResetVisibility();
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

  // Tick a shopping item to mark it bought; tap again to untick. Click is
  // delegated on the shop container so it covers both categorised and
  // manual lists without per-item handlers. Toggle just the class — no
  // re-render needed.
  if (shopEl) {
    shopEl.addEventListener("click", e => {
      if (e.target.closest("[data-plan-shop-reset]")) return;
      const li = e.target.closest("[data-shop-key]");
      if (!li || !shopEl.contains(li)) return;
      const key = li.dataset.shopKey;
      if (!key) return;
      if (shopTicks.has(key)) {
        shopTicks.delete(key);
        li.classList.remove("ticked");
      } else {
        shopTicks.add(key);
        li.classList.add("ticked");
      }
      persistShopTicks();
      syncShopResetVisibility();
    });
  }

  if (shopResetBtn) {
    shopResetBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      shopTicks.clear();
      if (shopItemsEl) shopItemsEl.querySelectorAll(".ticked").forEach(el => el.classList.remove("ticked"));
      if (shopManualItemsEl) shopManualItemsEl.querySelectorAll(".ticked").forEach(el => el.classList.remove("ticked"));
      persistShopTicks();
      syncShopResetVisibility();
    });
  }

  if (copyBtn) {
    const originalLabel = copyBtn.textContent;
    copyBtn.addEventListener("click", async () => {
      const aggregate = await getAggregate();
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

  if (shareBtn) {
    const originalLabel = shareBtn.textContent;
    shareBtn.addEventListener("click", async () => {
      if (plan.entries.length === 0) return;
      const encoded = await encodePlan(plan);
      const url = `${location.origin}${location.pathname}#data=${encoded}`;
      try {
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = "Copied";
        setTimeout(() => { shareBtn.textContent = originalLabel; }, 1500);
      } catch (_) {
        shareBtn.textContent = "Copy failed";
        setTimeout(() => { shareBtn.textContent = originalLabel; }, 1500);
      }
    });
  }

  // Hash-based import. Runs once on setup; clears the hash regardless of choice
  // so a reload doesn't re-trigger the prompt. Wrapped in an async IIFE because
  // decodePlan lazy-loads lz-string.
  if (typeof window !== "undefined" && window.location && window.location.hash) {
    const m = window.location.hash.match(/^#data=(.+)$/);
    if (m) {
      (async () => {
        const raw = m[1];
        // A malformed escape (e.g. a stray `%` from a truncated paste or
        // a crafted hash) means the fragment isn't a valid share link.
        // Skip the import attempt entirely rather than feed the raw,
        // un-decoded byte sequence into `decodePlan` — defence in depth.
        let decoded;
        try { decoded = decodeURIComponent(raw); }
        catch (_) { decoded = null; }
        if (decoded === null) {
          console.warn("plan: ignored malformed shared plan (uri)");
        } else {
          const result = await decodePlan(decoded);
          if (!result.ok) {
            console.warn(`plan: ignored malformed shared plan (${result.reason})`);
          } else if (result.entries.length === 0) {
            console.warn("plan: shared link contained no valid entries");
          } else {
            const choice = resolveImportChoice(result.entries.length, plan.entries.length > 0);
            if (choice === "replace") {
              commit(replaceEntries(plan, result.entries));
            } else if (choice === "merge") {
              commit(mergeEntries(plan, result.entries));
            }
          }
        }
        // Always clear the hash so reload doesn't re-prompt.
        if (typeof history !== "undefined" && typeof history.replaceState === "function") {
          history.replaceState(null, "", `${location.pathname}${location.search}`);
        }
      })();
    }
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
