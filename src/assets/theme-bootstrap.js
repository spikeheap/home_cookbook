// Runs in <head> before first paint to apply the stored theme and plan-mode
// flag so neither flashes the wrong state. Loaded synchronously from
// /assets/theme-bootstrap.js so it works under a strict
// `script-src 'self'` CSP without needing inline hashes or nonces (which
// break the moment Netlify's HTML minification touches the inline bytes).
//
// Static file — bypasses esbuild — so the URL is stable and cacheable.
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") {
      document.documentElement.style.colorScheme = t;
    }
    if (localStorage.getItem("cookbook.planMode") === "on") {
      document.documentElement.classList.add("plan-mode");
    }
  } catch (e) {}
})();
