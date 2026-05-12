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

Three ways:

1. **`/admin/`** — Sveltia CMS, a form-based editor that commits straight to GitHub. See [Netlify setup](#netlify-dependencies) below.
2. **Scrape from a URL** — `npm run scrape -- https://…` extracts JSON-LD `Recipe` schema and writes a draft `_recipes/<slug>.md` for you to refine.
3. **Hand-edit YAML** — copy [`_recipes/focaccia.md`](_recipes/focaccia.md) as a template.

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

## Netlify dependencies

The `/admin/` route uses Sveltia CMS, which authenticates against the repo through Netlify. One-time setup:

1. **Netlify Identity** — Site settings → Identity → *Enable Identity*. Set registration to *Invite only* (cookbook is private).
2. **Git Gateway** — Identity → Services → *Enable Git Gateway*. This is what lets Sveltia commit to the repo without leaving Netlify.
3. **Invite yourself** — Identity → *Invite users* → enter your email. Click the link in the invite email, set a password, and you're in.

Sveltia and the Netlify Identity widget load from CDNs (`unpkg.com`, `identity.netlify.com`) — no build step needed.

## Scraping a recipe from a URL

```bash
npm run scrape -- https://www.bbc.co.uk/food/recipes/focaccia_08389
```

Finds the JSON-LD `Recipe` block on the page, maps fields to this project's schema (handling `HowToStep` / `HowToSection` for instructions, fractions and ranges in ingredient quantities), and writes `_recipes/<slug>.md`. Cuisine / meal / effort / tags / image are left blank — fill them in via `/admin/` or by editing the file.

## Future improvements

- **Sub-recipe scaling.** When you change the scale on a recipe page, only the parent recipe's ingredients are multiplied. Recipes that inline another recipe (e.g. caesar → mayonnaise, pizza → dough/sauce) leave the inlined sub-recipe unchanged. The right model needs a "fraction-of-yield" concept (the parent uses 150ml of a recipe that yields 300ml), which we don't track yet.

- **Recipe scaling** Can we normalise on "people this will feed" and enable scaling to specific group sizes, rather than a recipe for 4 being doubled or halved?

## Image processing

```
magick cinnamon_buns.jpeg -resize 2160x2160 -sampling-factor 4:2:0 -strip -quality 85 cinnamon_buns-2160w.jpg
```
