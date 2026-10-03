// The page reads completely without this file. It adds the moving parts:
// the hero phone demo, the view tabs, the playable "Today's three", the
// scroll-linked phone, the printing receipt and the entrance lifts.
document.documentElement.classList.add('js');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const onSight = (els, fn, margin = '0px 0px -12% 0px') => {
  if (!('IntersectionObserver' in window)) { els.forEach(fn); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); } }), { rootMargin: margin });
  els.forEach(el => io.observe(el));
};

// Nav hairline once the page scrolls.
const nav = $('.nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// Entrances: only elements still below the fold wait; they stay readable.
const lifts = $$('.lift').filter(el => el.getBoundingClientRect().top > innerHeight);
lifts.forEach(el => el.classList.add('wait'));
onSight(lifts, el => el.classList.remove('wait'), '0px 0px -6% 0px');

// ── Hero demo: type a task, recognise its parts, drop it into the list ──
(() => {
  const field = $('#d-field'), chips = $('#d-chips'), sheet = $('#d-sheet'), list = $('#d-list');
  const left = $('#d-left'), fab = $('#d-fab'), send = $('#d-send');
  if (!field) return;
  const ring = '<span class="ring"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><path d="m5 12 5 5 9-10"/></svg></span>';
  // The words quick add recognises, and the chip each becomes.
  const parts = [
    { text: 'Call plumber ' },
    { text: 'tomorrow', tok: true, chip: 'Tomorrow' },
    { text: ' ' },
    { text: '5pm', tok: true, chip: '17:00' },
    { text: ' ' },
    { text: '!high', tok: true, chip: 'High' },
  ];
  const draw = upto => {
    let n = upto, html = '';
    for (const p of parts) {
      if (n <= 0) break;
      const t = p.text.slice(0, n); n -= p.text.length;
      const whole = t.length === p.text.length;
      html += p.tok && whole ? `<span class="tok">${t}</span>` : t.replace(/ /g, '&nbsp;');
    }
    field.innerHTML = html + '<span class="caret"></span>';
  };
  const total = parts.reduce((a, p) => a + p.text.length, 0);
  const final = () => {
    sheet.classList.remove('open');
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `${ring}<span class="t">Call plumber</span><span class="pill hi">Tomorrow 17:00</span>`;
    list.prepend(row);
    list.lastElementChild.remove();
    list.children[1].classList.add('done');
  };
  if (still) { final(); return; }
  const start = list.innerHTML;
  async function loop() {
    for (;;) {
      list.innerHTML = start; left.textContent = '4'; chips.innerHTML = ''; draw(0);
      await wait(1400);
      fab.classList.add('press'); await wait(160); fab.classList.remove('press');
      sheet.classList.add('open'); await wait(600);
      let shown = 0;
      for (let i = 1; i <= total; i++) {
        draw(i);
        let acc = 0;
        for (const p of parts) { acc += p.text.length; if (p.chip && acc === i) { shown++; chips.insertAdjacentHTML('beforeend', `<span class="chip">${p.chip}</span>`); } }
        await wait(i < 13 ? 70 : 95);
      }
      await wait(900);
      send.classList.add('press'); await wait(160); send.classList.remove('press');
      sheet.classList.remove('open'); await wait(380);
      const row = document.createElement('div');
      row.className = 'row new';
      row.innerHTML = `${ring}<span class="t">Call plumber</span><span class="pill hi">Tomorrow 17:00</span>`;
      list.prepend(row);
      list.lastElementChild.remove();
      await wait(1400);
      list.children[1].classList.add('done');
      left.textContent = '3';
      await wait(2600);
    }
  }
  // Starts once the phone is on screen, so it isn't half-way through when seen.
  onSight([$('.demo-stage')], () => loop(), '0px');
})();

// ── Three views: tabs that also advance on their own ──
(() => {
  const tabs = $$('.tabs [role="tab"]'), imgs = $$('.views-stack img'), cap = $('#views-cap'), panel = $('#views-panel');
  if (!tabs.length) return;
  const caps = [
    'Drag a task from one status to the next. Done is simply the last status.',
    'The same tasks as a table. Sort by anything, save the filters you use.',
    'The month, with every task on its day. Click a day to see the list.',
  ];
  let i = 0, timer = 0, auto = !still;
  const show = (n, user) => {
    i = n;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === n)); t.tabIndex = k === n ? 0 : -1; const b = $('.bar', t); b.classList.remove('run'); void b.offsetWidth; if (k === n && auto) b.classList.add('run'); });
    imgs.forEach((im, k) => im.classList.toggle('on', k === n));
    panel.setAttribute('aria-labelledby', tabs[n].id);
    cap.textContent = caps[n];
    if (user) { auto = false; clearTimeout(timer); tabs.forEach(t => $('.bar', t).classList.remove('run')); }
    else if (auto) { clearTimeout(timer); timer = setTimeout(() => show((i + 1) % tabs.length), 5000); }
  };
  tabs.forEach((t, k) => {
    t.addEventListener('click', () => show(k, true));
    t.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); const n = (i + d + tabs.length) % tabs.length; show(n, true); tabs[n].focus(); }
    });
  });
  onSight([panel], () => show(0), '0px');
})();

// ── Today's three, playable ──
(() => {
  const card = $('#today');
  if (!card) return;
  const picks = $$('.pick', card), bars = $$('.meter i', card), count = $('#today-count'), end = $('#today-end');
  const lines = ['', 'One down.', 'Two down. One to go.', "That's the day. Go outside."];
  const burst = from => {
    if (still) return;
    const r = from.getBoundingClientRect(), c = card.getBoundingClientRect();
    for (let k = 0; k < 14; k++) {
      const d = document.createElement('span');
      d.className = 'burst';
      const a = (k / 14) * Math.PI * 2, dist = 60 + (k % 3) * 26;
      d.style.left = `${r.left - c.left + r.width / 2 - 4}px`;
      d.style.top = `${r.top - c.top + r.height / 2 - 4}px`;
      d.style.setProperty('--dx', `${Math.cos(a) * dist}px`);
      d.style.setProperty('--dy', `${Math.sin(a) * dist}px`);
      card.appendChild(d);
      setTimeout(() => d.remove(), 950);
    }
  };
  picks.forEach(p => p.addEventListener('click', () => {
    const on = p.getAttribute('aria-pressed') !== 'true';
    p.setAttribute('aria-pressed', String(on));
    const n = picks.filter(x => x.getAttribute('aria-pressed') === 'true').length;
    bars.forEach((b, k) => b.classList.toggle('on', k < n));
    count.textContent = `${n} of 3 done`;
    end.textContent = lines[n];
    if (on) burst($('.ring', p));
  }));
})();

// ── Scroll story: the phone shows the screen for the step in view ──
(() => {
  const steps = $$('.story .step'), shots = $$('.story .frame img');
  if (!steps.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const n = Number(e.target.dataset.shot);
    steps.forEach(s => s.classList.toggle('on', s === e.target));
    shots.forEach((im, k) => im.classList.toggle('on', k === n));
  }), { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach(s => io.observe(s));
})();

// ── The receipt prints once it scrolls into view ──
(() => {
  const r = $('#receipt');
  if (!r || still) return;
  if (r.getBoundingClientRect().top < innerHeight) return;
  onSight([r], el => el.classList.add('print'), '0px 0px -20% 0px');
})();
