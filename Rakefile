require "bridgetown"

Bridgetown.load_tasks

# Run rake without specifying any command to execute a deploy build by default.
task default: :deploy

#
# Standard set of tasks, which you can customize if you wish:
#
desc "Build the Bridgetown site for deployment"
task :deploy => [:validate, :clean, "frontend:build"] do
  Bridgetown::Commands::Build.start
end

desc "Build the site in a test environment"
task :test => :validate do
  ENV["BRIDGETOWN_ENV"] = "test"
  Bridgetown::Commands::Build.start
end

desc "Runs the clean command"
task :clean do
  Bridgetown::Commands::Clean.start
end

namespace :frontend do
  desc "Build the frontend with esbuild for deployment"
  task :build do
    sh "npm run esbuild"
  end

  desc "Watch the frontend with esbuild during development"
  task :dev do
    sh "npm run esbuild-dev"
  rescue Interrupt
  end
end

# Closed-set values enforced by the :validate task. Keep these in sync with the
# documentation in Readme.md.
#
# These are methods rather than constants because Bridgetown's CLI app loads
# the Rakefile twice in some paths (locate_rake_task + print_usage in
# bridgetown-core's commands/application.rb), and Ruby warns at default level
# on constant redefinition but stays quiet on method redefinition.
def recipe_allowed_meals
  %w[Main Lunch Breakfast Side Snack Sweet Drink Condiment].freeze
end

def recipe_allowed_efforts
  %w[weeknight weekend project].freeze
end

def recipe_allowed_diets
  %w[
    http://schema.org/GlutenFreeDiet
    http://schema.org/LowCalorieDiet
    http://schema.org/LowFatDiet
    http://schema.org/LowLactoseDiet
    http://schema.org/LowSaltDiet
    http://schema.org/VeganDiet
    http://schema.org/VegetarianDiet
  ].freeze
end

desc "Generate a skeleton recipe at src/_recipes/<slug>.md (e.g. rake 'recipe[crispy_tofu]')"
task :recipe, [:slug] do |_t, args|
  require "date"

  raw = args[:slug] || abort("Usage: rake 'recipe[slug_or_name]'")
  slug = raw.downcase.gsub(/[^a-z0-9]+/, "_").gsub(/^_+|_+$/, "")
  abort("Slug is empty after normalisation") if slug.empty?

  path = "src/_recipes/#{slug}.md"
  abort("#{path} already exists") if File.exist?(path)

  name = slug.split("_").map(&:capitalize).join(" ")

  File.write(path, <<~MD)
    ---
    date: #{Date.today.iso8601}
    name: #{name}
    cuisine:                  # e.g. British, Italian, Mexican
    meal: [Main]              # one or more of: #{recipe_allowed_meals.join(", ")}
    effort:                   # #{recipe_allowed_efforts.join(" | ")}
    tags: []                  # free-form, lowercase (e.g. bread, vegan, sous-vide)
    description:
    keywords: []
    prepTime: PT0M
    cookTime: PT0M
    recipeYield:
    servings:                 # optional integer; omit for batch/yield-based recipes (bread, sweets, drinks)
    image:                    # /images/#{slug}-2160w.jpg
    isBasedOn:                # source URL
    author:
      "@type": Person
      name:
    suitableForDiet: []       # e.g. http://schema.org/VegetarianDiet
    recipeIngredient:
      - items:
          - quantity:
            unit:
            item:
    recipeInstructions:
      - items:
          -
    ---
  MD

  puts "Created #{path}"
end

desc "Validate recipe frontmatter (yamllint + closed-set checks). Default: all recipes; pass paths to limit, e.g. rake 'validate[src/_recipes/focaccia.md src/_recipes/dal.md]'"
task :validate, [:paths] do |_t, args|
  require "yaml"
  require "tempfile"
  require "fileutils"
  require "shellwords"

  paths = if args[:paths] && !args[:paths].to_s.strip.empty?
    args[:paths].split(/\s+/).reject(&:empty?)
  else
    Dir.glob("src/_recipes/*.md").sort
  end

  yamllint = ENV["YAMLLINT"] || "yamllint"
  unless system("which #{yamllint.shellescape} > /dev/null 2>&1")
    abort("yamllint not found on PATH — install it (e.g. brew install yamllint) or set $YAMLLINT")
  end

  config_path = File.expand_path(".yamllint.recipes.yml", __dir__)
  errors = []
  staging = Dir.mktmpdir("recipe-validate")

  begin
    paths.each do |path|
      unless File.exist?(path)
        errors << "#{path}: file not found"
        next
      end

      content = File.read(path)
      match = content.match(/\A---\s*\n(.*?\n)---\s*(?:\n|\z)/m)
      unless match
        errors << "#{path}: missing or malformed YAML frontmatter (expected leading and closing `---`)"
        next
      end

      yaml_body = match[1]

      # yamllint on just the frontmatter, via a staged copy so error lines map cleanly.
      staged = File.join(staging, File.basename(path, ".md") + ".yml")
      File.write(staged, "---\n" + yaml_body)
      output = `#{yamllint.shellescape} -c #{config_path.shellescape} -f parsable #{staged.shellescape} 2>&1`
      unless $?.success?
        # Rewrite the staged path back to the source path for readable output.
        errors << output.gsub(staged, path).strip
      end

      begin
        data = YAML.safe_load(yaml_body, permitted_classes: [Date, Time])
      rescue Psych::SyntaxError => e
        errors << "#{path}: YAML parse error: #{e.message}"
        next
      end

      unless data.is_a?(Hash)
        errors << "#{path}: frontmatter is not a mapping"
        next
      end

      %w[date name cuisine meal effort].each do |field|
        value = data[field]
        if value.nil? || (value.is_a?(String) && value.strip.empty?) || (value.is_a?(Array) && value.empty?)
          errors << "#{path}: required field `#{field}` is missing or empty"
        end
      end

      meal = Array(data["meal"])
      bad_meals = meal - recipe_allowed_meals
      unless bad_meals.empty?
        errors << "#{path}: invalid meal value(s): #{bad_meals.join(", ")} (allowed: #{recipe_allowed_meals.join(", ")})"
      end

      effort = data["effort"]
      if effort && !recipe_allowed_efforts.include?(effort)
        errors << "#{path}: invalid effort: #{effort.inspect} (allowed: #{recipe_allowed_efforts.join(", ")})"
      end

      servings = data["servings"]
      if !servings.nil? && !(servings.is_a?(Integer) && servings.positive?)
        errors << "#{path}: invalid servings: #{servings.inspect} (must be a positive integer when present)"
      end

      Array(data["recipeIngredient"]).each_with_index do |section, si|
        next unless section.is_a?(Hash)
        Array(section["items"]).each_with_index do |item, ii|
          next unless item.is_a?(Hash)
          uf = item["uses_fraction"]
          if !uf.nil? && !(uf.is_a?(Numeric) && uf > 0)
            errors << "#{path}: ingredient #{si}/#{ii} has invalid uses_fraction: #{uf.inspect} (must be a positive number)"
          end
          # Catch raw HTML in `item:` text — sub-recipe links must use the
          # markdown form `[label](slug.html)` so the renderer and aggregator
          # both recognise them. An unrecognised <a> falls through and gets
          # displayed verbatim on the plan page.
          item_text = item["item"]
          if item_text.is_a?(String) && item_text =~ /<[a-z][^>]*>/i
            errors << "#{path}: ingredient #{si}/#{ii} `item` contains raw HTML; use markdown link `[label](slug.html)` instead"
          end

          # The OPTIONAL pill only renders from the `optional: true` schema
          # field. Embedding the word "optional" in item text (e.g.
          # "kaffir lime leaves (optional)") leaves the cook with no pill
          # and a noisier label — flag it so it gets moved to the field.
          if item_text.is_a?(String) && item_text =~ /\boptional\b/i
            errors << "#{path}: ingredient #{si}/#{ii} `item` contains the word \"optional\"; remove it from the text and set `optional: true` on the item instead"
          end
        end
      end

      diets = Array(data["suitableForDiet"])
      bad_diets = diets - recipe_allowed_diets
      unless bad_diets.empty?
        errors << "#{path}: invalid suitableForDiet value(s): #{bad_diets.join(", ")} (allowed: #{recipe_allowed_diets.join(", ")})"
      end
    end
  ensure
    FileUtils.remove_entry(staging) if Dir.exist?(staging)
  end

  if errors.any?
    warn errors.join("\n")
    abort("Recipe validation failed (#{errors.size} issue#{errors.size == 1 ? "" : "s"} across #{paths.size} file#{paths.size == 1 ? "" : "s"})")
  end

  puts "Validated #{paths.size} recipe#{paths.size == 1 ? "" : "s"} — all good."
end
