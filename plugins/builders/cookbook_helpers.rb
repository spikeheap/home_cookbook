module Builders
  class CookbookHelpers < SiteBuilder
    SWEET_TAGS = %w[sweet dessert].freeze

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
    end
  end
end
