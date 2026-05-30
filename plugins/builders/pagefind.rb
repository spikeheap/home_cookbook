module Builders
  # Run pagefind after every site write so the search index is in sync with
  # the rendered HTML — including dev rebuilds. The same hook covers prod
  # (the explicit `pagefind --site output` was dropped from `npm run build`
  # once this hook landed).
  #
  # Set BRIDGETOWN_ENV=test or SKIP_PAGEFIND=1 to skip indexing (the test
  # build doesn't need a search index and the indexer adds ~1s to the loop).
  class Pagefind < SiteBuilder
    def build
      hook :site, :post_write do
        next if ENV["BRIDGETOWN_ENV"] == "test"
        next if ENV["SKIP_PAGEFIND"] == "1"

        Bundler.with_unbundled_env do
          system("npx", "pagefind", "--site", site.config.destination, "--silent")
        end
      end
    end
  end
end
