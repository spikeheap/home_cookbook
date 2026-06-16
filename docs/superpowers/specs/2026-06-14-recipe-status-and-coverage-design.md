# Recipe status + coverage gap — design

**Date:** 2026-06-14

## Problem

1. **Coverage gap.** Meals we cook regularly (tracked in `../meal_plan_history_aggregation/data/`) are not all captured in the cookbook. Of 895 distinct canonical meals, only 24 are linked to a cookbook recipe via the `slug` column; many high-frequency meals (Pizza 46×, Maangchi pork belly 36×, Katsu curry 27×, chicken fajitas 21×, jacket potatoes with beans 18×) have no recipe.
2. **No status dimension.** The cookbook can't distinguish family favourites from recipes we cook occasionally, recipes that have fallen out of favour, or recipes added speculatively before trying that never landed.

## Decisions (from brainstorming)

- Status is a **manual frontmatter field**, not derived from history data.
- **Four values, no default** — absent means unclassified (no validator nag).
- Status **surfaces in the UI** — badge on cards/list items + a browse page.
- Coverage gap addressed by a **one-time prioritised list**, not committed tooling.

## Part A — `status` frontmatter field

A new optional closed-set field, mirroring `effort`.

| value | meaning |
|---|---|
| `favourite` | family favourite — cook often, everyone loves it |
| `occasional` | in rotation, cook now and then |
| `faded` | fallen out of favour |
| `untried` | added before trying / wasn't a hit |

- Optional. Absent = unclassified.
- Single string value (not an array).

### Validation (`Rakefile`)

- Add a `recipe_allowed_statuses` method (`%w[favourite occasional faded untried]`) alongside `recipe_allowed_efforts`.
- In the `:validate` task, add a check mirroring the `effort` check exactly: if `status` is present and not in the allowed set → error `invalid status: … (allowed: …)`.
- Status is **not** added to the required-fields list (`date name cuisine meal effort`).
- Add a commented `status:` line to the `:recipe` skeleton task output, listing allowed values (like the `effort:` hint).

### Docs sync

- `Readme.md` — add `status` to the closed-set documentation kept in sync with the Rakefile.
- `.claude/skills/recipe-import/SKILL.md` — add `status` to the "Closed-set fields" section so future imports classify it.

## Part B — UI: badge + filter

Follows existing patterns (`by-cuisine.erb`, `by-tag.erb`, `card__meta`).

- **Badge** — add a status pill to `_recipe_card.erb`'s `card__meta` span, and to the list-item meta where shown. Renders only when `status` is set. One CSS class per value; `favourite` accented, `faded`/`untried` muted/de-emphasised. New styles in `frontend/styles/index.css`.
- **Browse page** — new `src/by-status.erb`, permalink `/by-status/`, following `by-cuisine.erb`. Sections in fixed order favourite → occasional → faded → untried, each `id`'d for anchor links, listing recipes via `recipe_list_item`. If any recipes have no status, list them in a trailing "Unclassified" section.
- **Home browse chips** — add a "By status" chip group to the Browse section in `index.erb`, linking to `/by-status/#<value>`, with per-value counts.
- **Out of scope (YAGNI):** a dedicated "Favourites" rail on the home page. Easy to add later if wanted.

## Part C — coverage gap, one-time list

A throwaway analysis run now; produces a list, not committed tooling.

- Read `../meal_plan_history_aggregation/data/clusters.json`, rank canonical meals by `total`.
- Determine which canonical meals are already covered by matching on **both**:
  - the `slug` column (24 direct links), and
  - **fuzzy name match** of the canonical meal name against the 60 cookbook recipe `name`/slug values — the slug column is sparse, so name-matching prevents recommending dishes already present (e.g. chicken curry).
- **Exclude** obvious non-recipes: drinks/beer, "… leftovers", takeaway/restaurant/on-site markers. Borderline cases are flagged in the output, not dropped silently.
- Output: a ranked markdown table of frequent meals **missing** from the cookbook (canonical name, frequency, note). Delivered for the user to import at their own pace via the `recipe-import` skill.

## Sequencing

Independent; can be done in either order or parallel:

1. **Coverage list** (Part C) — analysis only, no code change. Quick win, delivered first.
2. **Status feature** (Parts A + B) — code change to Rakefile, templates, CSS, docs. Validate with `bundle exec rake validate`.

## Success criteria

- `rake validate` rejects an invalid `status` value and accepts the four valid ones + absence.
- A recipe with `status: favourite` shows a badge on its card and appears under Favourites on `/by-status/`.
- The home Browse section offers a "By status" group with correct counts.
- A ranked list of missing frequently-cooked meals exists for the user to work through.
- `Readme.md` and the `recipe-import` skill document the new field.
