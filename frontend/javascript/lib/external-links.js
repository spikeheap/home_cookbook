// Open offsite links in a new tab. Recipe notes are authored in markdown,
// so any link in the body (or the "Based on" credit) can point anywhere;
// rather than annotate each one we retarget every cross-origin http(s)
// anchor here. Same-origin links are left alone so in-site navigation
// stays in the current tab. rel="noopener noreferrer" guards the new tab
// from reaching back via window.opener and strips the referrer.
export function setupExternalLinks(scope = document) {
  const { origin } = window.location;
  scope.querySelectorAll('a[href]').forEach((a) => {
    if (a.target) return;                       // already targeted (e.g. server-set)
    const href = a.getAttribute("href");
    if (!/^https?:\/\//i.test(href)) return;    // relative / mailto / anchor — in-site
    if (a.href.startsWith(origin + "/") || a.href === origin) return; // same origin
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
}
