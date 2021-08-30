# Our home cookbook

## To run locally

```bash
bundle exec jekyll serve --livereload
```

> To debug Jekyll boot or loading errors, add `--trace` to the above command

## How to add content

### Adding a recipe

Create a Markdown file in `_recipes/` with frontmatter structured like [this example](_recipes/focaccia.md). The structure of the frontmatter roughly mirrors the [recipe schema on schema.org](https://schema.org/Recipe), though not all the metadata is currently displayed.

Recipes are assigned one of more categories using `categories` in frontmatter:

```
---
name: Focaccia
categories: Bread
---
```

You can specify multiple categories in an array:

```
---
name: Barbacoa beef tacos
categories: [Mexican, Party]
---
```

### Creating a category

Create a Markdown or HTML file in the `/categories/` directory. This must have a `title` matching the category name used on recipes, and should use the `category` layout, e.g.: 

```
---
layout: category
title: Bread
---
We like bread 🤪
```

The `category` layout will append a list of the recipes with that category below the content of the above file.

### Resizing an image

```
magick cinnamon_buns.jpeg -resize 2160x2160 -sampling-factor 4:2:0 -strip -quality 85 cinnamon_buns-2160w.jpg
```

## Credit

- Uses the https://github.com/fongandrew/hydeout theme
