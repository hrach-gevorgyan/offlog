<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { searchAllTasks } from './db';
  import { projects } from './store';
  import type { TaskDoc, ProjectDoc } from './types';
  import { PRIORITY_COLOR, PRIORITY_LABEL } from './constants';

  const dispatch = createEventDispatcher<{ open: { task: TaskDoc; project: ProjectDoc }; close: void }>();

  let query = '';
  let results: (TaskDoc & { project_name: string })[] = [];
  let searching = false;
  let inputEl: HTMLInputElement;
  let selectedIdx = 0;

  onMount(() => { inputEl?.focus(); });

  let debounce: ReturnType<typeof setTimeout> | undefined;
  $: {
    clearTimeout(debounce);
    if (query.trim().length >= 1) {
      searching = true;
      debounce = setTimeout(async () => {
        results = await searchAllTasks(query);
        selectedIdx = 0;
        searching = false;
      }, 180);
    } else {
      results = [];
      searching = false;
    }
  }

  function openResult(r: TaskDoc & { project_name: string }) {
    const proj = $projects.find(p => p._id === r.project_id);
    if (!proj) return;
    dispatch('open', { task: r, project: proj });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { dispatch('close'); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, results.length - 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); }
    if (e.key === 'Enter' && results[selectedIdx]) openResult(results[selectedIdx]);
  }

  function highlight(text: string, q: string): string {
    if (!q.trim()) return text;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<mark>$1</mark>');
  }

  const today = new Date().toISOString().slice(0, 10);
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click={() => dispatch('close')}></div>

<div class="search-panel">
  <div class="search-bar">
    <svg class="search-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>
    </svg>
    <input
      bind:this={inputEl}
      bind:value={query}
      class="search-input"
      placeholder="Search all projects…"
      on:keydown={onKey}
    />
    {#if query}
      <button class="clear-btn" on:click={() => { query = ''; inputEl.focus(); }}>✕</button>
    {/if}
  </div>

  <div class="results">
    {#if searching}
      <div class="hint">Searching…</div>
    {:else if query.trim() && results.length === 0}
      <div class="hint">No results for "{query}"</div>
    {:else if results.length > 0}
      {#each results as r, i (r._id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="result-row"
          class:selected={i === selectedIdx}
          on:click={() => openResult(r)}
          on:mouseenter={() => selectedIdx = i}
        >
          <span class="prio-bar" style="background:{PRIORITY_COLOR[r.priority]}"></span>
          <div class="result-body">
            <span class="result-title">{@html highlight(r.title, query)}</span>
            {#if r.tags?.length}
              <span class="result-tags">{r.tags.join(' · ')}</span>
            {/if}
          </div>
          <div class="result-meta">
            <span class="result-proj">{r.project_name}</span>
            {#if r.due_date}
              <span class="result-due" class:overdue={r.due_date < today}>{r.due_date}</span>
            {/if}
          </div>
        </div>
      {/each}
    {:else}
      <div class="hint">Type to search tasks across all projects</div>
    {/if}
  </div>

  <div class="footer">
    <span>↑↓ navigate</span>
    <span>↵ open</span>
    <span>Esc close</span>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 400; }

  .search-panel {
    position: fixed; top: 15vh; left: 50%; transform: translateX(-50%);
    width: min(580px, 95vw); z-index: 401;
    background: var(--surface); border: 1px solid var(--border-strong);
    border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.28);
    display: flex; flex-direction: column; overflow: hidden;
    animation: pop-in .18s cubic-bezier(0.4,0,0.2,1) both;
  }
  @keyframes pop-in { from { opacity:0; transform: translateX(-50%) scale(.96); } to { opacity:1; transform: translateX(-50%) scale(1); } }

  .search-bar {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; border-bottom: 1px solid var(--border);
  }
  .search-icon { color: var(--faint); flex-shrink: 0; }
  .search-input {
    flex: 1; border: none; background: none; outline: none;
    font-size: 16px; color: var(--text); font-family: inherit;
  }
  .search-input::placeholder { color: var(--faint); }
  .clear-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 13px; padding: 2px 5px;
    border-radius: 4px; transition: color .1s;
  }
  .clear-btn:hover { color: var(--text); }

  .results { max-height: 55vh; overflow-y: auto; }

  .result-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; cursor: pointer;
    border-bottom: 1px solid var(--border); transition: background .08s;
  }
  .result-row:last-child { border-bottom: none; }
  .result-row.selected { background: var(--hover); }

  .prio-bar { width: 3px; height: 32px; border-radius: 2px; flex-shrink: 0; }

  .result-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .result-title { font-size: 14px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .result-title :global(mark) { background: rgba(93,155,255,.25); color: var(--accent); border-radius: 2px; padding: 0 1px; }
  .result-tags { font-size: 11px; color: var(--faint); font-family: var(--mono); }

  .result-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
  .result-proj { font-family: var(--mono); font-size: 10.5px; color: var(--faint); white-space: nowrap; }
  .result-due { font-family: var(--mono); font-size: 10.5px; color: var(--muted); }
  .result-due.overdue { color: var(--danger); }

  .hint { padding: 24px 16px; text-align: center; color: var(--faint); font-size: 13.5px; }

  .footer {
    display: flex; gap: 16px; padding: 8px 16px;
    border-top: 1px solid var(--border);
    font-family: var(--mono); font-size: 10.5px; color: var(--faint);
  }
</style>
