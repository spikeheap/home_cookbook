# Swap-based recipe variants. A main recipe labels swappable ingredient
# lines, steps and sections with `key:`; a variant (`variant_of:` + `swap:`)
# lists only what differs. `merge` produces a full recipe, so the page, plan
# and shopping list never see keys or swaps. Used by the build (see
# Builders::RecipeVariantMerge) and by `rake validate`. Pure functions on
# plain string-keyed hashes; inputs are never mutated.
module RecipeVariants
  class UnknownKey < StandardError; end

  # Identity fields a variant must set for itself rather than inherit.
  NOT_INHERITED = %w[status image date swap].freeze

  LISTS = %w[recipeIngredient recipeInstructions].freeze

  module_function

  # Strip keys and turn `{key, text}` steps back into plain strings.
  def normalise(data)
    out = deep_dup(data)
    LISTS.each do |list|
      next unless out[list].is_a?(Array)

      out[list] = out[list].map do |section|
        next section unless section.is_a?(Hash)

        section = section.except("key")
        section["items"] = Array(section["items"]).map { |node| strip_node(node, list) } if section.key?("items")
        section
      end
    end
    out
  end

  # Every key in document order: sections, then their items, list by list.
  def keys(data)
    each_keyed(data).map(&:first)
  end

  def key_errors(data)
    errors = keys(data).tally.select { |_, n| n > 1 }.keys.map { |k| "duplicate key `#{k}`" }
    Array(data["recipeInstructions"]).each do |section|
      next unless section.is_a?(Hash)

      Array(section["items"]).each do |step|
        if step.is_a?(Hash) && !step["text"].is_a?(String)
          errors << "step `#{step["key"]}` has no text"
        end
      end
    end
    errors
  end

  def merge(main, variant)
    swaps = variant["swap"] || {}
    unknown = swaps.keys - keys(main)
    raise UnknownKey, "swap key `#{unknown.first}` not found in main recipe" if unknown.any?

    out = deep_dup(main).reject { |k, _| NOT_INHERITED.include?(k) }
    variant.each { |k, v| out[k] = deep_dup(v) unless k == "swap" }

    LISTS.each do |list|
      next unless main[list].is_a?(Array)

      out[list] = main[list].flat_map do |section|
        next [section] unless section.is_a?(Hash)

        if swaps.key?(section["key"])
          next Array(swap_list(section["key"], swaps[section["key"]]))
        end

        section = section.dup
        section["items"] = Array(section["items"]).flat_map { |node| swap_node(node, swaps, list) } if section.key?("items")
        [section]
      end
    end

    normalise(out)
  end

  def swap_node(node, swaps, list)
    key = node.is_a?(Hash) ? node["key"] : nil
    return [node] unless key && swaps.key?(key)

    value = swaps[key]
    return [{ "text" => value }] if list == "recipeInstructions" && value.is_a?(String)

    swap_list(key, value)
  end

  def swap_list(key, value)
    raise ArgumentError, "swap `#{key}` must be a list (or a string, for a step); got #{value.inspect}" unless value.is_a?(Array)

    value
  end

  def strip_node(node, list)
    return node unless node.is_a?(Hash)
    return node["text"] if list == "recipeInstructions" && node.key?("text")

    node.except("key")
  end

  def each_keyed(data)
    found = []
    LISTS.each do |list|
      Array(data[list]).each do |section|
        next unless section.is_a?(Hash)

        found << [section["key"], section] if section["key"]
        Array(section["items"]).each do |node|
          found << [node["key"], node] if node.is_a?(Hash) && node["key"]
        end
      end
    end
    found
  end

  def deep_dup(obj)
    case obj
    when Hash  then obj.each_with_object({}) { |(k, v), h| h[k.to_s] = deep_dup(v) }
    when Array then obj.map { |v| deep_dup(v) }
    else obj
    end
  end
end
