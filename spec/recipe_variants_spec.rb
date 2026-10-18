require_relative "../plugins/recipe_variants"

RSpec.describe RecipeVariants do
  let(:main) do
    {
      "name"        => "Chicken souvlaki",
      "cuisine"     => "Greek",
      "effort"      => "weekend",
      "status"      => "favourite",
      "date"        => "2026-10-17",
      "tags"        => ["chicken"],
      "recipeIngredient" => [
        {
          "heading" => "Marinade",
          "key"     => "marinade",
          "items"   => [
            { "key" => "protein", "quantity" => 12, "item" => "chicken thighs" },
            { "quantity" => 2, "unit" => "tsp", "item" => "dried oregano" },
          ],
        },
        {
          "heading" => "To serve",
          "items"   => [
            { "item" => "4 [pitta breads](pitta_wraps.html)" },
            { "key" => "skewers", "quantity" => 4, "item" => "metal skewers" },
          ],
        },
      ],
      "recipeInstructions" => [
        {
          "items" => [
            { "key" => "marinate", "text" => "Marinate the chicken." },
            "Make the pittas.",
            { "key" => "cook", "text" => "Grill the chicken." },
          ],
        },
      ],
    }
  end

  describe ".normalise" do
    it "strips keys and turns keyed steps back into strings" do
      out = described_class.normalise(main)

      expect(out["recipeIngredient"][0]).not_to have_key("key")
      expect(out["recipeIngredient"][0]["items"][0]).to eq("quantity" => 12, "item" => "chicken thighs")
      expect(out["recipeInstructions"][0]["items"]).to eq(["Marinate the chicken.", "Make the pittas.", "Grill the chicken."])
    end

    it "does not mutate its input" do
      described_class.normalise(main)
      expect(main["recipeIngredient"][0]["items"][0]).to have_key("key")
    end

    it "copes with missing ingredient and instruction lists" do
      expect(described_class.normalise("name" => "Placeholder")).to eq("name" => "Placeholder")
    end
  end

  describe ".keys" do
    it "lists keys on sections, items and steps in document order" do
      expect(described_class.keys(main)).to eq(%w[marinade protein skewers marinate cook])
    end
  end

  describe ".key_errors" do
    it "is empty for unique keys" do
      expect(described_class.key_errors(main)).to be_empty
    end

    it "reports a duplicated key" do
      main["recipeInstructions"][0]["items"] << { "key" => "protein", "text" => "Oops." }
      expect(described_class.key_errors(main)).to eq(["duplicate key `protein`"])
    end

    it "reports a keyed step with no text" do
      main["recipeInstructions"][0]["items"] << { "key" => "rest" }
      expect(described_class.key_errors(main)).to eq(["step `rest` has no text"])
    end
  end

  describe ".merge" do
    let(:variant) do
      {
        "name"       => "Chickpea souvlaki",
        "variant_of" => "souvlaki",
        "date"       => "2026-10-18",
        "tags"       => ["vegetarian"],
        "swap"       => {
          "protein"  => [{ "quantity" => 2, "item" => "x 400g tins chickpeas" }],
          "skewers"  => [],
          "marinate" => "Toss the chickpeas in the marinade.",
          "cook"     => "Roast the chickpeas.",
        },
      }
    end

    subject(:merged) { described_class.merge(main, variant) }

    it "overrides top-level fields with the variant's" do
      expect(merged["name"]).to eq("Chickpea souvlaki")
      expect(merged["tags"]).to eq(["vegetarian"])
      expect(merged["variant_of"]).to eq("souvlaki")
    end

    it "inherits fields the variant leaves out" do
      expect(merged["cuisine"]).to eq("Greek")
      expect(merged["effort"]).to eq("weekend")
    end

    it "does not inherit the main recipe's status" do
      expect(merged).not_to have_key("status")
    end

    it "drops the swap block" do
      expect(merged).not_to have_key("swap")
    end

    it "replaces a keyed ingredient line" do
      expect(merged["recipeIngredient"][0]["items"]).to eq([
        { "quantity" => 2, "item" => "x 400g tins chickpeas" },
        { "quantity" => 2, "unit" => "tsp", "item" => "dried oregano" },
      ])
    end

    it "removes a line swapped for an empty list" do
      expect(merged["recipeIngredient"][1]["items"]).to eq([{ "item" => "4 [pitta breads](pitta_wraps.html)" }])
    end

    it "replaces one line with several" do
      variant["swap"]["protein"] = [{ "item" => "chickpeas" }, { "item" => "halloumi" }]
      expect(merged["recipeIngredient"][0]["items"].map { |i| i["item"] }).to eq(["chickpeas", "halloumi", "dried oregano"])
    end

    it "replaces step text with a string" do
      expect(merged["recipeInstructions"][0]["items"]).to eq([
        "Toss the chickpeas in the marinade.",
        "Make the pittas.",
        "Roast the chickpeas.",
      ])
    end

    it "removes a step swapped for an empty list" do
      variant["swap"]["marinate"] = []
      expect(merged["recipeInstructions"][0]["items"]).to eq(["Make the pittas.", "Roast the chickpeas."])
    end

    it "replaces a keyed section" do
      variant["swap"] = { "marinade" => [{ "heading" => "Falafel", "items" => [{ "item" => "12 [falafel](falafel.html)" }] }] }
      expect(merged["recipeIngredient"].map { |s| s["heading"] }).to eq(["Falafel", "To serve"])
    end

    it "removes a section swapped for an empty list" do
      variant["swap"] = { "marinade" => [] }
      expect(merged["recipeIngredient"].map { |s| s["heading"] }).to eq(["To serve"])
    end

    it "leaves unswapped keyed nodes as they are, without keys" do
      variant["swap"] = {}
      expect(merged["recipeIngredient"][0]["items"][0]).to eq("quantity" => 12, "item" => "chicken thighs")
      expect(merged["recipeInstructions"][0]["items"][2]).to eq("Grill the chicken.")
    end

    it "does not mutate either input" do
      merged
      expect(main["recipeIngredient"][0]["items"][0]["item"]).to eq("chicken thighs")
      expect(variant).to have_key("swap")
    end

    it "raises for a key the main recipe doesn't have" do
      variant["swap"]["sauce"] = []
      expect { merged }.to raise_error(RecipeVariants::UnknownKey, "swap key `sauce` not found in main recipe")
    end

    it "raises when a step is swapped for something other than a string or list" do
      variant["swap"]["cook"] = 42
      expect { merged }.to raise_error(ArgumentError, /swap `cook`/)
    end
  end
end
