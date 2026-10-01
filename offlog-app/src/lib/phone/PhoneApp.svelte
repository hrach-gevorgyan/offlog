<script lang="ts">
  import { tab, stack, arrival, switchTab, actions, TABS } from './nav';
  import type { Tab } from './nav';
  import { screenIn, pillIn } from '../motion';
  import { I } from './icons';
  import './phone.css';
  import { modalOpen } from '../store';
  import Home from './Home.svelte';
  import TaskListScreen from './TaskListScreen.svelte';
  import SearchScreen from './SearchScreen.svelte';
  import ProjectScreen from './ProjectScreen.svelte';
  import TopBar from './TopBar.svelte';
  import AgendaView from '../AgendaView.svelte';
  import FocusView from '../FocusView.svelte';

  $: top = $stack[$stack.length - 1];
  $: key = `${$tab}:${$stack.length}:${top.k}:${'id' in top ? top.id : ''}`;
  const LABEL: Record<Tab, string> = { home: 'Home', today: 'Today', agenda: 'Agenda', search: 'Search' };
</script>

<div class="phone-shell">
  <div class="screens">
    {#key key}
      <div class="screen" class:flush={top.k === 'home'} class:board={top.k === 'project'} class:reuse={top.k === 'agenda' || top.k === 'focus'} in:screenIn={{ kind: $arrival }}>
        {#if top.k === 'home'}
          <Home />
        {:else if top.k === 'today' || top.k === 'late' || top.k === 'pinned'}
          <TaskListScreen kind={top.k} root={top.k === 'today' && $stack.length === 1} />
        {:else if top.k === 'search'}
          <SearchScreen />
        {:else if top.k === 'project'}
          <ProjectScreen id={top.id} />
        {:else if top.k === 'agenda'}
          <div class="pad"><TopBar title="Agenda" root /></div>
          <AgendaView on:search={() => switchTab('search')} on:addTask={e => actions.quickAdd(e.detail)} />
        {:else if top.k === 'focus'}
          <div class="pad"><TopBar title="Focus" /></div>
          <FocusView on:search={() => switchTab('search')} />
        {/if}
      </div>
    {/key}
  </div>

  {#if !$modalOpen}<button class="fab" on:click={() => actions.quickAdd()} aria-label="Add a task">{@html I.plus}</button>{/if}

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
  .screen.board, .screen.reuse { padding: 0; display: flex; flex-direction: column; overflow: hidden; }
  .pad { padding: 0 16px; flex-shrink: 0; }
  /* Reused desktop views bring their own header; on the phone the top bar
     above replaces its menu button, title and command-palette button. */
  .reuse :global(.hamburger), .reuse :global(.palette-btn), .reuse :global(.fc-title), .reuse :global(.agenda-title) { display: none !important; }

  .fab {
    position: absolute; right: 16px; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); z-index: 10;
    width: 56px; height: 56px; border-radius: 50%; border: 0; cursor: pointer;
    background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 40%, transparent);
    transition: transform var(--dur-hover) var(--ease-hover);
  }
  .fab :global(svg.i) { width: 24px; height: 24px; stroke-width: 2.2; }
  .fab:active { transform: scale(.95); }

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
