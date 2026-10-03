// Runs synchronously before first paint so pages never flash the wrong theme.
// Settings live in chrome.storage (async), so the last applied values are
// mirrored to localStorage by src/lib/theme.ts.
(function () {
  try {
    var theme = localStorage.getItem('bh-theme') || 'system';
    var accent = localStorage.getItem('bh-accent') || 'violet';
    var dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.accent = accent;
  } catch (e) {}
})();
