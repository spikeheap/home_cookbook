import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupSearch, safeExcerpt, escapeHtml } from "./search.js";

// Hand-rolled fakes for the small DOM surface the search UI touches.

function makeInput() {
  const listeners = {};
  return {
    listeners,
    value: "",
    attrs: {},
    addEventListener(type, fn) { listeners[type] = fn; },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    getAttribute(k) { return this.attrs[k]; },
    type(query) {
      this.value = query;
      return this.listeners.input({ target: { value: query } });
    },
    keydown(key) {
      let prevented = false;
      this.listeners.keydown({ key, preventDefault: () => { prevented = true; } });
      return prevented;
    },
  };
}

function makeResultsEl() {
  return {
    innerHTML: "",
    hidden: true,
    items: [],
    contains() { return false; },
    querySelectorAll(_sel) {
      // Return the items currently rendered. Tests can mutate this directly.
      return this.items;
    },
  };
}

function makeResultItem(name, cuisine, url, excerpt = "") {
  return {
    data: async () => ({
      url,
      meta: { title: name, cuisine },
      excerpt,
    }),
  };
}

function makePagefind(results) {
  let optionsCalls = 0;
  let lastQuery   = null;
  return {
    options: async () => { optionsCalls++; },
    search:  async (q) => { lastQuery = q; return { results }; },
    get optionsCalls() { return optionsCalls; },
    get lastQuery()   { return lastQuery; },
  };
}

beforeEach(() => {
  delete globalThis.document;
});

test("returns null when input or resultsEl are missing", () => {
  const onlyInput = setupSearch({ input: makeInput(), resultsEl: null, loadPagefind: async () => null });
  const onlyResults = setupSearch({ input: null, resultsEl: makeResultsEl(), loadPagefind: async () => null });
  const neither = setupSearch();
  assert.strictEqual(onlyInput,   null);
  assert.strictEqual(onlyResults, null);
  assert.strictEqual(neither,     null);
});

test("empty query clears results and hides the dropdown", async () => {
  const input     = makeInput();
  const resultsEl = makeResultsEl();
  resultsEl.hidden = false;
  const handle = setupSearch({
    input, resultsEl,
    loadPagefind: async () => makePagefind([]),
  });

  await input.type("   ");

  assert.strictEqual(resultsEl.hidden, true);
  assert.strictEqual(input.attrs["aria-expanded"], "false");
  assert.deepStrictEqual(handle.getState().currentResults, []);
});

test("non-empty query loads pagefind, runs search, and renders results", async () => {
  const input     = makeInput();
  const resultsEl = makeResultsEl();
  const pf = makePagefind([
    makeResultItem("Saag paneer",      "Indian",   "/recipes/saag_paneer.html"),
    makeResultItem("Chicken curry",    "Indian",   "/recipes/chicken_curry.html"),
  ]);
  const handle = setupSearch({ input, resultsEl, loadPagefind: async () => pf });

  await input.type("indian");

  assert.strictEqual(pf.lastQuery, "indian");
  assert.strictEqual(pf.optionsCalls, 1);
  assert.strictEqual(resultsEl.hidden, false);
  assert.match(resultsEl.innerHTML, /Saag paneer/);
  assert.match(resultsEl.innerHTML, /Chicken curry/);
  assert.match(resultsEl.innerHTML, /search-result-0/);
  assert.strictEqual(handle.getState().currentResults.length, 2);
});

test("zero matches renders the empty state", async () => {
  const input     = makeInput();
  const resultsEl = makeResultsEl();
  const handle = setupSearch({
    input, resultsEl,
    loadPagefind: async () => makePagefind([]),
  });

  await input.type("xyz");

  assert.match(resultsEl.innerHTML, /No matches/);
  assert.strictEqual(resultsEl.hidden, false);
  assert.deepStrictEqual(handle.getState().currentResults, []);
});

test("pagefind is loaded once across consecutive searches", async () => {
  const input     = makeInput();
  const resultsEl = makeResultsEl();
  let loadCalls = 0;
  const pf = makePagefind([makeResultItem("X", "Y", "/x")]);

  setupSearch({
    input, resultsEl,
    loadPagefind: async () => { loadCalls++; return pf; },
  });

  await input.type("a");
  await input.type("ab");
  await input.type("abc");

  assert.strictEqual(loadCalls, 1, "pagefind module should be cached after first load");
});

test("loading failure is swallowed and search becomes a no-op", async () => {
  const input     = makeInput();
  const resultsEl = makeResultsEl();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const handle = setupSearch({
      input, resultsEl,
      loadPagefind: async () => { throw new Error("network down"); },
    });
    await input.type("query");
    assert.strictEqual(resultsEl.innerHTML, "", "no results rendered on load failure");
    assert.strictEqual(handle.getState().pagefindLoaded, false);
  } finally {
    console.warn = originalWarn;
  }
});

test("ArrowDown / ArrowUp move the active index, Enter navigates", async () => {
  const input     = makeInput();
  const resultsEl = makeResultsEl();
  const navUrls   = [];
  const pf = makePagefind([
    makeResultItem("A", "X", "/a"),
    makeResultItem("B", "X", "/b"),
    makeResultItem("C", "X", "/c"),
  ]);

  const handle = setupSearch({
    input, resultsEl,
    loadPagefind: async () => pf,
    navigate:     (url) => navUrls.push(url),
  });

  await input.type("x");

  // Stub the rendered items so highlight() can find them
  resultsEl.items = [
    { setAttribute: () => {}, scrollIntoView: () => {} },
    { setAttribute: () => {}, scrollIntoView: () => {} },
    { setAttribute: () => {}, scrollIntoView: () => {} },
  ];

  input.keydown("ArrowDown"); // -> 0
  assert.strictEqual(handle.getState().activeIndex, 0);
  input.keydown("ArrowDown"); // -> 1
  assert.strictEqual(handle.getState().activeIndex, 1);
  input.keydown("ArrowDown"); // -> 2 (capped)
  input.keydown("ArrowDown"); // stays at 2
  assert.strictEqual(handle.getState().activeIndex, 2);
  input.keydown("ArrowUp");   // -> 1
  assert.strictEqual(handle.getState().activeIndex, 1);

  input.keydown("Enter");
  assert.deepStrictEqual(navUrls, ["/b"]);
});

test("Escape clears the input and dismisses the dropdown", async () => {
  const input     = makeInput();
  const resultsEl = makeResultsEl();
  const pf = makePagefind([makeResultItem("A", "X", "/a")]);

  setupSearch({ input, resultsEl, loadPagefind: async () => pf });

  await input.type("a");
  assert.strictEqual(resultsEl.hidden, false);

  input.keydown("Escape");

  assert.strictEqual(input.value, "");
  assert.strictEqual(resultsEl.hidden, true);
});

// ---- Security: safeExcerpt ------------------------------------------------

test("safeExcerpt preserves <mark> highlights and escapes everything else", () => {
  // Pagefind's normal output: matched words wrapped in <mark>.
  const out = safeExcerpt("a <mark>chicken</mark> curry recipe");
  assert.equal(out, "a <mark>chicken</mark> curry recipe");
});

test("safeExcerpt neutralises raw <script> in the indexed corpus", () => {
  // Simulates a recipe Markdown file that smuggled raw HTML (Kramdown
  // allows it — see audit M2) which ended up in Pagefind's excerpt.
  const dirty = `before <script>alert(1)</script> after`;
  const out   = safeExcerpt(dirty);
  assert.equal(
    out,
    "before &lt;script&gt;alert(1)&lt;/script&gt; after",
    "script tags must be entity-escaped, not executed when parsed as HTML"
  );
});

test("safeExcerpt neutralises <img onerror=…> in the corpus", () => {
  const dirty = `<img src=x onerror="navigator.clipboard.writeText('pwned')">`;
  const out   = safeExcerpt(dirty);
  assert.match(out, /^&lt;img/);
  // No parsable tags should remain — both `<` and `>` must be entity-escaped
  // so a browser parser never sees an `<img …>` element.
  assert.doesNotMatch(out, /<img/);
  assert.doesNotMatch(out, /<\/?[a-z]/i,
    "no live HTML tags should survive — every `<` must be entity-escaped");
});

test("safeExcerpt escapes <mark> with attributes — only the bare tag is restored", () => {
  // Pagefind never emits attributed <mark>, so any attribute on a mark
  // tag in the input is treated as untrusted and escaped wholesale.
  const dirty = `<mark style="background:red">x</mark>`;
  const out   = safeExcerpt(dirty);
  assert.doesNotMatch(out, /<mark style/);
  assert.match(out, /&lt;mark style=/);
  assert.match(out, /<\/mark>/, "the closing tag is the unattributed form and is preserved");
});

test("safeExcerpt handles null / undefined / non-string input safely", () => {
  assert.equal(safeExcerpt(null),       "");
  assert.equal(safeExcerpt(undefined),  "");
  assert.equal(safeExcerpt(42),         "42");
});

test("escapeHtml escapes all five special characters", () => {
  assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#039;");
});

test("Enter without an active index does not navigate", async () => {
  const input     = makeInput();
  const resultsEl = makeResultsEl();
  const navUrls   = [];
  const pf = makePagefind([makeResultItem("A", "X", "/a")]);

  setupSearch({
    input, resultsEl,
    loadPagefind: async () => pf,
    navigate:     (url) => navUrls.push(url),
  });

  await input.type("x");

  input.keydown("Enter");

  assert.deepStrictEqual(navUrls, []);
});
