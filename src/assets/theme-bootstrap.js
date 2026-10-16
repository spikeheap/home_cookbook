// Runs in <head> before first paint to apply the stored theme so it
// doesn't flash the wrong state. Loaded synchronously from
// /assets/theme-bootstrap.js so it works under a strict
// `script-src 'self'` CSP without needing inline hashes or nonces (which
// break the moment Netlify's HTML minification touches the inline bytes).
//
// Static file — bypasses esbuild — so the URL is stable and cacheable.
(function () {
  // Marks JS as available so progressive-enhancement CSS (e.g. the mobile
  // ingredients bottom-sheet) only kicks in when JS can actually drive it.
  document.documentElement.classList.add("js");
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") {
      document.documentElement.style.colorScheme = t;
    }
  } catch (e) {}
})();
