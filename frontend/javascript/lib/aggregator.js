// Shopping-list aggregator.
//
// Walks each plan entry's ingredients, follows inlined sub-recipes (markdown
// link to `<slug>.html` with a `uses_fraction`), scales every quantity by the
// effective factor, then groups by `(normalised name, unit)`.
//
// Items without a numeric quantity ("salt and pepper to taste") go in a
// separate `manual` bucket so the cook can scan them. Different units of the
// same item stay on separate rows — no unit conversion (v0).

import dictionaryData from "./categoriser-dictionary.json" with { type: "json" };

const SUB_LINK_RE = /\[[^\]]+\]\(([a-z0-9_-]+)\.html\)/i;

// Tier 2 categoriser: offline dictionary derived from the Open Food Facts
// ingredients taxonomy. Built by scripts/build-categoriser-dictionary.mjs.
// Keys are normalised by normaliseItemName() so runtime lookups collide.
const DICTIONARY = new Map(Object.entries(dictionaryData.entries || {}));

// Items whose normalised name matches these patterns are dropped from the
// shopping list entirely (you don't shop for water). Conservative so that
// "water chestnut" or "rose water" wouldn't be silently lost.
const IGNORE_NAME_PATTERNS = [
  /^water$/,
  /^(cold|warm|hot|boiling|tepid|ice|chilled|room temperature)\s+water$/,
  /^water\s+or\s+/,
  /^about\s+\d+\w*\s+water$/,
];

function shouldIgnore(normalisedName) {
  if (!normalisedName) return false;
  return IGNORE_NAME_PATTERNS.some(re => re.test(normalisedName));
}

// Category names in the order they're typically encountered when walking a
// shop. Empty buckets are omitted from the rendered list.
export const CATEGORY_ORDER = [
  "Produce",
  "Bakery",
  "Meat & fish",
  "Dairy & eggs",
  "Cupboard",
  "Frozen",
  "Drinks",
  "Other",
];

// First-match-wins keyword rules. Order matters — Cupboard is checked before
// Bakery, Meat, Dairy and Produce so pantry forms win for ambiguous items
// like "bread flour", "chicken stock", "tin of coconut milk".
//
// Patterns with trailing spaces (e.g. "butter ", "mince ", "pea ") are
// intentional — they avoid false positives like "butternut", "minced garlic",
// "pearl couscous" matching "butter", "mince", "pea".
const CATEGORY_RULES = [
  { category: "Frozen",       patterns: ["frozen", "ice cream", "ice-cream"] },

  { category: "Drinks",       patterns: [
    "beer", "tonic water", "soda water", "lemonade",
  ]},

  // Pantry / cupboard — checked before Meat & fish / Dairy / Produce so that
  // sauces, stocks, tinned, dried, oils, and grains beat their fresh-form
  // homonyms (chicken stock, fish sauce, tin coconut milk, bread flour, etc.).
  { category: "Cupboard",     patterns: [
    "tinned", "tin of", "tin ", "tins ", "tins of", "(tin)", "(can)", "canned",
    "flour", "sugar", "salt", "oil", "vinegar", "stock", "bouillon",
    "pasta", "spaghetti", "linguine", "tagliatelli", "tagliatelle", "fettuccine", "fusilli", "penne",
    "rigatoni", "macaroni", "orzo", "lasagne", "ravioli", "gnocchi", "couscous", "cous cous",
    "rice", "noodle", "yeast", "baking powder", "baking soda", "bicarb",
    "cornstarch", "corn starch", "cornflour", "corn flour",
    "cocoa", "vanilla", "honey", "syrup", "treacle", "malt extract", "essence",
    "soy sauce", "fish sauce", "mustard", "ketchup", "mayonnaise", "tamari", "miso", "tahini",
    "worcestershire", "mirin", "sake", "wine", "oyster sauce", "hoisin",
    "doubanjiang", "gochujang", "gochugaru", "chipotle", "harissa", "sriracha",
    "sauce", "salsa",
    "passata", "puree", "purée", "paste", "coconut milk",
    "coffee", "chocolate", "biscuit", "cracker", "ladyfinger", "savoiardi",
    "breadcrumb", "panko",
    "taco shell", "tortilla chip",
    "lentil", "chickpea", "pulse", "dal ", " dal", "toor",
    "kidney bean", "black bean", "cannellini", "borlotti", "haricot", "butter bean", "dried bean",
    "spice", "cinnamon", "cumin", "paprika", "turmeric", "garam masala", "curry powder",
    "cardamom", "nutmeg", "star anise", "bay leaf", "bay leaves", "fennel seed",
    "whole cloves", "ground cloves",
    // Specific "ground X" spices — broad "ground " catches meat (ground pork).
    "ground cumin", "ground turmeric", "ground cinnamon", "ground ginger",
    "ground coriander", "ground cardamom", "ground nutmeg", "ground pepper",
    "ground almonds", "ground rice", "ground chilli",
    "coriander seed", "seeds", " seed ",
    "dried", "powder", "peppercorn", "stock cube",
    // Specific nuts only — bare "nut" catches butternut.
    "almond", "cashew", "pistachio", "pine ", " pine", "walnut", "hazelnut", "pecan", "macadamia", "peanut",
    "raisin", "sultana", "currant",
    "black pepper", "white pepper",
    "caper", "olive ", "gherkin", "pickle",
    "minced garlic", "minced ginger",
    "horseradish",
  ]},

  { category: "Bakery",       patterns: [
    "loaf", "bun ", "buns", "tortilla", "pitta", "wrap", "baguette",
    "ciabatta", "sourdough", "brioche", "focaccia", "naan", "roll",
    "bread",  // safe here — Cupboard ran first and would have caught flour / breadcrumb / panko.
  ]},

  { category: "Meat & fish",  patterns: [
    "chicken", "beef", "pork", "lamb", "turkey", "duck", "venison", "mince ",
    "rib eye", "ribeye", "sirloin", "rump", "fillet steak", "brisket", "skirt steak",
    "salmon", "trout", "tuna", "cod", "haddock", "prawn", "shrimp", "anchov", "mackerel",
    "bacon", "guanciale", "pancetta", " ham", "parma", "prosciutto", "salami", "chorizo", "sausage",
    "fish ",
  ]},

  { category: "Dairy & eggs", patterns: [
    "egg", "milk", "cream", "yoghurt", "yogurt", "butter ", "buttermilk",
    "cheese", "cheddar", "parmesan", "parmigiano", "mozzarella", "mascarpone", "ricotta",
    "feta", "camembert", "pecorino", "halloumi", "gruy", "paneer", "crème fraîche", "creme fraiche",
  ]},

  { category: "Produce",      patterns: [
    "onion", "shallot", "garlic", "leek", "spring onion", "scallion",
    "tomato", "lettuce", "rocket", "spinach", "kale", "cabbage", "salad",
    "pepper ", "peppers", "potato", "jersey royal", "carrot", "courgette",
    "aubergine", "broccoli", "cauliflower", "squash", "pumpkin", "marrow", "swede", "turnip", "parsnip",
    "mushroom", "celery", "fennel", "asparagus", "pea ", "peas",
    "green bean", "runner bean", "broad bean",
    "pak choi", "bok choy", "choi sum", "kohlrabi", "endive", "chicory",
    "lemon", "lime", "orange", "apple", "pear", "raspberry", "blueberry", "strawberry",
    "passionfruit", "cucumber", "beetroot",
    "ginger", "chilli", "chili",
    "basil", "parsley", "coriander", "mint", "thyme", "rosemary", "sage", "oregano", "dill",
    "herbs", "herb ",
    "tofu",
  ]},
];

const PACK_UNITS = new Set(["tin", "can", "jar", "pack", "packet", "sachet", "tub"]);

export function categorise(name, unit) {
  const lower  = (name || "").toLowerCase();
  // Pad with spaces so word-edge matches (" pea ") behave.
  const padded = ` ${lower} `;
  const u      = (unit || "").toLowerCase();

  // Tier 1: pack format (tinned, jarred, sachet) is a strong signal for
  // Cupboard and overrides any other lookup. A few categories still win:
  // frozen peas in a packet are Frozen, canned beer is Drinks.
  if (PACK_UNITS.has(u)) {
    for (const cat of ["Frozen", "Drinks"]) {
      const rule = CATEGORY_RULES.find(r => r.category === cat);
      if (rule && rule.patterns.some(p => padded.includes(p))) return cat;
    }
    return "Cupboard";
  }

  // Tier 2: direct lookup in the offline OFF dictionary. `name` is already
  // normalised by aggregate() before categorise() is called, but defend
  // against direct callers (tests, ad-hoc surveys) by normalising again.
  const dictKey = normaliseItemName(name);
  const dictHit = DICTIONARY.get(dictKey);
  if (dictHit) return dictHit;

  // Tier 3: keyword-rule fallback. Handles qualifier-laden text the
  // dictionary won't catch (e.g. "ground cumin", "extra virgin olive oil").
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some(p => padded.includes(p))) return rule.category;
  }
  return "Other";
}

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

      const rawQty     = isHash ? item.quantity : null;
      const unit       = isHash ? item.unit || null : null;
      const normalised = normaliseItemName(itemText);
      if (shouldIgnore(normalised)) continue;
      out.push({
        text:        itemText,
        normalised,
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
    .map(g => ({ ...g, sources: Array.from(g.sources), category: categorise(g.name, g.unit) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const buckets = new Map(CATEGORY_ORDER.map(c => [c, []]));
  for (const item of groupedList) buckets.get(item.category).push(item);
  const byCategory = CATEGORY_ORDER
    .map(name => ({ name, items: buckets.get(name) }))
    .filter(g => g.items.length > 0);

  const manualList = manual
    .slice()
    .sort((a, b) => a.normalised.localeCompare(b.normalised));

  return { byCategory, manual: manualList };
}
