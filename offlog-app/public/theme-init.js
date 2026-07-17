(function () {
  var m = localStorage.getItem('theme_mode');
  if (!m) m = localStorage.getItem('dark') ? 'dark' : 'system';
  var dark = m === 'dark' || (m === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.body.classList.add('dark');
  if (localStorage.getItem('high_contrast')) document.body.classList.add('high-contrast');
})();
