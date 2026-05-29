# Our home cookbook

This cookbook is build on the [Bridgetown](https://www.bridgetownrb.com) static site generator.

## Dev server

```bash
bin/bt dev
```

## Tests

The tests are completely separate to Bridgetown, and were used to enable the migration both of framework and hosting provider.

```bash
npm test
```

## Adding a recipe

Three different ways:

1. **Generate a skeleton** — `bundle exec rake 'recipe[Crispy Tofu Bowl]'` writes `src/_recipes/crispy_tofu_bowl.md` with today's date and the canonical frontmatter shape, ready to fill in. The slug is normalised from the argument; quotes are required in zsh so the brackets aren't globbed.
2. **Scrape from a URL** — `npm run scrape -- https://…` extracts JSON-LD `Recipe` schema and writes a draft `src/_recipes/<slug>.md` for you to refine.
3. **Hand-edit YAML** — copy [`src/_recipes/focaccia.md`](src/_recipes/focaccia.md) as a template.

Each recipe is classified along four axes:

```yaml
---
name: Focaccia
cuisine: Italian              # one of: British, Italian, Mexican, ...
meal: [Side]                  # Main, Lunch, Breakfast, Side, Snack, Sweet, Drink, Condiment
effort: weekend               # weeknight | weekend | project
tags: [bread, baking, vegan]  # free-form, lowercase
servings: 4                   # optional integer; see "Scaling" below
---
```

- **cuisine** — single value, the dominant cuisine.
- **meal** — array; one or more of the values above.
- **effort** — `weeknight` (≤1h, hands-on), `weekend` (1–4h or one involved step), `project` (overnight ferment, multi-day, etc.).
- **tags** — cross-cutting: `bread`, `pasta`, `vegan`, `vegetarian`, `pizza`, `sous-vide`, `slow-cook`, `salad`, `soup`, `pie`, `eggs`, `salsa`, `dessert`, `sweet`, `baking`, `coffee`, `preserves`, `winter`, `grandma-bo`, `base-recipe`.
- **servings** — integer; optional. When set, the recipe-page stepper scales by *people* (e.g. "Serves [- 4 +]"). When omitted — typical for breads, batch sweets, drinks, condiments — it scales by *multiplier* (×½, ×1, ×2). A planned meal-plan / shopping-list feature will aggregate quantities across recipes; `servings` lets it scale by household size.

### Ingredients and method shape

Both `recipeIngredient` and `recipeInstructions` are lists of sections. The `heading` is optional — omit it for an unnamed single section.

```yaml
recipeIngredient:
  - items:
    - { quantity: 500, unit: g,    item: strong white flour }
    - { quantity: 2,   unit: tsp,  item: salt }
recipeInstructions:
  - items:
    - Mix the dough...
    - Bake for 20 minutes...
```

Sectioned form (used by pizza, caesar, sourdough, etc.):

```yaml
recipeIngredient:
  - heading: Dough
    items: [...]
  - heading: Toppings
    items: [...]
```

### Sub-recipes (`uses_fraction`)

When an ingredient inlines another recipe (markdown link to `slug.html`), add `uses_fraction` to declare what portion of the sub-recipe's batch this recipe uses. The recipe-page stepper multiplies the inlined ingredients by `factor × uses_fraction`, and the sub's summary line shows e.g. "make ½ batch" — updating as the parent scales.

```yaml
- quantity: 1
  unit: ball
  item: "[pizza dough](pizza_dough_gozney.html)"
  uses_fraction: 0.2          # this recipe uses 1 of 5 dough balls
```

Omit `uses_fraction` for sub-recipes you intentionally want to display unchanged (e.g. a base recipe whose full batch is used).

## Future improvements

- **Readme/skeleton**. Update the readme and recipe rake task to explain fields and provide more guidance when authoring.

- **Image scaling.** Add image scaling rake tasks to generate images for different screen sizes.

- **Mobile recipe-page UX — beyond the sticky-collapsible ingredients we have today.** While reading method steps the cook still has to expand-and-scan to find which ingredients a specific step uses. Options ranked roughly by effort:

  - *Auto-detect ingredient pills above each step.* For each step's text, fuzzy-match against the recipe's own ingredient list and render matched items as compact chips above the step. Re-use the existing `.ingredient__qty` markup so the stepper scales the pill quantities for free. ~3–4 hours; ~80% right out of the box (will mis-fire on generic words like "salt" when a recipe has multiple, and miss things like "the dough" that don't name an ingredient).
  - *Manual `uses:` per step.* Authors annotate each step with which ingredients it touches (`uses: [flour, eggs]`). Perfect signal but adds a tax to every recipe — ~3–5 hours one-off plus an ongoing authoring cost.
  - *Inline anchor styling.* Same matcher as the pills, but the ingredient *words* in step text become styled spans that peek the ingredient row when tapped. Less visual change, still needs scrolling for quantities.
  - *Bidirectional tap-to-highlight.* Tap an ingredient → step(s) that use it pulse; tap a step → its ingredients highlight. Nearly free on top of the matcher.
  - *Floating action button + bottom sheet.* iOS-native pattern as an alternative to the sticky bar — circular button bottom-right opens a half-screen overlay with ingredients.
