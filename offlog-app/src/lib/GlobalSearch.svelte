<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { searchAllTasks } from './db';
  import { projects } from './store';
  import type { TaskDoc, ProjectDoc } from './types';
  import type { Command } from './commands';
  import { PRIORITY_COLOR, PRIORITY_LABEL } from './constants';
  import { closeOnBack, discardTop } from './modalStack';
  import { trapFocus } from './focusTrap';

  export let commands: Command[] = [];

  const dispatch = createEventDispatcher<{ open: { task: TaskDoc; project: ProjectDoc }; close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let query = '';
  let results: (TaskDoc & { project_name: string })[] = [];
  let searching = false;
  let inputEl: HTMLInputElement;
  let selectedIdx = 0;

  onMount(() => { inputEl?.focus(); });

  // Same plain substring matching as searchAllTasks() (db.ts) — no fuzzy
  // library, kept consistent with the rest of the app's search.
  $: matchingCommands = query.trim()
    ? commands.filter(c => (c.label + ' ' + c.keywords).toLowerCase().includes(query.trim().toLowerCase()))
    : commands;
  // Commands and task results share one keyboard-navigable list —
  // commands first since they're instant actions, tasks below.
  $: combinedLength = matchingCommands.length + results.length;

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
      selectedIdx = 0;
      searching = false;
    }
  }

  function openResult(r: TaskDoc & { project_name: string }) {
    const proj = $projects.find(p => p._id === r.project_id);
    if (!proj) return;
    // discardTop(), not requestClose() — this search panel is being
    // immediately replaced by the task's CardDetail, not dismissed
    // outright. See modalStack.ts's discardTop() comment for why routing
    // this through history.back() races the CardDetail that's about to
    // mount and push its own entry.
    discardTop();
    dispatch('open', { task: r, project: proj });
  }

  function runCommand(c: Command) {
    requestClose();
    c.run();
  }

  function selectAt(i: number) {
    if (i < matchingCommands.length) runCommand(matchingCommands[i]);
    else if (results[i - matchingCommands.length]) openResult(results[i - matchingCommands.length]);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { requestClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, combinedLength - 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); }
    if (e.key === 'Enter' && combinedLength > 0) selectAt(selectedIdx);
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // r.title is sync-derived, untrusted data (can arrive from another
  // device) — must be HTML-escaped before the <mark> wrap, not after,
  // since this string is rendered via {@html}. Escaping first then
  // matching against the escaped text keeps offsets correct because
  // escapeHtml() only ever expands '&' '<' '>', never removes/reorders
  // characters the query could span.
  function highlight(text: string, q: string): string {
    const escaped = escapeHtml(text);
    if (!q.trim()) return escaped;
    const re = new RegExp(`(${escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(re, '<mark>$1</mark>');
  }

  const today = new Date().toISOString().slice(0, 10);
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click={() => requestClose()}></div>

<div class="search-panel" use:trapFocus>
  <div class="search-bar">
    <svg class="search-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>
    </svg>
    <input
      bind:this={inputEl}
      bind:value={query}
      class="search-input"
      placeholder="Search tasks or run a command…"
      on:keydown={onKey}
    />
    {#if query}
      <button class="clear-btn" on:click={() => { query = ''; inputEl.focus(); }}>✕</button>
    {/if}
  </div>

  <!-- Keyboard interaction (arrows + Enter) is handled by the search input
       above, listbox-style — rows themselves are mouse targets only.
       Commands and task results share one combined index (commands first)
       so arrow keys move through both as a single list. -->
  <div class="results" role="listbox" aria-label="Commands and search results">
    {#if matchingCommands.length > 0}
      <div class="section-label">Commands</div>
      {#each matchingCommands as c, i (c.id)}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div
          class="result-row"
          role="option"
          aria-selected={i === selectedIdx}
          tabindex="-1"
          class:selected={i === selectedIdx}
          on:click={() => runCommand(c)}
          on:mouseenter={() => selectedIdx = i}
        >
          <span class="cmd-icon">⌘</span>
          <div class="result-body">
            <span class="result-title">{@html highlight(c.label, query)}</span>
          </div>
        </div>
      {/each}
    {/if}

    {#if results.length > 0}
      {#if matchingCommands.length > 0}<div class="section-label">Tasks</div>{/if}
      {#each results as r, ri (r._id)}
        {@const i = matchingCommands.length + ri}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div
          class="result-row"
          role="option"
          aria-selected={i === selectedIdx}
          tabindex="-1"
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
    {/if}

    {#if searching}
      <div class="hint">Searching…</div>
    {:else if query.trim() && combinedLength === 0}
      <div class="hint">No results for "{query}"</div>
    {/if}
  </div>

  <div class="footer">
    <span>↑↓ navigate</span>
    <span>↵ open</span>
    <span>Esc close</span>
  </div>
</div>

<style>
  /* .scrim is defined globally in app.css */

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

  .section-label {
    padding: 8px 16px 4px; font-family: var(--mono); font-size: 10px;
    text-transform: uppercase; letter-spacing: .08em; color: var(--faint);
  }

  .cmd-icon {
    width: 16px; flex-shrink: 0; text-align: center; color: var(--accent);
    font-size: 13px;
  }

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
  .result-title :global(mark) { background: color-mix(in srgb, var(--accent) 25%, transparent); color: var(--accent); border-radius: 2px; padding: 0 1px; }
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
