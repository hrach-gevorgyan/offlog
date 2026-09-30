<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getDashboardData, getTaskById, subscribe } from '../db';
  import { spaces, projects, showError } from '../store';
  import { loadFocusLock } from '../focusLock';
  import { prefersReducedMotion } from '../theme';
  import { push, actions } from './nav';
  import { greeting, shortDate } from './format';
  import { localDateStr } from '../utils';
  import { I } from './icons';
  import { MARK_PATHS } from './mark';

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

  let unsub: (() => void) | undefined;
  onMount(() => { load(); unsub = subscribe(load); });
  onDestroy(() => unsub?.());

  $: left = data?.todayOpenCount ?? 0;
  $: doneToday = data?.todayDoneCount ?? 0;
  $: total = left + doneToday;
  $: late = data ? Object.values(data.byProject).reduce((n, p) => n + p.overdue, 0) : 0;
  $: pinned = data ? Object.values(data.byProject).reduce((n, p) => n + p.pinned, 0) : 0;
  // One dash per task due today, capped so a heavy day still fits one line.
  $: dashN = Math.max(1, Math.min(total, 12));
  $: dashOn = Math.round(doneToday * dashN / Math.max(total, 1));
  $: sortedSpaces = [...$spaces].sort((a, b) => a.position - b.position);
  const todayStr = localDateStr(new Date());

  // The top bar sits over the hero in the hero's colour, then turns into the
  // regular page-coloured bar across the last 40px before the hero's lowest
  // point passes under it. --t follows the finger; nothing here is timed.
  let heroH = 0, t = 0, markY = 0, raf = 0;
  function onScroll(e: Event) {
    const y = (e.currentTarget as HTMLElement).scrollTop;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const end = heroH - 60, span = 40;
      const lin = Math.min(1, Math.max(0, (y - (end - span)) / span));
      t = lin * lin * (3 - 2 * lin); // smoothstep: the muddy middle of the mix passes quickly
      markY = prefersReducedMotion() ? y : y * .65; // the mark drifts slower than the page: depth
    });
  }
</script>

<div class="home">
  <div class="appbar" style="--t:{t}">
    <span class="bt">
      <b><span class="on-hero">Offlog</span><span class="on-page" aria-hidden="true">Offlog</span></b>
      <small>{left} left · {doneToday} of {total} done</small>
    </span>
    <button class="ibtn" on:click={() => actions.openSettings()} aria-label="Settings">{@html I.gear}</button>
  </div>
  <svg class="mark" viewBox="0 0 1024 1024" aria-hidden="true" style="transform:translateY({-markY}px);opacity:{(1 - t) * .1};visibility:{t >= 1 ? 'hidden' : 'visible'}">
    {#each MARK_PATHS as d}<path {d} />{/each}
  </svg>

  <div class="scr" on:scroll={onScroll}>
    <div class="hero" bind:clientHeight={heroH}>
      <button class="hbody" on:click={() => push({ k: 'today' })} aria-label="Open Today: {left} left, {doneToday} of {total} done{late ? `, ${late} late` : ''}">
        <span class="hi">{greeting()} <span>· {shortDate(todayStr)}</span></span>
        <span class="count"><b>{left}</b><span>left today</span></span>
        <span class="meta">{doneToday} of {total} done{#if late}{' · '}<span class="l">{late} late</span>{/if}</span>
        <span class="track">{#each Array(dashN) as _, i}<i class:on={i < dashOn}></i>{/each}</span>
      </button>
    </div>

    <div class="tiles">
      <button class="tile" on:click={() => push({ k: 'late' })}>
        <span class="top"><span class="ic">{@html I.late}</span><b class:late={late > 0}>{late}</b></span><span class="lbl">Late</span>
      </button>
      <button class="tile" on:click={() => push({ k: 'focus' })}>
        <span class="top"><span class="ic">{@html I.focus}</span><b>{focus.done}/{focus.total}</b></span><span class="lbl">Focus</span>
      </button>
      <button class="tile" on:click={() => push({ k: 'pinned' })}>
        <span class="top"><span class="ic">{@html I.pin}</span><b>{pinned}</b></span><span class="lbl">Pinned</span>
      </button>
    </div>

    {#each sortedSpaces as s (s._id)}
      {@const ps = $projects.filter(p => p.space_id === s._id).sort((a, b) => a.position - b.position)}
      {#if ps.length}
        <div class="sec">{s.name}</div>
        <div class="group">
          {#each ps as p (p._id)}
            {@const st = data?.byProject[p._id]}
            <button class="row" on:click={() => push({ k: 'project', id: p._id })}>
              <span class="dot" style="background:{s.color}"></span>
              <span class="lbl">{p.name}</span>
              {#if st?.overdue}<span class="late-n">{st.overdue} late</span>{/if}
              <span class="badge">{st ? st.open : ''}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/each}
    {#if data?.completedLast7Days}
      <p class="stat">{data.completedLast7Days} finished this past week{data.busiestProjectName ? ` · busiest: ${data.busiestProjectName}` : ''}</p>
    {/if}
  </div>
</div>

<style>
  .home { position: absolute; inset: 0; overflow: hidden; }
  .scr { position: absolute; inset: 0; overflow-y: auto; padding: 0 16px 96px; scrollbar-width: none; }
  .scr::-webkit-scrollbar { display: none; }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }

  .appbar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 6; height: 60px;
    display: flex; align-items: center; gap: 12px; padding: 0 8px 0 20px;
    background: color-mix(in srgb, var(--bg) calc(var(--t) * 100%), var(--hero));
    color: color-mix(in srgb, var(--text) calc(var(--t) * 100%), var(--on-hero));
    box-shadow: 0 1px 0 color-mix(in srgb, var(--border) calc(var(--t) * 100%), transparent);
  }
  .bt { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
  .bt b { display: grid; font-size: 22px; font-weight: 700; letter-spacing: -.01em; line-height: 1.1; }
  /* Two copies on one spot: white fades out while dark fades in, so the
     title never passes through a grey midpoint. */
  .bt b span { grid-area: 1 / 1; }
  .bt .on-hero { color: var(--on-hero); opacity: calc(1 - var(--t)); }
  .bt .on-page { color: var(--text); opacity: var(--t); }
  .bt small { font-size: 12.5px; font-weight: 600; color: var(--faint); overflow: hidden; height: calc(var(--t) * 16px); opacity: clamp(0, calc(var(--t) * 2 - 1), 1); }
  .ibtn { margin-left: auto; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: inherit; }
  .ibtn:active { background: color-mix(in srgb, currentColor 12%, transparent); }

  /* Above the bar so the bar can never cut it; pointer-events off. */
  .mark { position: absolute; z-index: 7; right: -86px; top: -58px; width: 300px; height: 300px; color: var(--on-hero); fill: currentColor; pointer-events: none; }

  .hero {
    margin: 0 -16px; padding: 64px 20px 84px; background: var(--hero); color: var(--on-hero);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 64px), 0 100%);
  }
  .hbody { display: flex; flex-direction: column; width: 100%; color: inherit; margin-top: 10px; }
  .hi { font-size: 15px; opacity: .9; margin: 0 0 10px; font-weight: 500; }
  .hi span { opacity: .75; font-weight: 400; }
  .count { display: flex; align-items: baseline; gap: 10px; }
  .count b { font-size: 56px; font-weight: 800; letter-spacing: -.04em; line-height: .9; }
  .count span { font-size: 18px; font-weight: 600; }
  .meta { font-size: 14px; opacity: .9; margin: 10px 0 12px; }
  .meta .l { font-weight: 700; }
  .track { display: flex; gap: 5px; max-width: 260px; }
  .track i { flex: 1; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--on-hero) 24%, transparent); transition: background var(--dur-medium) var(--ease-standard); }
  .track i.on { background: var(--on-hero); }

  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: -54px 0 18px; position: relative; z-index: 2; }
  .tile { background: var(--surface); border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .tile:active { transform: scale(.98); }
  .top { display: flex; justify-content: space-between; align-items: center; }
  .ic { display: flex; color: var(--faint); }
  .tile b { font-size: 20px; font-weight: 700; }
  .tile b.late { color: var(--overdue-ink); }
  .tile .lbl { font-size: 13px; font-weight: 600; color: var(--muted); }

  .sec { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); margin: 18px 4px 8px; }
  .group { background: var(--surface); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08); overflow: hidden; margin-bottom: 14px; }
  .row { width: 100%; display: flex; align-items: center; gap: 14px; padding: 13px 16px; min-height: 52px; font-size: 16px; }
  .row + .row { border-top: 1px solid var(--border); }
  .row:active { background: var(--col-bg); }
  .row .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .badge { background: var(--col-bg); color: var(--muted); border-radius: 999px; padding: 1px 9px; font-size: 12.5px; font-weight: 600; }
  .late-n { color: var(--overdue-ink); font-size: 12.5px; font-weight: 600; }
  .stat { font-size: 13px; color: var(--faint); text-align: center; margin: 4px 0 0; }
</style>
