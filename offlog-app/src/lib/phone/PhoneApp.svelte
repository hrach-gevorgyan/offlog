<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { tab, stack, arrival, switchTab, push, actions, TABS, toast, addContext } from './nav';
  import type { Tab } from './nav';
  import { screenIn, pillIn, snackIn, snackOut } from '../motion';
  import { fly } from 'svelte/transition';
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
    let tallest = 0, width = 0;
    const check = () => {
      const h = vv?.height ?? window.innerHeight, w = window.innerWidth;
      if (w !== width) { width = w; tallest = h; }
      tallest = Math.max(tallest, h);
      kb = tallest - h > 150;
    };
    check();
    (vv ?? window).addEventListener('resize', check);
    return () => (vv ?? window).removeEventListener('resize', check);
  });

  onMount(() => {
    actions.quickAdd = openAdd;
    actions.openSettings = () => push({ k: 'settings' });
    actions.openTask = (task) => push({ k: 'task', id: task._id });
  });

  const LABEL: Record<Tab, string> = { home: 'Home', today: 'Today', agenda: 'Agenda', search: 'Search' };
</script>

<div class="phone-shell" class:kb>
  <div class="screens">
    {#key key}
      <div class="screen" class:flush={top.k === 'home'} class:board={top.k === 'project'} in:screenIn={{ kind: $arrival }}>
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

  {#if !$modalOpen && top.k !== 'settings' && top.k !== 'set' && top.k !== 'task' && top.k !== 'statuses'}<button class="fab" class:lift={!!$toast} on:click={() => actions.quickAdd()} aria-label="Add a task">{@html I.plus}</button>{/if}

  {#if qa}
    {#key qaSession}
      <QuickAddSheet projectId={qa.projectId} columnId={qa.columnId} dueDate={qa.dueDate} on:close={() => (qa = null)} />
    {/key}
  {/if}

  {#if $toast}
    {#key $toast.id}
      <div class="snack" in:fly={snackIn} out:fly={snackOut}>
        <span class="msg">{$toast.text}</span>
        {#if $toast.undo}<button on:click={() => { const u = $toast?.undo; toast.set(null); u?.(); }}>Undo</button>{/if}
      </div>
    {/key}
  {/if}

  <!-- Always mounted and only its text changes: a live region inserted
       already filled is often not announced. -->
  <div class="sr" role="status" aria-live="polite">{$toast?.text ?? ''}</div>

  <nav class="tabbar" aria-label="Main">
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
</div>

<style>
  .phone-shell { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--bg); color: var(--text); }
  .phone-shell :global(svg.i) { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
  .screens { position: relative; flex: 1; min-height: 0; overflow: hidden; }
  .screen { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; padding: 0 16px 96px; background: var(--bg); scrollbar-width: none; }
  .screen::-webkit-scrollbar { display: none; }
  .screen.flush { padding: 0; overflow: hidden; }
  .screen.board { padding: 0; display: flex; flex-direction: column; overflow: hidden; }

  .fab {
    position: absolute; right: 16px; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); z-index: 10;
    width: 56px; height: 56px; border-radius: 50%; border: 0; cursor: pointer;
    background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,.18);
    transition: transform var(--dur-medium) var(--ease-standard);
  }
  .fab :global(svg.i) { width: 24px; height: 24px; stroke-width: 2.2; }
  .fab:active { transform: scale(.95); }
  /* Rises above the snackbar instead of hiding under it. */
  .fab.lift { transform: translateY(-64px); }
  .kb .fab, .kb .tabbar { display: none; }

  .snack {
    position: absolute; left: 12px; right: 12px; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); z-index: 20;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: var(--inverse-surface); color: var(--on-inverse); border-radius: 12px; padding: 4px 4px 4px 16px; min-height: 52px;
    font-size: 14px; line-height: 1.35; box-shadow: 0 4px 20px rgba(0,0,0,.25);
  }
  .msg { min-width: 0; padding: 8px 0; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .snack button { font: inherit; font-weight: 700; color: var(--inverse-accent); background: none; border: 0; min-height: 44px; padding: 0 14px; border-radius: 8px; cursor: pointer; flex-shrink: 0; }
  .snack button:active { background: color-mix(in srgb, var(--on-inverse) 12%, transparent); }

  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  .tabbar {
    flex-shrink: 0; display: flex; justify-content: space-around; align-items: flex-start;
    padding: 10px 8px calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--surface); border-top: 1px solid var(--border);
  }
  .tb { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 64px; font: inherit; font-size: 12px; font-weight: 600; color: var(--muted); background: none; border: 0; padding: 0; cursor: pointer; }
  .tb.on { color: var(--text); }
  .pill { position: relative; display: flex; align-items: center; justify-content: center; width: 60px; height: 32px; border-radius: 16px; }
  .pill :global(svg.i) { position: relative; width: 22px; height: 22px; }
  .tb.on .pill { color: var(--accent); }
  .pillbg { position: absolute; inset: 0; border-radius: 16px; background: color-mix(in srgb, var(--accent) 22%, transparent); }
</style>
