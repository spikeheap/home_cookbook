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
RECIPE_ALLOWED_MEALS = %w[Main Lunch Breakfast Side Snack Sweet Drink Condiment].freeze
RECIPE_ALLOWED_EFFORTS = %w[weeknight weekend project].freeze
RECIPE_ALLOWED_DIETS = %w[
  http://schema.org/GlutenFreeDiet
  http://schema.org/LowCalorieDiet
  http://schema.org/LowFatDiet
  http://schema.org/LowLactoseDiet
  http://schema.org/LowSaltDiet
  http://schema.org/VeganDiet
  http://schema.org/VegetarianDiet
].freeze

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
    meal: [Main]              # one or more of: #{RECIPE_ALLOWED_MEALS.join(", ")}
    effort:                   # #{RECIPE_ALLOWED_EFFORTS.join(" | ")}
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
      bad_meals = meal - RECIPE_ALLOWED_MEALS
      unless bad_meals.empty?
        errors << "#{path}: invalid meal value(s): #{bad_meals.join(", ")} (allowed: #{RECIPE_ALLOWED_MEALS.join(", ")})"
      end

      effort = data["effort"]
      if effort && !RECIPE_ALLOWED_EFFORTS.include?(effort)
        errors << "#{path}: invalid effort: #{effort.inspect} (allowed: #{RECIPE_ALLOWED_EFFORTS.join(", ")})"
      end

      servings = data["servings"]
      if !servings.nil? && !(servings.is_a?(Integer) && servings.positive?)
        errors << "#{path}: invalid servings: #{servings.inspect} (must be a positive integer when present)"
      end

      diets = Array(data["suitableForDiet"])
      bad_diets = diets - RECIPE_ALLOWED_DIETS
      unless bad_diets.empty?
        errors << "#{path}: invalid suitableForDiet value(s): #{bad_diets.join(", ")} (allowed: #{RECIPE_ALLOWED_DIETS.join(", ")})"
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
