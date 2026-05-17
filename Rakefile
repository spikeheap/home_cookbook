require "bridgetown"

Bridgetown.load_tasks

# Run rake without specifying any command to execute a deploy build by default.
task default: :deploy

#
# Standard set of tasks, which you can customize if you wish:
#
desc "Build the Bridgetown site for deployment"
task :deploy => [:clean, "frontend:build"] do
  Bridgetown::Commands::Build.start
end

desc "Build the site in a test environment"
task :test do
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
    cuisine:
    meal: [Main]
    effort: weeknight
    tags: []
    description:
    prepTime: PT0M
    cookTime: PT0M
    recipeYield:
    isBasedOn: <URL>
    author:
      "@type": Person
      name: <NAME>
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
