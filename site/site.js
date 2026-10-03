// Two small touches; the page reads fine without them.
// A hairline under the nav once the page scrolls.
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Sections ease in as they enter the viewport.
const items = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
} else {
  items.forEach(el => el.classList.add('in'));
}
