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
---
```

- **cuisine** — single value, the dominant cuisine.
- **meal** — array; one or more of the values above.
- **effort** — `weeknight` (≤1h, hands-on), `weekend` (1–4h or one involved step), `project` (overnight ferment, multi-day, etc.).
- **tags** — cross-cutting: `bread`, `pasta`, `vegan`, `vegetarian`, `pizza`, `sous-vide`, `slow-cook`, `salad`, `soup`, `pie`, `eggs`, `salsa`, `dessert`, `sweet`, `baking`, `coffee`, `preserves`, `winter`, `grandma-bo`, `base-recipe`.

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

## Future improvements

- **Readme/skeleton**. Update the readme and recipe rake task to explain fields and provide more guidance when authoring.

- **Sub-recipe scaling.** When you change the scale on a recipe page, only the parent recipe's ingredients are multiplied. Recipes that inline another recipe (e.g. caesar → mayonnaise, pizza → dough/sauce) leave the inlined sub-recipe unchanged. The right model needs a "fraction-of-yield" concept (the parent uses 150ml of a recipe that yields 300ml), which we don't track yet.

- **Recipe scaling.** Can we normalise on "people this will feed" and enable scaling to specific group sizes, rather than a recipe for 4 being doubled or halved?

- **Image scaling.** Add image scaling rake tasks to generate images for different screen sizes.
