module Builders
  class CookbookHelpers < SiteBuilder
    SWEET_TAGS = %w[sweet dessert].freeze

    # Closed-set recipe status, in display order. Keep values in sync with
    # recipe_allowed_statuses in the Rakefile. `nil` covers unclassified recipes.
    STATUS_ORDER = %w[favourite occasional faded untried].freeze
    STATUS_LABELS = {
      "favourite"  => "Favourite",
      "occasional" => "Occasional",
      "faded"      => "Faded",
      "untried"    => "Untried",
    }.freeze

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
    end
  end
end
