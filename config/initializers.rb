Bridgetown.configure do |config|
  url "https://cook.thebrooks.house"
  template_engine "erb"

  include ["_headers", "_redirects"]

  collections do
    recipes do
      output true
      permalink "/:collection/:path.*"
      sort_direction "descending"
    end
  end

  defaults [
    {
      "scope" => { "path" => "", "type" => "recipes" },
      "values" => { "layout" => "recipe" },
    },
  ]

  feed do
    path "/feed/posts.xml" # shunt the unused default posts feed out of the way
    collections do
      recipes do
        path "/feed.xml"
      end
    end
  end

  init :"bridgetown-feed"
end
