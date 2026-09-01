/* ============================================================
   SHAX STORE — Theme controller (Dark / Light)
   Loaded synchronously in <head> so the saved/system theme is
   applied before first paint (avoids a light-flash for dark users).
   Persists to localStorage. No backend involvement.
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'shax_theme';
  var LIGHT = 'light';
  var DARK = 'dark';

  function storedTheme() {
    try {
      var t = localStorage.getItem(STORAGE_KEY);
      return (t === LIGHT || t === DARK) ? t : null;
    } catch (e) { return null; }
  }

  function systemTheme() {
    try {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
        ? LIGHT : DARK;
    } catch (e) { return DARK; }
  }

  function resolvedTheme() {
    return storedTheme() || systemTheme();
  }

  function apply(theme) {
    var root = document.documentElement;
    root.setAttribute('data-theme', theme === LIGHT ? LIGHT : DARK);
    root.style.colorScheme = theme === LIGHT ? 'light' : 'dark';
  }

  // Synchronous init: runs during <head> parse, before the body paints.
  apply(resolvedTheme());

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === LIGHT ? LIGHT : DARK;
  }

  function renderIcons(theme) {
    // Show the icon of the theme you will switch TO.
    // Dark mode -> sun (go light); Light mode -> moon (go dark).
    var t = theme || currentTheme();
    var icon = (t === LIGHT) ? 'fa-moon' : 'fa-sun';
    var icons = document.querySelectorAll('.theme-toggle i');
    for (var j = 0; j < icons.length; j++) {
      icons[j].className = 'fas ' + icon;
      var btn = icons[j].closest('.theme-toggle');
      if (btn) btn.setAttribute('aria-pressed', t === LIGHT ? 'false' : 'true');
    }
  }

  function setTheme(theme) {
    var t = (theme === LIGHT) ? LIGHT : DARK;
    try { localStorage.setItem(STORAGE_KEY, t); } catch (e) { /* ignore */ }
    apply(t);
    renderIcons(t);
  }

  function toggleTheme() {
    setTheme(currentTheme() === LIGHT ? DARK : LIGHT);
  }

  window.shaxTheme = {
    get: currentTheme,
    set: setTheme,
    toggle: toggleTheme,
    renderIcons: renderIcons
  };
  // Convenience globals for inline onclick handlers
  window.toggleTheme = toggleTheme;
  window.setTheme = setTheme;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { renderIcons(); });
  } else {
    renderIcons();
  }
})();
