// Build the Tier 2 categoriser dictionary from the Open Food Facts (OFF)
// ingredients taxonomy.
//
// Usage:
//   # 1. download the raw OFF ingredients taxonomy (≈3 MB).
//   mkdir -p tmp/categoriser
//   curl -sL -o tmp/categoriser/ingredients.json \
//     https://static.openfoodfacts.org/data/taxonomies/ingredients.json
//
//   # 2. regenerate frontend/javascript/lib/categoriser-dictionary.json.
//   npm run build-categoriser-dictionary
//   #   (or: node scripts/build-categoriser-dictionary.mjs)
//
// Inputs:  tmp/categoriser/ingredients.json (raw, not committed)
// Output:  frontend/javascript/lib/categoriser-dictionary.json
//
// Strategy: walk the taxonomy's parent/child graph from a curated set of
// "root" ingredient nodes (en:vegetable, en:meat, en:oil-and-fat, …). For
// every descendant, take its English name plus the slug form of its taxonomy
// key as candidate dictionary keys. When the same ingredient inherits from
// roots in more than one category (e.g. "olive oil" is both fruit-derived and
// an oil), the highest-priority category wins. The priority order mirrors the
// existing keyword-rule order in aggregator.js: Cupboard beats Bakery beats
// Meat & fish beats Dairy & eggs beats Produce.
//
// We also strip noise that's never useful in a home shopping list (E-numbers,
// branded products, additives, supplements, baby food, pet food, ingredients
// whose name is just an enzyme / acidulant) and a few items whose OFF
// classification would mislead the cook (e.g. fresh herbs are Produce, never
// Cupboard, even though OFF has them descend from condiment in some chains).
//
// Attribution: the OFF ingredients taxonomy is published under the Open
// Database License (ODbL) v1.0. See https://opendatacommons.org/licenses/odbl/
// and https://wiki.openfoodfacts.org/Data_License . The generated dictionary
// file carries an attribution comment at the top.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normaliseItemName } from "../frontend/javascript/lib/aggregator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const INPUT     = path.join(ROOT, "tmp/categoriser/ingredients.json");
const OUTPUT    = path.join(ROOT, "frontend/javascript/lib/categoriser-dictionary.json");

// Priority order: lower index = higher priority. Mirrors the keyword-rule
// order in aggregator.js so the dictionary's choices align with the fallback.
const CATEGORY_PRIORITY = [
  "Frozen",
  "Drinks",
  "Cupboard",
  "Bakery",
  "Meat & fish",
  "Dairy & eggs",
  "Produce",
];

// Roots map: OFF taxonomy key -> category. Each root contributes itself + all
// descendants. Roots checked in declaration order; conflicts settled by
// CATEGORY_PRIORITY above.
const ROOTS = [
  // Cupboard — long tail of pantry staples.
  ["en:salt",          "Cupboard"],
  ["en:oil-and-fat",   "Cupboard"],
  ["en:vinegar",       "Cupboard"],
  ["en:sauce",         "Cupboard"],
  ["en:condiment",     "Cupboard"],
  ["en:spice",         "Cupboard"],
  ["en:sugar",         "Cupboard"],
  ["en:sweetener",     "Cupboard"],
  ["en:syrup",         "Cupboard"],
  ["en:honey",         "Cupboard"],
  ["en:flour",         "Cupboard"],
  ["en:cereal",        "Cupboard"],
  ["en:rice",          "Cupboard"],
  ["en:pasta",         "Cupboard"],
  ["en:noodle",        "Cupboard"],
  ["en:legume",        "Cupboard"],
  ["en:nut",           "Cupboard"],
  ["en:seed",          "Cupboard"],
  ["en:chocolate",     "Cupboard"],
  ["en:cocoa",         "Cupboard"],

  // Bakery.
  ["en:bread",         "Bakery"],

  // Meat & fish.
  ["en:meat",          "Meat & fish"],
  ["en:poultry",       "Meat & fish"],
  ["en:fish",          "Meat & fish"],
  ["en:offal",         "Meat & fish"],

  // Dairy & eggs.
  ["en:dairy",         "Dairy & eggs"],
  ["en:egg",           "Dairy & eggs"],

  // Produce.
  ["en:vegetable",     "Produce"],
  ["en:fruit",         "Produce"],
  ["en:herb",          "Produce"],
  ["en:mushroom",      "Produce"],

  // No Drinks root: in recipes, "wine" and "beer" are cooking ingredients
  // (Cupboard), and genuine drinks (lemonade, tonic) are rare enough that
  // the keyword fallback in aggregator.js handles them.
];

// Ingredients we never want in the shopping list at all. Match by key prefix
// or by predicate against the OFF entry. E-numbers in particular bloat the
// dictionary with hundreds of additive codes nobody shops for.
const SKIP_KEY_PREFIXES = [
  "en:e1", "en:e2", "en:e3", "en:e4", "en:e5", "en:e6", "en:e7", "en:e9",
  "xx:e",
];
function shouldSkipEntry(key, entry) {
  if (!entry?.name?.en) return true;                  // need an English name
  if (SKIP_KEY_PREFIXES.some(p => key.startsWith(p))) return true;
  // Drop pure E-number entries even if they have alphabetic names.
  if (/^e\d{2,4}[a-z]?$/i.test(entry.name.en.trim())) return true;
  return false;
}

// Filter individual dictionary names (post-projection). Drops entries that
// would bloat the file or clash with the keyword fallback. Conservative:
// keep anything a home cook might realistically write.
function shouldSkipName(name) {
  if (name.length < 2 || name.length > 40)  return true;  // junk + branded names
  if (/\d/.test(name))                      return true;  // "80% fat butter", "e171"
  if (/[%/]/.test(name))                    return true;  // percentages, ratios
  if (/^(non|low|reduced|extra|added|whole|half|fully|partly|partial)\b.{0,3}-\b/.test(name)) return true;
  // Defer to the keyword fallback for items whose qualifier is itself a
  // category signal — "dried oregano", "ground cumin", "frozen peas" should
  // route via the dried/ground/frozen rules in aggregator.js, not via OFF's
  // botanical classification.
  if (/^(dried|ground|frozen|tinned|canned|smoked|fresh)\s/.test(name)) return true;
  // Drop a few specific names where OFF's classification disagrees with the
  // existing keyword fallback (which we want to win for these cases).
  const skip = new Set([
    "bay leaf", "bay leaves",       // OFF: herb (Produce); kitchen: Cupboard.
    "allspice",                     // OFF: chili-pepper (Produce); kitchen: Cupboard.
    "cinnamon",                     // OFF: spice but ends up Produce sometimes via subroots.
    "pepper",                       // ambiguous: bell pepper vs black pepper.
    "fish",                         // bare "fish" is too generic.
    "meat",                         // bare "meat" — never written in a recipe.
    "vegetable", "fruit",
    "dairy", "cheese",              // too generic on its own.
    "herb", "herbs", "spice", "spices",
    "oil", "fat", "sauce", "vinegar", "wine", "beer", "juice",
    "flour", "sugar", "bread", "rice", "pasta", "milk",
    "honey", "syrup", "chocolate", "cocoa",
    "nut", "seed", "legume", "egg",
  ]);
  if (skip.has(name)) return true;
  return false;
}

// Names we'd never want surfaced as dictionary entries even if OFF lists
// them — taxonomy slugs that would mislead the categoriser. Most of these
// matter because OFF treats a few obvious foods as descendants of an awkward
// parent (e.g. ginger as spice → Cupboard, but fresh ginger is Produce).
const NAME_OVERRIDES = {
  // OFF puts ginger under "spice" → Cupboard. In recipes, "ginger" usually
  // means fresh ginger (Produce); ground / dried forms hit the fallback.
  "ginger":              "Produce",
};

// Manual additions: items the OFF taxonomy misses or names oddly. Keep this
// list small — the keyword fallback in aggregator.js handles most gaps.
const MANUAL_ENTRIES = [
  // Pantry items missing or under odd slugs in OFF.
  ["passata",            "Cupboard"],
  ["tomato paste",       "Cupboard"],
  ["tomato puree",       "Cupboard"],
  ["tomato purée",       "Cupboard"],
  ["chopped tomatoes",   "Cupboard"],
  ["plum tomatoes",      "Cupboard"],
  ["coconut milk",       "Cupboard"],
  ["coconut cream",      "Cupboard"],
  ["stock cube",         "Cupboard"],
  ["chicken stock",      "Cupboard"],
  ["vegetable stock",    "Cupboard"],
  ["beef stock",         "Cupboard"],
  ["fish stock",         "Cupboard"],
  ["bicarbonate of soda","Cupboard"],
  ["baking powder",      "Cupboard"],
  ["baking soda",        "Cupboard"],
  ["cornflour",          "Cupboard"],
  ["cornstarch",         "Cupboard"],
  ["yeast",              "Cupboard"],
  ["dried yeast",        "Cupboard"],
  ["fast action yeast",  "Cupboard"],
  ["vanilla extract",    "Cupboard"],
  ["vanilla essence",    "Cupboard"],

  // Bakery items.
  ["ciabatta",           "Bakery"],
  ["sourdough",          "Bakery"],
  ["focaccia",           "Bakery"],
  ["baguette",           "Bakery"],
  ["pitta",              "Bakery"],
  ["pita",               "Bakery"],
  ["tortilla",           "Bakery"],
  ["tortillas",          "Bakery"],
  ["wrap",               "Bakery"],
  ["wraps",              "Bakery"],
  ["brioche",            "Bakery"],
  ["brioche buns",       "Bakery"],
  ["bun",                "Bakery"],
  ["buns",               "Bakery"],
  ["roll",               "Bakery"],
  ["rolls",              "Bakery"],
  ["naan",               "Bakery"],

  // Produce common forms / plurals.
  ["onions",             "Produce"],
  ["spring onion",       "Produce"],
  ["spring onions",      "Produce"],
  ["scallion",           "Produce"],
  ["scallions",          "Produce"],
  ["garlic clove",       "Produce"],
  ["garlic cloves",      "Produce"],
  ["jersey royals",      "Produce"],
  ["baby potatoes",      "Produce"],
  ["pak choi",           "Produce"],
  ["bok choy",           "Produce"],
  ["choi sum",           "Produce"],
  ["tofu",               "Produce"],
  ["soft tofu",          "Produce"],
  ["firm tofu",          "Produce"],

  // Meat & fish forms.
  ["chicken thighs",     "Meat & fish"],
  ["chicken thigh",      "Meat & fish"],
  ["chicken breast",     "Meat & fish"],
  ["chicken breasts",    "Meat & fish"],
  ["smoked salmon",      "Meat & fish"],
  ["smoked trout",       "Meat & fish"],
  ["parma ham",          "Meat & fish"],
  ["pancetta",           "Meat & fish"],
  ["guanciale",          "Meat & fish"],
  ["chorizo",            "Meat & fish"],

  // Cupboard — flours and pre-made items that landed in Other in the survey.
  ["semolina",           "Cupboard"],
  ["fine semolina",      "Cupboard"],
  ["pizza dough",        "Cupboard"],
  ["sumac",              "Cupboard"],
  ["fenugreek",          "Cupboard"],

  // Dairy & eggs common forms.
  ["egg yolk",           "Dairy & eggs"],
  ["egg yolks",          "Dairy & eggs"],
  ["egg white",          "Dairy & eggs"],
  ["egg whites",         "Dairy & eggs"],
  ["natural yoghurt",    "Dairy & eggs"],
  ["greek yoghurt",      "Dairy & eggs"],
  ["double cream",       "Dairy & eggs"],
  ["single cream",       "Dairy & eggs"],
  ["whipping cream",     "Dairy & eggs"],
  ["soured cream",       "Dairy & eggs"],
  ["sour cream",         "Dairy & eggs"],
];

// ---------------------------------------------------------------------------

function loadTaxonomy() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Missing input: ${INPUT}`);
    console.error("Download it first — see the header of this script.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(INPUT, "utf8"));
}

// Convert a taxonomy key like "en:wheat-flour" to the slug "wheat flour".
function keyToName(key) {
  const i = key.indexOf(":");
  if (i < 0) return key.replace(/-/g, " ");
  return key.slice(i + 1).replace(/-/g, " ");
}

// Collect every descendant of a root via BFS. Returns a Set of keys.
function descendants(taxonomy, rootKey) {
  const out = new Set();
  if (!taxonomy[rootKey]) return out;
  const queue = [rootKey];
  while (queue.length) {
    const k = queue.shift();
    if (out.has(k)) continue;
    out.add(k);
    for (const c of (taxonomy[k]?.children || [])) queue.push(c);
  }
  return out;
}

function priorityIndex(category) {
  const i = CATEGORY_PRIORITY.indexOf(category);
  return i < 0 ? CATEGORY_PRIORITY.length : i;
}

function build() {
  const taxonomy = loadTaxonomy();

  // Stage 1: gather (key -> category) according to roots, with priority wins.
  const keyToCategory = new Map();
  for (const [rootKey, category] of ROOTS) {
    const descs = descendants(taxonomy, rootKey);
    for (const k of descs) {
      if (shouldSkipEntry(k, taxonomy[k])) continue;
      const existing = keyToCategory.get(k);
      if (!existing || priorityIndex(category) < priorityIndex(existing)) {
        keyToCategory.set(k, category);
      }
    }
  }

  // Stage 2: project keys onto English names (canonical and slug forms).
  // We also apply normaliseItemName so the dictionary keys collide with what
  // the aggregator will look up at runtime.
  const dict = new Map();
  function set(name, category, force = false) {
    const k = normaliseItemName(name);
    if (!k) return;
    if (!force && shouldSkipName(k)) return;
    const existing = dict.get(k);
    if (!existing || priorityIndex(category) < priorityIndex(existing)) {
      dict.set(k, category);
    }
  }
  for (const [key, category] of keyToCategory) {
    const entry = taxonomy[key];
    const en = entry?.name?.en;
    if (en) set(en, category);
    set(keyToName(key), category);
  }

  // Stage 3: apply name overrides and manual entries (force-add — these are
  // hand-picked and bypass the noise filter).
  for (const [name, category] of Object.entries(NAME_OVERRIDES)) {
    set(name, category, true);
  }
  for (const [name, category] of MANUAL_ENTRIES) {
    set(name, category, true);
  }

  return dict;
}

function writeDictionary(dict) {
  // Sort for stable diffs.
  const sorted = Array.from(dict.entries()).sort(([a], [b]) => a.localeCompare(b));
  const obj = Object.fromEntries(sorted);

  // Header is a key starting with `_` so it's documented inside the JSON;
  // the aggregator skips keys with a leading underscore.
  const header = {
    _attribution:
      "Generated from the Open Food Facts ingredients taxonomy " +
      "(https://world.openfoodfacts.org/data) by " +
      "scripts/build-categoriser-dictionary.mjs. " +
      "Source data is licensed under the Open Database License (ODbL) v1.0 " +
      "— see https://opendatacommons.org/licenses/odbl/ and " +
      "https://wiki.openfoodfacts.org/Data_License. " +
      "Do not hand-edit; re-run the build script.",
    _category_priority: CATEGORY_PRIORITY,
  };

  const output = { ...header, entries: obj };
  fs.writeFileSync(OUTPUT, JSON.stringify(output) + "\n");
  return { entryCount: sorted.length, bytes: fs.statSync(OUTPUT).size };
}

const dict = build();
const { entryCount, bytes } = writeDictionary(dict);
console.log(`Wrote ${entryCount} entries to ${path.relative(ROOT, OUTPUT)} (${(bytes / 1024).toFixed(1)} KB)`);

// Per-category breakdown.
const counts = new Map();
for (const cat of dict.values()) counts.set(cat, (counts.get(cat) || 0) + 1);
for (const cat of CATEGORY_PRIORITY) {
  if (counts.has(cat)) console.log(`  ${cat.padEnd(14)} ${counts.get(cat)}`);
}
