<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { tab, stack, arrival, switchTab, actions, TABS, toast, addContext } from './nav';
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

  $: top = $stack[$stack.length - 1];
  $: key = `${$tab}:${$stack.length}:${top.k}:${'id' in top ? top.id : ''}`;
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
  onMount(() => { actions.quickAdd = openAdd; });

  const LABEL: Record<Tab, string> = { home: 'Home', today: 'Today', agenda: 'Agenda', search: 'Search' };
</script>

<div class="phone-shell">
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
        {/if}
      </div>
    {/key}
  </div>

  {#if !$modalOpen}<button class="fab" on:click={() => actions.quickAdd()} aria-label="Add a task">{@html I.plus}</button>{/if}

  {#if qa}
    {#key qaSession}
      <QuickAddSheet projectId={qa.projectId} columnId={qa.columnId} dueDate={qa.dueDate} on:close={() => (qa = null)} />
    {/key}
  {/if}

  {#if $toast}
    {#key $toast.id}
      <div class="snack" role="status" in:fly={snackIn} out:fly={snackOut}>
        <span>{$toast.text}</span>
        {#if $toast.undo}<button on:click={() => { const u = $toast?.undo; toast.set(null); u?.(); }}>Undo</button>{/if}
      </div>
    {/key}
  {/if}

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
    box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 40%, transparent);
    transition: transform var(--dur-hover) var(--ease-hover);
  }
  .fab :global(svg.i) { width: 24px; height: 24px; stroke-width: 2.2; }
  .fab:active { transform: scale(.95); }

  .snack {
    position: absolute; left: 12px; right: 12px; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); z-index: 20;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: var(--text); color: var(--bg); border-radius: 12px; padding: 12px 8px 12px 16px;
    font-size: 14.5px; box-shadow: 0 4px 20px rgba(0,0,0,.25);
  }
  .snack span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .snack button { font: inherit; font-weight: 700; color: color-mix(in srgb, var(--accent) 55%, var(--bg)); background: none; border: 0; padding: 6px 10px; border-radius: 8px; cursor: pointer; flex-shrink: 0; }

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
