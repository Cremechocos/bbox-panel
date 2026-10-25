// Apparence appliquée AVANT le premier affichage (aucun flash de mauvais thème) + préchargement de la police utile.
(function () {
  var DEF = { clair: 'light', geist: 'dark' };
  var PAPER = { clair: ['#eef2f5', '#0b1620'], geist: ['#ffffff', '#08090a'] };
  var FONTS = { clair: ['/fonts/BouyguesRead-Regular.woff2', '/fonts/BouyguesRead-Semibold.woff2'], geist: ['/fonts/Geist-Variable.woff2'] };
  var q = new URLSearchParams(location.search);
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var skin = q.get('skin') || get('skin') || 'clair';
  if (!DEF[skin]) skin = 'clair';
  var pref = q.get('theme') || get('theme.' + skin) || DEF[skin];
  var dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  var d = document.documentElement;
  d.setAttribute('data-skin', skin);
  d.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (q.get('preview')) d.setAttribute('data-preview', '1');
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', PAPER[skin][dark ? 1 : 0]);
  FONTS[skin].forEach(function (href) {
    var l = document.createElement('link');
    l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.href = href; l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  });
})();
