// Loaded in <head> so the page never flashes the wrong theme.
(function () {
  var root = document.documentElement;
  var query = matchMedia('(prefers-color-scheme: dark)');
  function stored() {
    try {
      return localStorage.getItem('theme');
    } catch (e) {
      return null;
    }
  }
  function apply() {
    var choice = stored();
    root.dataset.theme = choice === 'light' || choice === 'dark' ? choice : query.matches ? 'dark' : 'light';
  }
  apply();
  query.addEventListener('change', apply);

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    function label() {
      button.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
    label();
    button.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', next);
      } catch (e) {}
      apply();
      label();
    });
  });
})();
