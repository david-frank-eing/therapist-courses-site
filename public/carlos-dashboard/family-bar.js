// The family bar (17/11/2026). Mirror of src/components/ProductSwitcher.tsx. Put <body data-product="rem|fin"> and
// <script src="family-bar.js" defer> in a page and the strip appears at the top. Links depend on where it runs:
// the local copy (localhost:8090) or the site copy (/carlos-dashboard/).
(function () {
  if (document.getElementById('family-bar')) return;
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var SITE = 'https://stupendous-lily-f8cd84.netlify.app';
  var L = local ? { site: SITE + '/home', rem: '/', fin: '/finance.html', logo: 'logo-hakol.png' }
                : { site: '/home', rem: '/carlos-dashboard/', fin: '/carlos-dashboard/#finance', logo: '/logo.png' };
  var cur = document.body.getAttribute('data-product') || 'rem';
  var tabs = [['site', 'מרחב למטפלים'], ['rem', 'תזכורות'], ['fin', 'כספים']].map(function (t) {
    return '<a data-p="' + t[0] + '" href="' + L[t[0]] + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
  }).join('');
  var bar = document.createElement('div');
  bar.id = 'family-bar'; bar.className = 'fam';
  bar.innerHTML = '<a class="fam-brand" href="' + L.site + '" aria-label="הכול בידיים, למרחב למטפלים"><span class="fam-logo"><img src="' + L.logo +
    '" alt=""></span><span class="fam-brand-name">הכול בידיים</span></a><nav class="fam-tabs" aria-label="המוצרים של הכול בידיים">' + tabs + '</nav>';
  document.body.insertBefore(bar, document.body.firstChild);
  // On the site copy the reminders page IS /carlos-dashboard/, so a link to /carlos-dashboard/#finance only changes the hash
  // and nothing happens (the #finance hash is read once, at load). From the reminders page, open finance the way its own
  // button does (openFinance: the full screen on the admin's PC, the cloud view on a phone). From any other page the link works.
  if (!local) {
    bar.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-p="fin"]');
      if (a && typeof window.openFinance === 'function') { e.preventDefault(); window.openFinance(); }
    });
  }
})();
