<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { tab, stack, arrival, switchTab, push, actions, TABS, toast, addContext, takeQueuedAdd, reselect, showToast } from './nav';
  import { fabScrollTracker } from './fabScroll';
  import { prefersReducedMotion } from '../theme';
  import { exactAlarmNudge, requestExactAlarmPermission } from '../notifications';
  import type { Tab } from './nav';
  import { keyboardBarIn, keyboardFabIn, screenIn, screenOut, pillIn, snackIn, snackOut, snackSwapIn, snackSwapOut } from '../motion';
  import { fly, scale } from 'svelte/transition';
  import { I } from './icons';
  import './phone.css';
  import { modalOpen } from '../store';
  import Home from './Home.svelte';
  import TaskListScreen from './TaskListScreen.svelte';
  import SearchScreen from './SearchScreen.svelte';
  import ProjectScreen from './ProjectScreen.svelte';
  import AgendaScreen from './AgendaScreen.svelte';
  import FocusScreen from './FocusScreen.svelte';
  import QuickAddSheet from './QuickAddSheet.svelte';
  import { agendaDay } from './agenda/month';
  import SettingsScreen from './settings/SettingsScreen.svelte';
  import TaskScreen from './TaskScreen.svelte';
  import StatusesScreen from './StatusesScreen.svelte';
  import SettingsPage from './settings/SettingsPage.svelte';

  $: top = $stack[$stack.length - 1];
  $: key = `${$tab}:${$stack.length}:${top.k}:${'id' in top ? top.id : 'page' in top ? top.page : ''}`;
  // Quick add opens here as a sheet; it adds where the user is looking: the
  // project and status on screen, or the day picked in Agenda's month.
  let qa: { projectId: string | null; columnId: string | null; dueDate: string | null } | null = null;
  let qaSession = 0;
  function openAdd(due: string | null = null) {
    const ctx = get(addContext), cur = get(stack).at(-1);
    const inProject = cur?.k === 'project' ? ctx : null;
    qa = { projectId: inProject?.projectId ?? null, columnId: inProject?.columnId ?? null, dueDate: due ?? (cur?.k === 'agenda' ? get(agendaDay) : null) };
    qaSession++;
  }
  // With the soft keyboard up, the nav bar and + button would eat the little
  // height left; hide them. The WebView resizes (adjustResize), so a large
  // drop from the tallest height seen at this width means the keyboard.
  let kb = false;
  onMount(() => {
    const vv = window.visualViewport;
    let tallest = 0, width = 0, lastH = 0;
    const check = () => {
      const h = vv?.height ?? window.innerHeight, w = window.innerWidth;
      // A rotation with the keyboard up must not take the keyboard height as
      // the new baseline; keep the current state until typing stops.
      if (w !== width) { width = w; tallest = kb ? 0 : h; }
      // Rotated with the keyboard up: the first big growth is the keyboard
      // going away, which gives the real baseline.
      if (!tallest && h - lastH > 150) tallest = h;
      lastH = h;
      // Only while typing and not pinch-zoomed: a shorter window (split
      // screen, a docked dev panel) is not the keyboard.
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (!typing) tallest = Math.max(tallest, h);
      if (!tallest) return;
      kb = typing && (vv?.scale ?? 1) <= 1 && tallest - h > 150;
    };
    check();
    (vv ?? window).addEventListener('resize', check);
    // During focusout the next field is not focused yet; check once it is.
    const later = () => setTimeout(check, 0);
    document.addEventListener('focusout', later);
    document.addEventListener('focusin', check);
    return () => { (vv ?? window).removeEventListener('resize', check); document.removeEventListener('focusout', later); document.removeEventListener('focusin', check); };
  });

  onMount(() => {
    actions.quickAdd = openAdd;
    const queued = takeQueuedAdd();
    if (queued) openAdd(queued.due);
    actions.openSettings = () => push({ k: 'settings' });
    actions.openTask = (task) => push({ k: 'task', id: task._id });
  });

  // A toast replacing one still on screen crossfades in place instead of
  // rising again; read by both snackbars' transitions when they start.
  let lastToast: number | null = null, swap = false;
  $: { const id = $toast?.id ?? null; swap = lastToast !== null && id !== null; lastToast = id; }

  const LABEL: Record<Tab, string> = { home: 'Home', today: 'Today', agenda: 'Agenda', search: 'Search' };

  // Scroll events do not bubble, so one capturing listener on the screens
  // sees every scroller inside them (Home's own list included).
  let screensEl: HTMLElement;
  let fabAway = false;
  const fabScroll = fabScrollTracker(v => (fabAway = v));
  $: if (key) fabScroll.reset(); // a new screen starts with the + shown
  onMount(() => {
    const on = (e: Event) => { if (e.target instanceof Element) fabScroll.onScroll(e.target); };
    screensEl.addEventListener('scroll', on, true);
    return () => screensEl.removeEventListener('scroll', on, true);
  });

  // Re-tapping the current tab at its root: back to the top of that screen.
  function scrollToTop() {
    const root = screensEl?.querySelector('.screen');
    if (!root) return;
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.scrollTop > 0) { if (el.scrollTo) el.scrollTo({ top: 0, behavior }); else el.scrollTop = 0; }
    }
  }
  // Both counters only react to bumps after mount, not to their current value.
  onMount(() => { const seen = get(reselect); return reselect.subscribe(n => { if (n > seen) scrollToTop(); }); });

  // A reminder just set while exact alarms are off: say so once, with the fix.
  onMount(() => {
    const seen = get(exactAlarmNudge);
    return exactAlarmNudge.subscribe(n => {
      if (n > seen) showToast('Reminders may be a few minutes late', undefined, { label: 'Make exact', run: () => { requestExactAlarmPermission(); } });
    });
  });
</script>

<div class="phone-shell" class:kb>
  <div class="screens" bind:this={screensEl}>
    {#key key}
      <div class="screen" class:flush={top.k === 'home'} class:board={top.k === 'project'} in:screenIn={{ kind: $arrival }} out:screenOut={{ kind: $arrival }}>
        {#if top.k === 'home'}
          <Home />
        {:else if top.k === 'today' || top.k === 'late' || top.k === 'pinned'}
          <TaskListScreen kind={top.k} root={top.k === 'today' && $stack.length === 1} />
        {:else if top.k === 'search'}
          <SearchScreen />
        {:else if top.k === 'project'}
          <ProjectScreen id={top.id} />
        {:else if top.k === 'agenda'}
          <AgendaScreen />
        {:else if top.k === 'focus'}
          <FocusScreen />
        {:else if top.k === 'task'}
          <TaskScreen id={top.id} />
        {:else if top.k === 'statuses'}
          <StatusesScreen id={top.id} />
        {:else if top.k === 'settings'}
          <SettingsScreen />
        {:else if top.k === 'set'}
          <SettingsPage page={top.page} />
        {/if}
      </div>
    {/key}
  </div>

  {#if !kb && !$modalOpen && top.k !== 'settings' && top.k !== 'set' && top.k !== 'task' && top.k !== 'statuses'}<button class="fab" in:scale={keyboardFabIn} class:lift={!!$toast} class:away={fabAway} aria-hidden={fabAway || undefined} tabindex={fabAway ? -1 : undefined} on:click={() => actions.quickAdd()} aria-label="Add a task"><svg class="shape" viewBox="0 0 56 60" aria-hidden="true"><path d="M0 22Q0 12 10 10.6L44 4.8Q56 3 56 15V44Q56 60 40 60H16Q0 60 0 44Z" /></svg>{@html I.plus}</button>{/if}

  {#if qa}
    {#key qaSession}
      <QuickAddSheet projectId={qa.projectId} columnId={qa.columnId} dueDate={qa.dueDate} on:close={() => (qa = null)} />
    {/key}
  {/if}

  <!-- A keyed each, not {#if}{#key}: a key block inside an {#if} drops its
       outro when the {#if} closes, so the snackbar would vanish on timeout. -->
  {#each $toast ? [$toast] : [] as t (t.id)}
    <div class="snack" in:fly={swap ? snackSwapIn : snackIn} out:fly={swap ? snackSwapOut : snackOut}>
      <span class="msg">{t.text}</span>
      {#if t.undo}<button on:click={() => { const u = t.undo; toast.set(null); u?.(); }}>Undo</button>
      {:else if t.action}<button on:click={() => { const a = t.action; toast.set(null); a?.run(); }}>{t.action.label}</button>{/if}
    </div>
  {/each}

  <!-- Always mounted and only its text changes: a live region inserted
       already filled is often not announced. -->
  <div class="sr" role="status" aria-live="polite">{$toast?.text ?? ''}</div>

  <!-- Out of the layout while the keyboard is up (it covers this space);
       rises back in as the keyboard goes down. -->
  {#if !kb}
  <nav class="tabbar" aria-label="Main" in:fly={keyboardBarIn}>
    {#each TABS as t}
      <button class="tb" class:on={$tab === t} aria-current={$tab === t ? 'page' : undefined} on:click={() => switchTab(t)}>
        <span class="pill">
          {#if $tab === t}
            {#if $arrival === 'tab'}<span class="pillbg" in:pillIn></span>{:else}<span class="pillbg"></span>{/if}
          {/if}
          {@html I[t]}
        </span>
        {LABEL[t]}
      </button>
    {/each}
  </nav>
  {/if}
</div>

<style>
  .phone-shell { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--bg); color: var(--text);
    padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); }
  .phone-shell :global(svg.i) { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
  .screens { position: relative; flex: 1; min-height: 0; overflow: hidden; }
  .screen { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; padding: 0 16px 96px; background: var(--bg); scrollbar-width: none; }
  .screen::-webkit-scrollbar { display: none; }
  .screen.flush { padding: 0; overflow: hidden; }
  .screen.board { padding: 0; display: flex; flex-direction: column; overflow: hidden; }

  .fab {
    position: absolute; right: 16px; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); z-index: 10;
    width: 56px; height: 60px; border: 0; padding: 0; cursor: pointer;
    background: none; color: var(--on-accent); display: flex; align-items: center; justify-content: center;
    /* translate rides with the snackbar (its timings: rises decelerating,
       drops accelerating); scale is the press. Separate properties, so a
       press is never slowed to the lift's pace. */
    transition: translate var(--dur-medium-out) var(--ease-accelerate), scale var(--dur-hover) var(--ease-hover), transform var(--dur-medium) var(--ease-decelerate), opacity var(--dur-medium) var(--ease-decelerate);
  }
  /* The hero's slant on a rounded square: the shape is drawn (not clipped)
     so its corners stay round and its shadow shows. The + sits on the
     shape, above it. */
  .fab .shape { position: absolute; inset: 0; width: 100%; height: 100%; fill: var(--accent); filter: drop-shadow(0 4px 6px rgba(0,0,0,.18)); }
  /* The slant lowers the shape's middle to about y 34 of 60, so the + moves
     down with it to sit in the visual centre. */
  .fab :global(svg.i) { position: relative; top: 3.5px; width: 24px; height: 24px; stroke-width: 2.2; }
  .fab:focus-visible { outline-offset: 4px; border-radius: 18px; }
  .fab:active { scale: .95; }
  /* Rises above the snackbar instead of hiding under it. */
  .fab.lift { translate: 0 -64px; transition: translate var(--dur-medium) var(--ease-decelerate), scale var(--dur-hover) var(--ease-hover), transform var(--dur-medium) var(--ease-decelerate), opacity var(--dur-medium) var(--ease-decelerate); }
  /* Scrolled away: drops below the bar's edge, leaving accelerating and
     returning decelerating. */
  .fab.away { transform: translateY(96px) scale(.6); opacity: 0; pointer-events: none;
    transition: translate var(--dur-medium-out) var(--ease-accelerate), scale var(--dur-hover) var(--ease-hover), transform var(--dur-medium-out) var(--ease-accelerate), opacity var(--dur-medium-out) var(--ease-accelerate); }

  .snack {
    position: absolute; left: 12px; right: 12px; bottom: calc(72px + env(safe-area-inset-bottom, 0px)); z-index: 20;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: var(--inverse-surface); color: var(--on-inverse); border-radius: 12px; padding: 4px 4px 4px 16px; min-height: 52px;
    font-size: var(--p-fs-m); line-height: 1.35; box-shadow: 0 4px 20px rgba(0,0,0,.25);
  }
  .msg { min-width: 0; padding: 8px 0; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .snack button { transition: background var(--dur-hover) var(--ease-hover); font: inherit; font-weight: 700; color: var(--inverse-accent); background: none; border: 0; min-height: 44px; padding: 0 14px; border-radius: 8px; cursor: pointer; flex-shrink: 0; }
  .snack button:active { background: color-mix(in srgb, var(--on-inverse) 12%, transparent); }

  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  .tabbar {
    flex-shrink: 0; display: flex; justify-content: space-around; align-items: flex-start;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
    background: var(--surface); border-top: 1px solid var(--border);
  }
  .tb { transition: color var(--dur-medium) var(--ease-standard); display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 64px; font: inherit; font-size: var(--p-fs-xs); font-weight: 600; color: var(--muted); background: none; border: 0; padding: 0; cursor: pointer; }
  .tb:active .pill { background: var(--col-bg); }
  .tb.on { color: var(--text); }
  .pill { transition: background var(--dur-hover) var(--ease-hover), color var(--dur-medium) var(--ease-standard); position: relative; display: flex; align-items: center; justify-content: center; width: 60px; height: 32px; border-radius: 16px; }
  .pill :global(svg.i) { position: relative; width: 22px; height: 22px; }
  .tb.on .pill { color: var(--accent); }
  .pillbg { position: absolute; inset: 0; border-radius: 16px; background: color-mix(in srgb, var(--accent) 22%, transparent); }
</style>
