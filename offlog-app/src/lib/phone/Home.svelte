<script context="module" lang="ts">
  // The mark's entrance belongs to the app opening, not to every return to
  // Home; a module flag lives exactly as long as the launch does.
  let markPlayed = false;
</script>

<script lang="ts">
  import { soften } from '../tagColors';
  import NewProjectSheet from './NewProjectSheet.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { getDashboardData, getTaskById, subscribe } from '../db';
  import { spaces, projects, showError } from '../store';
  import { loadFocusLock } from '../focusLock';
  import { prefersReducedMotion, claimStatusBar } from '../theme';
  import { push, actions } from './nav';
  import { greeting, shortDate } from './format';
  import { localDateStr } from '../utils';
  import { I } from './icons';
  import { MARK_PATHS } from './mark';
  import { markIn } from '../motion';

  type Data = Awaited<ReturnType<typeof getDashboardData>>;
  let data: Data | null = null;
  let focus = { done: 0, total: 0 };

  async function load() {
    try {
      data = await getDashboardData();
      const lock = loadFocusLock();
      const locked = lock ? (await Promise.all(lock.taskIds.map(id => getTaskById(id)))).filter(t => t && !t.deleted && !t.archived) : [];
      const last = (pid: string) => data?.byProject[pid]?.lastColId;
      focus = { total: locked.length, done: locked.filter(t => t!.column_id === last(t!.project_id)).length };
    } catch {
      showError('Could not load Home. Pull down or reopen to try again.');
    }
  }

  // New project sheet: {#key} bumped on every open (Sheet.svelte rule).
  let newIn: string | null = null, newSession = 0;
  function newProject(spaceId: string) { newIn = spaceId; newSession++; }

  let unsub: (() => void) | undefined;
  onMount(() => { load(); unsub = subscribe(load); });
  // Its own claim, taken when Home appears: the screen it returns from may
  // still be animating out with a claim of its own.
  const HERO = { lightIcons: true };
  let strip: ReturnType<typeof claimStatusBar> | undefined;
  onMount(() => { strip = claimStatusBar(HERO); });
  onDestroy(() => { unsub?.(); if (raf) cancelAnimationFrame(raf); strip?.release(); });
  // Coming back to the app the next morning shows the new day.
  function onVisible() { if (!document.hidden) { todayStr = localDateStr(new Date()); load(); } }
  onMount(() => { document.addEventListener('visibilitychange', onVisible); return () => document.removeEventListener('visibilitychange', onVisible); });

  // A fresh install: the band invites the first task; everything else stays.
  $: firstRun = !!data && data.totalTasks === 0;
  $: left = data?.todayOpenCount ?? 0;
  $: doneToday = data?.todayDoneCount ?? 0;
  $: total = left + doneToday;
  $: late = data ? Object.values(data.byProject).reduce((n, p) => n + p.overdue, 0) : 0;
  $: pinned = data ? Object.values(data.byProject).reduce((n, p) => n + p.pinned, 0) : 0;
  // One dash per task due today, capped so a heavy day still fits one line.
  $: dashN = Math.max(1, Math.min(total, 12));
  $: dashOn = Math.round(doneToday * dashN / Math.max(total, 1));
  // Unsorted is the catch-all, so it sits last on Home whatever its stored
  // position (the stored order is left alone).
  const UNSORTED = 'space:unsorted';
  // Spaces holding projects come first, so what the user has is on top.
  const hasProjects = (id: string) => $projects.some(p => p.space_id === id);
  $: sortedSpaces = [...$spaces].sort((a, b) =>
    Number(!hasProjects(a._id)) - Number(!hasProjects(b._id))
    || Number(a._id === UNSORTED) - Number(b._id === UNSORTED)
    || a.position - b.position);
  let todayStr = localDateStr(new Date());

  // The top bar sits over the hero in the hero's colour, then turns into the
  // regular page-coloured bar across the last 40px before the hero's lowest
  // point passes under it. --t follows the finger; nothing here is timed.
  let heroH = 0, t = 0, fill = 0, markY = 0, raf = 0;
  // Mounted after Home, so its entrance plays even on the app's first frame
  // (an intro does not run on the initial render).
  let markShown = false;
  const markReplay = !markPlayed;
  const markEntrance = (node: Element) => (markReplay ? markIn(node) : { duration: 0 });
  onMount(() => { markShown = true; markPlayed = true; });
  // The bar is see-through over the band, so the band's lines would slide
  // under the "Offlog" title. Each line fades out over the 30px before it
  // reaches the title (a large title collapsing); at rest the first line sits
  // 74px down, fully visible.
  let heroEl: HTMLElement;
  function fadeHeroLines(y: number) {
    const body = heroEl?.querySelector<HTMLElement>('.hbody');
    if (!body) return;
    for (const line of Array.from(body.children) as HTMLElement[]) {
      const top = heroEl.offsetTop + body.offsetTop + line.offsetTop - y;
      const o = Math.min(1, Math.max(0, (top - 44) / 30));
      line.style.opacity = o < 1 ? String(o) : '';
    }
  }

  function onScroll(e: Event) {
    const y = (e.currentTarget as HTMLElement).scrollTop;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const end = heroH - 64, span = 40;
      const lin = Math.min(1, Math.max(0, (y - (end - span)) / span));
      t = lin * lin * (3 - 2 * lin); // smoothstep: the muddy middle of the mix passes quickly
      // The bar stays see-through while only the band is under it (same
      // colour), so the mark scrolls under it whole. It fills in just before
      // the tiles, which overlap the band's edge, can reach it.
      fill = Math.min(1, Math.max(0, (y - (heroH - 150)) / 24));
      // Inside the band the mark scrolls with it; easing it back down a third
      // of the way makes it move slower than the page (depth).
      markY = prefersReducedMotion() ? 0 : y * .4;
      fadeHeroLines(y);
      strip?.set(t < .5 ? HERO : null);
    });
  }
</script>

<div class="home">
  <div class="appbar" style="--t:{t};--fill:{fill}">
    <span class="bt">
      <b><span class="on-hero">Offlog</span><span class="on-page" aria-hidden="true">Offlog</span></b>
      <small>{firstRun ? 'No tasks yet' : total ? `${left} left` : 'Nothing due today'}</small>
    </span>
    <button class="ibtn" on:click={() => actions.openSettings()} aria-label="Settings">{@html I.gear}</button>
  </div>

  <div class="scr" on:scroll={onScroll}>
    <div class="hero" bind:clientHeight={heroH} bind:this={heroEl}>
      {#if markShown}
        <div class="markwrap" aria-hidden="true" in:markEntrance>
          <svg class="mark" viewBox="0 0 1024 1024" style="transform:translateY({markY}px);opacity:{0.1 * (1 - fill)}">
            {#each MARK_PATHS as d}<path {d} />{/each}
          </svg>
        </div>
      {/if}
      {#if firstRun}
        <button class="hbody" on:click={() => actions.quickAdd()}>
          <span class="hi">{greeting()} <span>· {shortDate(todayStr)}</span></span>
          <span class="none">Add your first task</span>
        </button>
      {:else}
      <button class="hbody" class:pending={!data} on:click={() => push({ k: 'today' })} aria-label={total ? `Open Today: ${left} left, ${doneToday} of ${total} done${late ? `, ${late} late` : ''}` : `Open Today: nothing due${late ? `, ${late} late` : ''}`}>
        <span class="hi">{greeting()} <span>· {shortDate(todayStr)}</span></span>
        {#if total || !data}
          <span class="count"><b>{left}</b><span>left today</span></span>
          <span class="track">{#each Array(dashN) as _, i}<i class:on={i < dashOn}></i>{/each}</span>
        {:else}
          <span class="none">Nothing due today</span>
        {/if}
      </button>
      {/if}
    </div>

    <div class="tiles" class:pending={!data}>
      <button class="tile" on:click={() => push({ k: 'late' })}>
        <span class="top"><span class="ic">{@html I.late}</span><b class:late={late > 0} class:quiet={!late}>{late}</b></span><span class="lbl">Late</span>
      </button>
      <button class="tile" on:click={() => push({ k: 'focus' })}>
        <span class="top"><span class="ic">{@html I.focus}</span><b class:quiet={!focus.total}>{focus.done}/{focus.total || 3}</b></span><span class="lbl">Focus</span>
      </button>
      <button class="tile" on:click={() => push({ k: 'pinned' })}>
        <span class="top"><span class="ic">{@html I.pin}</span><b class:quiet={!pinned}>{pinned}</b></span><span class="lbl">Pinned</span>
      </button>
    </div>

    {#each sortedSpaces as s (s._id)}
      {@const ps = $projects.filter(p => p.space_id === s._id).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.position - b.position)}
      <div class="p-sec sec" role="heading" aria-level="2">
        <span>{s.name}</span>
        {#if ps.length}<button class="secadd" on:click={() => newProject(s._id)} aria-label="New project in {s.name}">{@html I.plus}</button>{/if}
      </div>
      <div class="p-group">
        {#each ps as p (p._id)}
          {@const st = data?.byProject[p._id]}
          <button class="p-row" on:click={() => push({ k: 'project', id: p._id })}>
            <span class="p-dot" style="background:{soften(s.color)}"></span>
            <span class="lbl">{p.name}</span>
            {#if p.pinned}<span class="pin" aria-label="Pinned">{@html I.pin}</span>{/if}
            {#if st?.overdue}<span class="late-n">{st.overdue} late</span>{/if}
            {#if st?.open}<span class="p-n">{st.open}</span>{/if}
          </button>
        {/each}
        {#if !ps.length}
          <button class="p-row acc add" on:click={() => newProject(s._id)}>
            <span class="plus">{@html I.plus}</span><span class="lbl">New project</span>
          </button>
        {/if}
      </div>
    {/each}
    {#if data?.completedLast7Days}
      <p class="stat">{data.completedLast7Days} finished this past week{data.busiestProjectName ? ` · busiest: ${data.busiestProjectName}` : ''}</p>
    {/if}
  </div>
</div>

{#if newIn}
  {#key newSession}
    <NewProjectSheet spaceId={newIn} on:created={e => push({ k: 'project', id: e.detail._id })} on:close={() => (newIn = null)} />
  {/key}
{/if}

<style>
  .home { position: absolute; inset: 0; overflow: hidden; }
  .scr { position: absolute; inset: 0; overflow-y: auto; padding: 0 16px 96px; scrollbar-width: none; }
  .scr::-webkit-scrollbar { display: none; }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }

  .appbar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 6; height: 64px;
    display: flex; align-items: center; gap: 12px; padding: 0 8px 0 20px;
    background: color-mix(in srgb, var(--bg) calc(var(--t) * 100%), color-mix(in srgb, var(--hero) calc(var(--fill) * 100%), transparent));
    color: color-mix(in srgb, var(--text) calc(var(--t) * 100%), var(--on-hero));
    box-shadow: 0 1px 0 color-mix(in srgb, var(--border) calc(var(--t) * 100%), transparent);
  }
  .bt { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
  .bt b { display: grid; font-size: var(--p-fs-t); font-weight: 700; letter-spacing: -.01em; line-height: 1.1; }
  /* Two copies on one spot: white fades out while dark fades in, so the
     title never passes through a grey midpoint. */
  .bt b span { grid-area: 1 / 1; }
  .bt .on-hero { color: var(--on-hero); opacity: calc(1 - var(--t)); }
  .bt .on-page { color: var(--text); opacity: var(--t); }
  .bt small { font-size: var(--p-fs-s); font-weight: 600; color: var(--faint); overflow: hidden; height: calc(var(--t) * 16px); opacity: clamp(0, calc(var(--t) * 2 - 1), 1); }
  .ibtn { position: relative; margin-left: auto; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: inherit; }
  .ibtn:active { background: color-mix(in srgb, currentColor 12%, transparent); }

  /* Inside the band, so its diagonal clips it; starts below the top bar. */
  /* Up under the (see-through) top bar and off to the right, clear of the
     count and the progress dashes. */
  .markwrap { position: absolute; right: -92px; top: -36px; width: 252px; height: 252px; pointer-events: none; }
  /* Opacity is set inline: 10%, fading out as the band leaves. */
  .mark { width: 100%; height: 100%; color: var(--on-hero); fill: currentColor; }

  .hero {
    position: relative; overflow: hidden;
    margin: 0 -16px; padding: 64px 20px 68px; background: var(--hero); color: var(--on-hero);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 52px), 0 100%);
  }
  /* stretch is spelled out: older WebViews give buttons align-items:
     flex-start, which collapses the tile rows and the progress track. */
  .hbody { position: relative; display: flex; flex-direction: column; align-items: stretch; width: 100%; color: inherit; margin-top: 10px; }
  .hbody:active { opacity: .85; }
  .hi { font-size: var(--p-fs-m); margin: 0 0 10px; font-weight: 500; }
  .hi span { opacity: .88; font-weight: 400; }
  .pin { display: flex; color: var(--faint); }
  .pin :global(svg) { width: 14px; height: 14px; }
  .count { display: flex; align-items: baseline; gap: 10px; }
  .count b { font-size: 56px; font-weight: 800; letter-spacing: -.04em; line-height: .9; }
  .count span { font-size: var(--p-fs-xl); font-weight: 600; }
  .none { font-size: 28px; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; margin-bottom: 4px; }
  .track { display: flex; gap: 5px; max-width: 190px; margin-top: 14px; }
  .track i { flex: 1; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--on-hero) 24%, transparent); transition: background var(--dur-medium) var(--ease-standard); }
  .track i.on { background: var(--on-hero); }

  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: -46px 0 18px; position: relative; z-index: 2; }
  /* Before the first load the numbers would read as a real "nothing due /
     0 late" for a frame; the usual layout holds the space instead. */
  .hbody.pending > :not(.hi), .tiles.pending b { visibility: hidden; }
  .tile { background: var(--surface); border-radius: 12px; box-shadow: var(--p-shadow); padding: 10px 12px; display: flex; flex-direction: column; align-items: stretch; gap: 6px; transition: transform var(--dur-hover) var(--ease-hover); }
  .tile:active { transform: scale(.98); }
  .top { display: flex; justify-content: space-between; align-items: center; }
  .ic { display: flex; color: var(--faint); }
  .tile b { font-size: 20px; font-weight: 700; }
  .tile b.late { color: var(--overdue-ink); }
  .tile b.quiet { color: var(--faint); }
  .tile .lbl { font-size: var(--p-fs-s); font-weight: 600; color: var(--muted); }

  .sec { justify-content: space-between; min-height: 32px; margin-bottom: 4px; }
  .secadd { position: relative; width: 44px; height: 44px; margin: -6px -10px -6px 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: var(--faint); transition: background var(--dur-hover) var(--ease-hover); }
  .secadd:active { background: var(--col-bg); }
  /* 48px touch target around the 44px visual. */
  .ibtn::before, .secadd::before { content: ''; position: absolute; inset: -2px; border-radius: 50%; }
  .secadd :global(svg) { width: 20px; height: 20px; }
  .p-row.add { font-size: var(--p-fs-m); min-height: 48px; }
  .plus { display: flex; width: 8px; justify-content: center; }
  .plus :global(svg) { width: 18px; height: 18px; }
  /* Two lines before truncating: at large system font sizes one line cuts most names. */
  .p-row .lbl { flex: 1; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow-wrap: anywhere; }
  .late-n { color: var(--overdue-ink); font-size: var(--p-fs-xs); font-weight: 600; }
  .stat { font-size: var(--p-fs-s); color: var(--faint); text-align: center; margin: 4px 0 0; }
</style>
