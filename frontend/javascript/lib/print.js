// Force sub-recipe <details> open during printing so their content
// (specifically the inline ingredients) appears on the printout regardless
// of whether the cook expanded them on screen. State is restored afterward.

export function setupPrintExpansion(root, selector = "details.sub-recipe") {
  if (!root) return null;

  const expand = () => {
    root.querySelectorAll(selector).forEach((d) => {
      d.dataset.wasOpen = d.open ? "true" : "false";
      d.open = true;
    });
  };

  const restore = () => {
    root.querySelectorAll(selector).forEach((d) => {
      if (d.dataset.wasOpen === "false") d.open = false;
      delete d.dataset.wasOpen;
    });
  };

  window.addEventListener("beforeprint", expand);
  window.addEventListener("afterprint", restore);

  return { expand, restore };
}
