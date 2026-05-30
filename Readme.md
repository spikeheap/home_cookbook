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

### Per-item flags

Each ingredient hash supports a couple of optional flags beyond the
core `quantity` / `unit` / `item`:

```yaml
- quantity: 2
  item: kaffir lime leaves
  optional: true              # renders an OPTIONAL pill next to the name
- quantity: 1
  unit: ball
  item: "[pizza dough](pizza_dough_gozney.html)"
  uses_fraction: 0.2          # this recipe uses 1 of 5 dough balls
```

- **`optional: true`** — renders a small OPTIONAL pill next to the
  ingredient name. The validator (`bundle exec rake validate`) refuses
  the word "optional" embedded inside item text, so the pill is the
  canonical signal.
- **`uses_fraction`** — when an ingredient inlines another recipe
  (markdown link to `slug.html`), declare what portion of the
  sub-recipe's batch this recipe uses. The recipe-page stepper
  multiplies the inlined ingredients by `factor × uses_fraction`, and
  the sub's summary line shows e.g. "make ½ batch" — updating as the
  parent scales. Omit `uses_fraction` for sub-recipes whose full batch
  is used.

## Security / threat model

This site is a single-author cookbook. Recipes are written and reviewed by
Ryan; there is no contributor flow, no recipe import path, and no CMS.
That single trust assumption underpins two design choices worth calling
out so future-me (or anyone) doesn't loosen them by accident:

- **Markdown allows raw HTML.** Both `_partials/_instruction_list.erb` and
  `_partials/_ingredient_item.erb` markdownify recipe text and pass the
  output through `safe(...)`. Bridgetown uses Kramdown by default, and
  Kramdown permits inline raw HTML — `<em>except</em>` in
  `src/_recipes/bean_ragout.md` is the one legitimate use. A `<script>`
  in a recipe Markdown file would execute on the recipe page and on the
  homepage search excerpt. **Do not accept third-party recipe PRs and do
  not add a "scrape from URL" flow that auto-commits without a sanitiser
  landing first** (Loofah or Sanitize, scoped to deny `<script>`,
  `<iframe>`, event-handler attributes, and `javascript:` URLs).
- **`recipe.url` in the plan JSON.** `src/plan.erb` inlines a JSON blob
  of every recipe (slug, name, url, ...). The `url` is currently
  `r.relative_url` — a Bridgetown-computed path, not user input. The
  client-side renderer (`frontend/javascript/lib/plan.js`) passes every
  URL through `safeHref()` before placing it in an `href=`, which
  rejects anything that isn't a site-relative path or `http(s)://…`. If
  you ever populate `url` from an external source, `safeHref` is the
  last line of defence — keep it.

Other relevant defences in code; don't loosen without thinking:

- `Content-Security-Policy` in `src/_headers`. Headers stay strict
  (`script-src 'self' 'wasm-unsafe-eval'`); the theme + plan-mode
  bootstrap lives in `src/assets/theme-bootstrap.js` as a static file
  rather than inline so the CSP doesn't need a per-edit SHA-256 hash
  (Netlify's HTML minifier rewrites whitespace inside inline
  `<script>` blocks, invalidating any pre-computed hash).
  `wasm-unsafe-eval` is the narrow grant required for Pagefind's
  search index; broader `unsafe-eval` is not.
- The plan-share import flow (URL hash → `decodePlan`) validates schema
  version, payload shape, and per-entry types, and caps the
  decompressed JSON at 200 KB to defuse lz-string zip-bombs.
- Search excerpts from Pagefind are HTML-escaped except for `<mark>` /
  `</mark>` (the highlight tags), via `safeExcerpt` in `search.js`.

## Runtime UX worth knowing about

- **Mobile ingredients peek sheet.** On narrow viewports the recipe
  page's ingredients block is pinned to the bottom of the viewport
  with only the heading visible above the fold; tapping the heading
  slides the full list up. On desktop the same markup renders as a
  sticky sidebar. Driven by `frontend/javascript/lib/ingredients-sheet.js`,
  gated on `html.js` so a no-JS visit falls back to an in-flow
  ingredients section.
- **Tick + Reset.** Tap an ingredient row (recipe page) or a row in
  the meal plan's shopping list to strike it through. State is
  persisted per-recipe (`cookbook.ticks.{slug}`) and per-plan
  (`cookbook.plan-ticks`) in `localStorage`. When at least one item
  is ticked, a small RESET button takes the count's slot in the
  heading; tapping it clears the ticks and brings the count back.
  Stale shop ticks (items no longer in the aggregated list) are
  pruned on render. Ticking a parent ingredient strikes its inlined
  sub-recipe items via a CSS cascade; un-ticking the parent leaves
  individually-ticked sub-items struck.

### Images

Recipe hero images live in `src/images/`. After dropping a new master in
(named `<slug>.jpg` or `<slug>-2160w.jpg`), run:

```bash
bundle exec rake images
```

ImageMagick resizes it into responsive variants (360 / 720 / 1280 /
2160w), skipping any width larger than the master and any output already
newer than its source. Commit the generated files. The recipe layout
emits a `<img srcset>` covering whichever variants exist on disk, so
browsers pick the right size without further wiring. External image
URLs (e.g. BBC food images) pass through unchanged with no srcset.

## Future improvements

- **Phase 3 — Ocado integration.** Map shopping-list items to Ocado SKUs (favourites, pack counts) so a basket can be assembled. Smart-paste of an existing basket is the proposed starting point.

- **Phase 4 — Auto-populate basket.** Once mapping is in place, push the resolved basket to Ocado via their API or a scripted flow, with a review step before checkout. Blocked on Phase 3.
