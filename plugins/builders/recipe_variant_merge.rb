module Builders
  # Expand swap-based variants into full recipes and strip `key:` labels,
  # after every recipe is read and before anything renders. Downstream
  # (layouts, plan.erb, aggregator, scaling) only ever sees plain recipes.
  # See plugins/recipe_variants.rb.
  class RecipeVariantMerge < SiteBuilder
    def build
      hook :site, :post_read do |site|
        recipes = site.collections.recipes.resources
        originals = recipes.to_h { |r| [r.basename_without_ext, RecipeVariants.deep_dup(r.data.to_h)] }

        recipes.each do |resource|
          data = originals[resource.basename_without_ext]
          expanded =
            if data["swap"]
              main = originals[data["variant_of"]] ||
                raise("#{resource.relative_path}: variant_of `#{data["variant_of"]}` not found")
              RecipeVariants.merge(main, data)
            else
              RecipeVariants.normalise(data)
            end

          resource.data.delete("swap")
          expanded.each { |k, v| resource.data[k] = v }
        end
      end
    end
  end
end
