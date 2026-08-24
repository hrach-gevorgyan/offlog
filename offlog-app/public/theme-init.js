(function () {
  var m = localStorage.getItem('theme_mode');
  if (!m) m = localStorage.getItem('dark') ? 'dark' : 'system';
  var dark = m === 'dark' || (m === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.body.classList.add('dark');
  // Pre-paint so mobile browser chrome never flashes the wrong colour;
  // applyTheme() keeps it in step from then on. Must match
  // --statusbar-fill's two values in app.css.
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#101218' : '#fbfbfc');
  if (localStorage.getItem('high_contrast')) document.body.classList.add('high-contrast');
})();
