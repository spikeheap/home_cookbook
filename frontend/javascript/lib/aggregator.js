// Shopping-list aggregator.
//
// Walks each plan entry's ingredients, follows inlined sub-recipes (markdown
// link to `<slug>.html` with a `uses_fraction`), scales every quantity by the
// effective factor, then groups by `(normalised name, unit)`.
//
// Items without a numeric quantity ("salt and pepper to taste") go in a
// separate `manual` bucket so the cook can scan them. Different units of the
// same item stay on separate rows — no unit conversion (v0).

const SUB_LINK_RE = /\[[^\]]+\]\(([a-z0-9_-]+)\.html\)/i;

export function factorForEntry(entry, recipe) {
  if (!recipe) return 1;
  return recipe.servings && recipe.servings > 0
    ? entry.value / recipe.servings
    : entry.value;
}

export function extractSubSlug(text) {
  if (typeof text !== "string") return null;
  const m = text.match(SUB_LINK_RE);
  return m ? m[1] : null;
}

export function normaliseItemName(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // [label](url) → label
    .replace(/\(.*?\)/g, "")                   // strip parenthetical asides
    .replace(/[,;:].*$/, "")                   // drop trailing qualifiers
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function displayItemName(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\(.*?\)/g, "")
    .replace(/[,;:].*$/, "")
    .trim()
    .replace(/\s+/g, " ");
}

function expandItems(recipe, factor, sourceLabel, recipesIndex) {
  const out = [];
  for (const section of recipe.recipeIngredient || []) {
    for (const item of section.items || []) {
      if (item == null) continue;
      const isHash    = typeof item === "object";
      const itemText  = isHash ? (item.item || "") : String(item);
      const usesFrac  = isHash ? item.uses_fraction : null;
      const subSlug   = extractSubSlug(itemText);

      // Inlined sub-recipe with a known fraction → expand the sub, drop this
      // placeholder line (its ingredients will be aggregated separately).
      if (subSlug && usesFrac && recipesIndex.has(subSlug)) {
        const sub = recipesIndex.get(subSlug);
        out.push(...expandItems(sub, factor * usesFrac, `${sourceLabel} → ${sub.name}`, recipesIndex));
        continue;
      }

      const rawQty = isHash ? item.quantity : null;
      const unit   = isHash ? item.unit || null : null;
      out.push({
        text:        itemText,
        normalised:  normaliseItemName(itemText),
        displayName: displayItemName(itemText),
        quantity:    Number.isFinite(rawQty) ? rawQty * factor : null,
        unit,
        source:      sourceLabel,
      });
    }
  }
  return out;
}

export function aggregate(plan, recipes) {
  const recipesIndex = new Map((recipes || []).map(r => [r.slug, r]));
  const items = [];
  for (const entry of plan.entries) {
    const recipe = recipesIndex.get(entry.slug);
    if (!recipe) continue;
    items.push(...expandItems(recipe, factorForEntry(entry, recipe), recipe.name, recipesIndex));
  }

  const grouped = new Map();
  const manual  = [];

  for (const it of items) {
    if (it.quantity == null) {
      manual.push(it);
      continue;
    }
    const key = `${it.normalised}|${it.unit || ""}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        name:        it.normalised,
        displayName: it.displayName,
        unit:        it.unit,
        quantity:    0,
        sources:     new Set(),
      });
    }
    const agg = grouped.get(key);
    agg.quantity += it.quantity;
    agg.sources.add(it.source);
  }

  const groupedList = Array.from(grouped.values())
    .map(g => ({ ...g, sources: Array.from(g.sources) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const manualList = manual
    .slice()
    .sort((a, b) => a.normalised.localeCompare(b.normalised));

  return { grouped: groupedList, manual: manualList };
}
