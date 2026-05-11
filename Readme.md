# Our home cookbook

## Dev server

```bash
bundle exec jekyll serve --livereload   # content iteration, no search
npm run dev                             # full site + Pagefind, served on :1414
```

## Tests

```bash
npm test
```

## Adding a recipe

Create a Markdown file in `_recipes/` with frontmatter structured like [this example](_recipes/focaccia.md). The structure roughly mirrors the [recipe schema on schema.org](https://schema.org/Recipe).

Each recipe is classified along four axes:

```
---
name: Focaccia
cuisine: Italian              # one of: British, Italian, Mexican, ...
meal: Side                    # Main, Lunch, Breakfast, Side, Snack, Sweet, Drink, Condiment
                              #   (use an array for multi: [Main, Lunch])
effort: weekend               # weeknight | weekend | project
tags: [bread, baking, vegan]  # free-form, lowercase
---
```

- **cuisine** — single value, the dominant cuisine.
- **meal** — when it's eaten. Array if it works for more than one.
- **effort** — `weeknight` (≤1h, hands-on), `weekend` (1–4h or one involved step), `project` (overnight ferment, multi-day, etc.).
- **tags** — cross-cutting: `bread`, `pasta`, `vegan`, `vegetarian`, `pizza`, `sous-vide`, `slow-cook`, `salad`, `soup`, `pie`, `eggs`, `salsa`, `dessert`, `sweet`, `baking`, `coffee`, `preserves`, `winter`, `grandma-bo`, `base-recipe`.

## Future improvements

- **Netlify form to add recipes.** We end up editing the YAML, but we'd rather just edit a form, with GitHub auth probably.

- **Add a scraper script..** I used to have a scraper but it's lost and the schema has changed. Re-add it, maybe with a form trigger to run it as a Netlify function.

- **Sub-recipe scaling.** When you change the scale on a recipe page, only the parent recipe's ingredients are multiplied. Recipes that inline another recipe (e.g. caesar → mayonnaise, pizza → dough/sauce) leave the inlined sub-recipe unchanged. The right model needs a "fraction-of-yield" concept (the parent uses 150ml of a recipe that yields 300ml), which we don't track yet.

```
magick cinnamon_buns.jpeg -resize 2160x2160 -sampling-factor 4:2:0 -strip -quality 85 cinnamon_buns-2160w.jpg
```
