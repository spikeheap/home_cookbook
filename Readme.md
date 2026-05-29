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

- **Sub-recipe scaling.** When you change the scale on a recipe page, only the parent recipe's ingredients are multiplied. Recipes that inline another recipe (e.g. caesar → mayonnaise, pizza → dough/sauce) leave the inlined sub-recipe unchanged. The right model needs a "fraction-of-yield" concept (the parent uses 150ml of a recipe that yields 300ml), which we don't track yet.

- **Image scaling.** Add image scaling rake tasks to generate images for different screen sizes.
