---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: home
---
# Home Cookbook

Count: {{ recipes.size }}
{% for recipe in site.recipes %}
  <h2>{{ recipe.name }} - {{ recipe.author.name }}</h2>
  <p>{{ recipe.content | markdownify }}</p>
{% endfor %}