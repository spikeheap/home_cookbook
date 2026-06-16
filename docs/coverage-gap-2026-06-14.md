# Coverage gap — frequently-cooked meals missing from the cookbook

**Generated:** 2026-06-14 · **Source:** `../meal_plan_history_aggregation/data/clusters.json`

Method: meal-plan history folded so "X leftovers" counts towards "X", drinks/takeaway/notes
excluded, frequencies summed, then matched against the 66 cookbook recipes by name + slug
tokens. Frequencies are total appearances since 2016. Work through these via the
`recipe-import` skill at your own pace.

> The `slug` column in `clusters.json` only links 24 of 895 canonical meals. Filling it in
> (in the aggregation repo) would make future re-runs sharper — out of scope here.

## Tier 1 — clear gaps, cook often (add these first)

| freq | meal | note |
|---:|---|---|
| 27 | Chilli | no chilli recipe at all |
| 27 | Katsu curry | |
| 25 | Lasagna | only the *aubergine* lasagne exists — this is the classic meat one |
| 23 | Burgers | buns exist (`*_brioche_burger_buns`), no patty/assembly recipe |
| 21 | Chicken fajitas | |
| 18 | Jacket potatoes with beans | could be a short method note rather than a full recipe |
| 16 | Sushi | |
| 15 | Ramen | |
| 15 | Sausage casserole | |
| 12 | Noodle stir fry | |
| 11 | Mushroom risotto | |
| 11 | Sausage gnocchi bake | |
| 11 | Cajun chicken stew | |
| 9 | Bolognese | |
| 9 | Sausage and mash with red cabbage | |
| 9 | Korean chicken stew | |
| 8 | Calzones | |
| 8 | Prawn stir fry | |
| 5 | Goulash | |

## Tier 2 — families worth one flexible recipe each

These appear under many names; one adaptable recipe likely covers the lot.

| combined freq | family | members |
|---:|---|---|
| ~33 | **Rice bowls** | Rice bowl (12), Tofu rice bowl (11), Salmon rice bowl (10) |
| ~33 | **Wraps** | Chickpea (12), Roast veg (9), Falafel (9), Roast veg + chorizo (6), Corn/flour (6) — note `pitta_wraps` already exists |
| ~22 | **Roast veg traybake** | Roasted veg + halloumi + potatoes (11), Gnocchi roast veg + halloumi + chorizo (6), Roast veg + chorizo (5) |
| ~29 | **Burger variants** | Turkey (8), Falafel (8), Onion bhaji (7), Mushroom (6) — fold into the Tier 1 Burgers recipe |
| ~16 | **Tacos / burritos (veg)** | Black bean tacos (11), Butternut + black bean tacos (5) — note `brooks_tacos` exists; this is the veg version |

## Tier 3 — fish & seafood

| freq | meal |
|---:|---|
| 9 | Fish and chips |
| 9 | Mackerel thai rice |
| 6 | Chicken tinga burrito bowls |
| 5 | Mackerel fish cakes |
| 5 | Pan-fried salmon, samphire, tenderstem & asparagus |
| 5 | Salmon and noodles |

## Likely already covered — verify, then link the slug (don't re-add)

| freq | meal | probable existing recipe |
|---:|---|---|
| 36 | Maangchi pork belly | one of `pork_belly_strips_with_spring_onion_salad` / `pork_belly_skewers_with_adobo_glaze`? |
| 16 | Bean ragu | `bean_ragout` (Slow-cooked bean ragout) — almost certainly the same |
| 11 | Fresh pasta with slow-roasted tomatoes & shallots | `slow_roasted_tomato_shallot_tagliatelli` |
| 9 | Lemon pasta with prawns | `lemon_courgette_pasta` (One-pot pasta a limone) variant |
| 6 | Chicken curry and paneer curry | `chicken_curry` + `saag_paneer` |
| 5 | Mac n cheese with cauliflower and leek | `crab_mac_n_cheese` / `cauliflower_cheese` |

## Deliberately excluded

- **Drinks** (beer, whiskey sour, bloody mary, etc.) and **takeaway / eating out** markers.
- **Assembly / generic** items unlikely to want a recipe: roast veg (9), veg pasta (7),
  chicken breast (6), poached eggs on toast (6), hot dogs (9), steak, plain pasta with
  cherry tomatoes (11). Promote any you *do* want a recipe for.
- Bare ingredients / planning notes (apples, bread, "misc/cleanup", "Xmas eve meal", etc.).
