const STATES = ["auto", "light", "dark"];
const LABEL = { auto: "auto", light: "light", dark: "dark" };

export function setupTheme({
  root = document.documentElement,
  btn,
  meta = document.querySelector('meta[name="theme-color"]'),
} = {}) {
  if (!btn) return null;

  const srLabel = btn.querySelector(".theme-toggle__sr");

  function read() {
    try {
      const t = localStorage.getItem("theme");
      return t === "light" || t === "dark" ? t : "auto";
    } catch {
      return "auto";
    }
  }

  function write(t) {
    try {
      if (t === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
  }

  function syncThemeColor() {
    if (!meta) return;
    const cream = getComputedStyle(root).getPropertyValue("--cream").trim();
    if (cream) meta.setAttribute("content", cream);
  }

  function apply(t) {
    root.style.colorScheme = t === "auto" ? "" : t;
    if (srLabel) srLabel.textContent = `Theme: ${LABEL[t]}`;
    btn.dataset.theme = t;
    btn.setAttribute("aria-label", `Theme: ${LABEL[t]}`);
    syncThemeColor();
  }

  btn.addEventListener("click", () => {
    const next = STATES[(STATES.indexOf(read()) + 1) % STATES.length];
    write(next);
    apply(next);
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (read() === "auto") syncThemeColor();
  });

  apply(read());

  return { apply, getState: read };
}
