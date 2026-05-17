// Homepage search powered by Pagefind, with a custom UI.
// Pagefind is loaded lazily on first input — keeps the homepage fast for
// people who never use search.

export function setupSearch({
  input,
  resultsEl,
  loadPagefind = () => import("/pagefind/pagefind.js"),
  navigate    = (url) => { window.location.href = url; },
} = {}) {
  if (!input || !resultsEl) return null;

  let pagefind        = null;
  let activeIndex     = -1;
  let currentResults  = [];

  async function getPagefind() {
    if (pagefind) return pagefind;
    try {
      pagefind = await loadPagefind();
      if (pagefind && typeof pagefind.options === "function") {
        await pagefind.options({ baseUrl: "/" });
      }
      return pagefind;
    } catch (err) {
      console.warn("Pagefind failed to load:", err);
      pagefind = null;
      return null;
    }
  }

  function setOpen(open) {
    resultsEl.hidden = !open;
    input.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function clearResults() {
    resultsEl.innerHTML = "";
    currentResults = [];
    activeIndex    = -1;
    setOpen(false);
    input.removeAttribute("aria-activedescendant");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function render(results) {
    if (results.length === 0) {
      resultsEl.innerHTML = `<div class="search-results__empty">No matches.</div>`;
      currentResults = [];
      activeIndex    = -1;
      setOpen(true);
      return;
    }
    currentResults = results;
    resultsEl.innerHTML = results.map((r, i) => {
      const cuisine = r?.meta?.cuisine || "";
      const excerpt = r?.excerpt || "";
      return `<a class="search-result" role="option" data-index="${i}" id="search-result-${i}" href="${escapeHtml(r.url)}">
        <span class="search-result__name">${escapeHtml(r?.meta?.title || r.url)}</span>
        ${cuisine ? `<span class="search-result__meta">${escapeHtml(cuisine)}</span>` : ""}
        ${excerpt ? `<span class="search-result__excerpt">${excerpt}</span>` : ""}
      </a>`;
    }).join("");
    activeIndex = -1;
    setOpen(true);
  }

  async function runSearch(query) {
    const trimmed = (query || "").trim();
    if (!trimmed) {
      clearResults();
      return;
    }
    const pf = await getPagefind();
    if (!pf) return;
    const search = await pf.search(trimmed);
    const slice  = (search?.results || []).slice(0, 8);
    const data   = await Promise.all(slice.map(r => r.data()));
    render(data);
  }

  function highlight(index) {
    const items = resultsEl.querySelectorAll(".search-result");
    items.forEach((el, i) => el.setAttribute("aria-selected", i === index ? "true" : "false"));
    if (index >= 0 && items[index]) {
      input.setAttribute("aria-activedescendant", `search-result-${index}`);
      if (typeof items[index].scrollIntoView === "function") {
        items[index].scrollIntoView({ block: "nearest" });
      }
    } else {
      input.removeAttribute("aria-activedescendant");
    }
    activeIndex = index;
  }

  input.addEventListener("input", (e) => runSearch(e.target.value));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      input.value = "";
      clearResults();
      return;
    }
    if (resultsEl.hidden || currentResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight(Math.min(activeIndex + 1, currentResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const r = currentResults[activeIndex];
      if (r?.url) navigate(r.url);
    }
  });

  input.addEventListener("focus", () => {
    if (currentResults.length > 0) setOpen(true);
  });

  if (typeof document !== "undefined") {
    document.addEventListener("click", (e) => {
      if (!resultsEl.contains(e.target) && e.target !== input) setOpen(false);
    });
  }

  return {
    runSearch,
    clearResults,
    getState: () => ({ activeIndex, currentResults, pagefindLoaded: !!pagefind }),
  };
}
