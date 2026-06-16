module Builders
  class CookbookHelpers < SiteBuilder
    SWEET_TAGS = %w[sweet dessert].freeze

    # Closed-set recipe status, in display order. Keep values in sync with
    # recipe_allowed_statuses in the Rakefile. `nil` covers unclassified recipes.
    STATUS_ORDER = %w[favourite faded untried].freeze
    STATUS_LABELS = {
      "favourite" => "Favourite",
      "faded"     => "Faded",
      "untried"   => "Untried",
    }.freeze

    # Slugs of sub-recipes linked from a recipe's ingredients via the markdown
    # `[label](slug.html)` form. One parser for the Sub-recipes section and the
    # relationship indices.
    def self.sub_recipe_slugs(resource)
      slugs = []
      Array(resource.data.recipeIngredient).each do |section|
        Array(section["items"]).each do |item|
          text = item.is_a?(Hash) ? (item["item"] || "") : item.to_s
          next unless text.include?("](") && text.include?(".html)")
          slugs << text.split("](").last.split(")").first.sub(".html", "")
        end
      end
      slugs.uniq
    end

    # Sub-recipe slugs linked by `resource` that resolve to a `base-recipe`-tagged
    # recipe. Requiring the tag stops an incidental shared component (e.g.
    # mayonnaise) from grouping unrelated dishes.
    def self.base_recipe_slugs(resource)
      sub_recipe_slugs(resource).select do |slug|
        sub = resource.collection.resources.find { |r| r.basename_without_ext == slug }
        sub && Array(sub.data.tags).include?("base-recipe")
      end
    end

    # All slugs in the same variant_of family as `resource`, including itself:
    # the canonical plus every variant pointing at that canonical. Lets the
    # relationship blocks treat interchangeable versions of a base (e.g. the two
    # pizza doughs) as one logical recipe.
    def self.variant_family_slugs(resource)
      slug = resource.basename_without_ext
      canonical = resource.data.variant_of || slug
      family = resource.collection.resources.each_with_object([canonical]) do |r, acc|
        acc << r.basename_without_ext if r.data.variant_of == canonical
      end
      family.uniq
    end

    # Stable ordering shared by every relationship block: status order
    # (favourite → untried → unset) then name.
    def self.by_status_then_name(resources)
      resources.sort_by do |r|
        idx = STATUS_ORDER.index(r.data.status) || STATUS_ORDER.length
        [idx, r.data.name.to_s.downcase]
      end
    end

    def build
      helper :sweet? do |resource|
        Array(resource.data.meal).include?("Sweet") ||
          (Array(resource.data.tags) & SWEET_TAGS).any?
      end

      # The four meal-plan slots. Keep aligned with SLOT_ORDER in plan.js.
      helper :plan_slot_for do |recipe|
        meals = Array(recipe.data.meal)
        next "Breakfast" if meals.include?("Breakfast")
        next "Lunch"     if meals.include?("Lunch")
        next "Dinner"    if meals.include?("Main")
        "Other"
      end

      # Default value for a plan entry — people count for servings recipes,
      # multiplier 1 otherwise. Matches defaultValueForRecipe in plan.js.
      helper :default_plan_value_for do |recipe|
        s = recipe.data.servings
        s.is_a?(Integer) && s.positive? ? s : 1
      end

      # Status values in display order (favourite → untried).
      helper :recipe_statuses do
        STATUS_ORDER
      end

      # Human label for a status value; nil/unknown returns nil.
      helper :status_label do |value|
        STATUS_LABELS[value]
      end

      # Sub-recipe slugs linked from this recipe's ingredients.
      helper :sub_recipe_slugs do |resource|
        CookbookHelpers.sub_recipe_slugs(resource)
      end

      # Other recipes sharing a base-recipe-tagged sub-recipe — treating all
      # versions of a base (its variant_of family) as the same base, so a pizza
      # on the slow dough and one on the Gozney dough count as siblings.
      helper :siblings_via_base do |resource|
        bases = CookbookHelpers.base_recipe_slugs(resource)
        if bases.empty?
          []
        else
          base_family = bases.flat_map do |b|
            sub = resource.collection.resources.find { |r| r.basename_without_ext == b }
            sub ? CookbookHelpers.variant_family_slugs(sub) : [b]
          end.uniq
          slug = resource.basename_without_ext
          sibs = resource.collection.resources.select do |r|
            r.basename_without_ext != slug && (CookbookHelpers.base_recipe_slugs(r) & base_family).any?
          end
          CookbookHelpers.by_status_then_name(sibs)
        end
      end

      # Other recipes in the same variant_of set — the canonical plus all
      # variants pointing at it, minus self. Works from either end.
      helper :version_set do |resource|
        slug = resource.basename_without_ext
        canonical = resource.data.variant_of
        recipes = resource.collection.resources
        members =
          if canonical
            [recipes.find { |r| r.basename_without_ext == canonical }].compact +
              recipes.select { |r| r.data.variant_of == canonical }
          else
            recipes.select { |r| r.data.variant_of == slug }
          end
        members = members.reject { |r| r.basename_without_ext == slug }.uniq
        CookbookHelpers.by_status_then_name(members)
      end

      # Dishes that link this resource — or any version in its variant_of family —
      # as a sub-recipe, so every dough version lists the pizzas that use any of
      # them. Turns a base into a hub. Not gated on the base-recipe tag.
      helper :used_in do |resource|
        family = CookbookHelpers.variant_family_slugs(resource)
        users = resource.collection.resources.select do |r|
          !family.include?(r.basename_without_ext) &&
            (CookbookHelpers.sub_recipe_slugs(r) & family).any?
        end
        CookbookHelpers.by_status_then_name(users)
      end
    end
  end
end
