// The page reads completely without this file. It adds the moving parts:
// the hero phone demo, the view tabs, the playable "Today's three", the
// scroll-linked phone, the printing receipt and the entrance lifts.
const root = document.documentElement;
root.classList.add('js');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const below = el => el.getBoundingClientRect().top > innerHeight;
const onSight = (els, fn, margin = '0px 0px -12% 0px', threshold = 0) => {
  if (!('IntersectionObserver' in window)) { els.forEach(fn); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); } }), { rootMargin: margin, threshold });
  els.forEach(el => io.observe(el));
};
addEventListener('load', () => root.classList.add('smooth'), { once: true });

// Images fade in as they arrive.
$$('img[loading="lazy"]').forEach(img => {
  if (img.complete) return;
  img.classList.add('pending');
  const done = () => img.classList.remove('pending');
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
});

// Nav hairline once the page scrolls.
const nav = $('.nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// Pause: freezes the CSS animations and stops the scripted loops.
const paused = new Set();
let isPaused = false;
const pauseBtn = $('#pause');
if (pauseBtn && !still) {
  pauseBtn.hidden = false;
  pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.setAttribute('aria-pressed', String(isPaused));
    const label = isPaused ? 'Play animations' : 'Pause animations';
    pauseBtn.setAttribute('aria-label', label); pauseBtn.title = label;
    root.classList.toggle('paused', isPaused);
    paused.forEach(fn => fn(isPaused));
  });
}

// Entrances: only elements still below the fold wait; they stay readable.
const lifts = $$('.lift').filter(below);
lifts.forEach(el => el.classList.add('wait'));
onSight(lifts, el => el.classList.remove('wait'), '0px 0px -6% 0px');

// ── Hero demo: type a task, recognize its parts, drop it into the list ──
(() => {
  const screen = $('#demo'), field = $('#d-field'), chips = $('#d-chips'), sheet = $('#d-sheet'), list = $('#d-list');
  const left = $('#d-left'), fab = $('#d-fab'), send = $('#d-send'), stage = $('.demo-stage');
  if (!field) return;
  const ring = '<span class="ring"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><path d="m5 12 5 5 9-10"/></svg></span>';
  // The words Quick Add recognizes, and the chip each becomes.
  const parts = [
    { text: 'Call plumber ' },
    { text: 'fri', tok: true, chip: 'Fri 9 Oct' },
    { text: ' ' },
    { text: '5pm', tok: true, chip: 'Fri 17:00' },
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
    field.scrollLeft = field.scrollWidth;
  };
  const total = parts.reduce((a, p) => a + p.text.length, 0);
  const start = list.innerHTML;
  // A new task due Friday doesn't change today's count; ticking the
  // overdue Passports does.
  const insert = cls => {
    const row = document.createElement('div');
    row.className = cls;
    row.innerHTML = `${ring}<span class="t">Call plumber</span><span class="pill hi">Fri</span>`;
    list.children[0].after(row);
    list.lastElementChild.remove();
  };
  const final = () => { sheet.classList.remove('open'); insert('row'); list.children[0].classList.add('done'); left.textContent = '2'; };
  if (still) { final(); return; }

  // Every wait runs in short slices that stop while the phone is off screen,
  // the tab is hidden or the page is paused, so the loop holds its place.
  let visible = false;
  const waiters = [];
  const running = () => visible && !document.hidden && !isPaused;
  const ready = () => running() ? null : new Promise(r => waiters.push(r));
  const check = () => { if (running()) waiters.splice(0).forEach(r => r()); };
  const wait = async ms => {
    for (let left = ms; left > 0; left -= 100) {
      await ready();
      await new Promise(r => setTimeout(r, Math.min(left, 100)));
    }
  };
  document.addEventListener('visibilitychange', check);
  paused.add(check);

  async function loop() {
    for (;;) {
      list.innerHTML = start; left.textContent = '3'; chips.innerHTML = ''; draw(0);
      screen.classList.remove('fade');
      await wait(1400);
      fab.classList.add('press'); await wait(160); fab.classList.remove('press');
      sheet.classList.add('open'); await wait(600);
      for (let i = 1; i <= total; i++) {
        draw(i);
        let acc = 0;
        for (const p of parts) { acc += p.text.length; if (p.chip && acc === i) chips.insertAdjacentHTML('beforeend', `<span class="chip">${p.chip}</span>`); }
        await wait(i < 13 ? 70 : 110);
      }
      await wait(900);
      send.classList.add('press'); await wait(160); send.classList.remove('press');
      sheet.classList.remove('open'); await wait(380);
      insert('row new');
      await wait(1400);
      list.children[0].classList.add('done');
      left.textContent = '2';
      await wait(2600);
      screen.classList.add('fade'); await wait(450);
    }
  }
  let started = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      visible = e.intersectionRatio >= .4;
      if (visible && !started) { started = true; loop(); }
      check();
    }, { threshold: [0, .4] }).observe(stage);
  } else { visible = true; loop(); }
})();

// ── Three views: tabs that also advance on their own ──
(() => {
  const tabs = $$('.tabs [role="tab"]'), pics = $$('.views-stack picture'), cap = $('#views-cap'), panel = $('#views-panel');
  if (!tabs.length) return;
  const caps = [
    'Drag a task from one status to the next. Done is simply the last status.',
    'The same tasks as a table. Sort by anything and save the filters you use.',
    'Every task on its day, across all your projects.',
  ];
  let i = 0, timer = 0, auto = !still;
  const stop = () => { auto = false; clearTimeout(timer); tabs.forEach(t => $('.bar', t).classList.remove('run')); };
  const show = (n, user) => {
    i = n;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === n)); t.tabIndex = k === n ? 0 : -1; const b = $('.bar', t); b.classList.remove('run'); void b.offsetWidth; if (k === n && auto && !isPaused) b.classList.add('run'); });
    pics.forEach((p, k) => { p.classList.toggle('on', k === n); if (k === n) p.removeAttribute('aria-hidden'); else p.setAttribute('aria-hidden', 'true'); });
    panel.setAttribute('aria-labelledby', tabs[n].id);
    cap.textContent = caps[n];
    if (user) { cap.setAttribute('aria-live', 'polite'); stop(); }
    else if (auto && !isPaused) { clearTimeout(timer); timer = setTimeout(() => show((i + 1) % tabs.length), 5000); }
  };
  tabs.forEach((t, k) => {
    t.addEventListener('click', () => show(k, true));
    t.addEventListener('keydown', e => {
      const last = tabs.length - 1;
      const n = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + last) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
      if (n >= 0) { e.preventDefault(); show(n, true); tabs[n].focus(); }
    });
  });
  // Someone reading or about to click shouldn't have the view change under them.
  panel.addEventListener('pointerenter', stop);
  $('.views').addEventListener('focusin', stop);
  paused.add(p => { if (p) { clearTimeout(timer); tabs.forEach(t => $('.bar', t).classList.remove('run')); } else if (auto) show(i); });
  onSight([panel], () => { if (auto) show(i); }, '0px');
})();

// ── Today's three, playable ──
(() => {
  const card = $('#today');
  if (!card) return;
  const picks = $$('.pick', card), bars = $$('.meter i', card), count = $('#today-count'), end = $('#today-end');
  const lines = ['', 'One down.', 'Two down. One to go.', "That's the day. Go outside."];
  const burst = from => {
    if (still || isPaused) return;
    const r = from.getBoundingClientRect(), c = card.getBoundingClientRect();
    for (let k = 0; k < 14; k++) {
      const d = document.createElement('span');
      d.className = 'burst';
      const a = (k / 14) * Math.PI * 2, dist = 30 + (k % 3) * 14;
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
    const step = e.target.closest('.step'), n = Number(step.dataset.shot);
    steps.forEach(s => s.classList.toggle('on', s === step));
    shots.forEach((im, k) => im.classList.toggle('on', k === n));
  }), { rootMargin: '-40% 0px -40% 0px' });
  steps.forEach(s => io.observe($('h3', s)));
})();

// ── The receipt prints once it scrolls into view ──
(() => {
  const r = $('#receipt');
  if (!r || still || !below(r)) return;
  r.classList.add('wait');
  onSight([r], el => { el.classList.remove('wait'); el.classList.add('print'); }, '0px 0px -20% 0px');
})();

// ── The tour: phone or Windows reel, with arrow buttons ──
(() => {
  const segs = $$('.tour .seg button'), reels = $$('.tour .reel');
  if (!reels.length) return;
  const current = () => reels.find(r => !r.hidden);
  segs.forEach(b => b.addEventListener('click', () => {
    segs.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    reels.forEach(r => { r.hidden = r.dataset.set !== b.dataset.set; });
    current().scrollTo({ left: 0 });
  }));
  $$('.tour .arrow').forEach(b => b.addEventListener('click', () => {
    const r = current(), fig = $('figure', r);
    const step = fig ? fig.getBoundingClientRect().width + 20 : 300;
    r.scrollBy({ left: Number(b.dataset.dir) * step * (innerWidth > 900 ? 2 : 1), behavior: still ? 'auto' : 'smooth' });
  }));
})();

// ── The showroom: filter chips and the running count ──
(() => {
  const chips = $$('.filters button'), cards = $$('#feats li[data-cat]'), tally = $('#tally'), status = $('#feats-status');
  if (!cards.length) return;
  let filtered = false;
  const count = n => {
    if (still) { tally.textContent = n; return; }
    const from = Number(tally.textContent) || 0, t0 = performance.now();
    const tick = t => { const k = Math.min(1, (t - t0) / 500); tally.textContent = Math.round(from + (n - from) * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  const list = $('#feats'), more = $('#feats-more');
  more.textContent = `Show all ${cards.length} features`;
  more.addEventListener('click', () => {
    list.classList.remove('short'); more.hidden = true;
    const next = cards[12];
    if (next) { next.tabIndex = -1; next.focus({ preventScroll: false }); }
  });
  chips.forEach(b => b.addEventListener('click', () => {
    filtered = true;
    chips.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    list.classList.remove('short'); more.hidden = true;
    let n = 0, k = 0;
    cards.forEach(li => {
      const show = b.dataset.cat === 'all' || li.dataset.cat === b.dataset.cat;
      li.hidden = !show;
      li.classList.remove('in');
      if (show) { n++; if (!still) { void li.offsetWidth; li.style.animationDelay = `${Math.min(k++, 12) * 25}ms`; li.classList.add('in'); } }
    });
    count(n);
    status.textContent = `Showing ${n} feature${n === 1 ? '' : 's'}`;
  }));
  tally.textContent = cards.length;
  if (!still && below(tally)) onSight([tally], () => { if (filtered) return; tally.textContent = '0'; count(cards.length); }, '0px 0px -10% 0px');
})();
