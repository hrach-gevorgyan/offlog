<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { quickAddPop, scrimFade } from './motion';
  import { projects, reloadTasks, spaces, showError } from './store';
  import { createTask } from './db';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import CustomSelect from './CustomSelect.svelte';
  import { parseQuickAdd } from './nlpParse';
  import { fmtTime } from './utils';

  const dispatch = createEventDispatcher<{ close: void; created: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let title = '';
  let projectId = '';
  let projectManuallyChosen = false;
  let inputEl: HTMLInputElement;
  let saving = false;

  // pick a sensible default project
  $: if (!projectId && $projects.length) projectId = $projects[0]._id;

  $: projectOptions = $projects.map(p => {
    const sp = $spaces.find(s => s._id === p.space_id);
    return { value: p._id, label: p.name, group: sp?.name ?? '' };
  });

  // Live parse on every keystroke -- pure/cheap regex work, no debounce
  // needed. Only affects the dropdown's *selection*, never removes a
  // project the user picked by hand (projectManuallyChosen below), so
  // typing "@fitness" after already choosing a project from the dropdown
  // doesn't fight the user's explicit choice.
  $: parsed = parseQuickAdd(title, $projects);
  $: if (parsed.projectId && !projectManuallyChosen) projectId = parsed.projectId;

  function onProjectChange() { projectManuallyChosen = true; }

  const PRIORITY_LABEL: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };

  // Syntax cheat-sheet popover -- a lightweight local popover (outside-
  // click + its own Escape handling), not a closeOnBack()-tracked overlay:
  // it's inline help anchored to a button, the same class of UI as
  // CustomSelect's own dropdown, not a real modal blocking the rest of the
  // app. Mirrors CustomSelect.svelte's onWindowClick/Escape pattern.
  let showHelp = false;
  let helpTriggerEl: HTMLButtonElement;
  let helpPanelEl: HTMLDivElement;
  function toggleHelp() { showHelp = !showHelp; }
  function onWindowClickForHelp(e: MouseEvent) {
    if (!showHelp) return;
    const t = e.target as Node;
    if (helpTriggerEl?.contains(t) || helpPanelEl?.contains(t)) return;
    showHelp = false;
  }
  // Escape closes the help popover even when focus isn't in the title
  // input (e.g. it's on the ? button itself) -- the input's own onKey
  // below covers the common case where focus stayed put while typing.
  function onWindowKeyForHelp(e: KeyboardEvent) {
    if (showHelp && e.key === 'Escape') showHelp = false;
  }

  onMount(async () => { await tick(); inputEl?.focus(); });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (showHelp) { showHelp = false; return; } requestClose(); }
    if (e.key === 'Enter') doAdd();
  }

  async function doAdd() {
    const t = parsed.title;
    if (!t || !projectId) return;
    saving = true;
    const proj = $projects.find(p => p._id === projectId);
    if (!proj) { saving = false; return; }
    const firstCol = proj.columns[0].id;
    try {
      await createTask(projectId, proj.space_id, firstCol, t, {
        priority: parsed.priority ?? undefined,
        due_date: parsed.due_date,
        reminder_at: parsed.reminder_at,
        tags: parsed.tags.length ? parsed.tags : undefined,
      });
      await reloadTasks();
      title = '';
      projectManuallyChosen = false;
      dispatch('created');
      requestClose();
    } catch {
      showError('Failed to create task. Please try again.');
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window on:click={onWindowClickForHelp} on:keydown={onWindowKeyForHelp} />

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click={() => requestClose()} transition:fade={scrimFade}></div>

<div class="panel" use:trapFocus transition:quickAddPop>
  <div class="panel-head">
    <div class="panel-title">Quick add task</div>
    <button
      bind:this={helpTriggerEl}
      class="help-btn"
      class:active={showHelp}
      on:click={toggleHelp}
      aria-label="Quick add syntax help"
      aria-expanded={showHelp}
      aria-controls="quickadd-help-panel"
    >?</button>
  </div>

  {#if showHelp}
    <div id="quickadd-help-panel" class="help-panel" role="note" bind:this={helpPanelEl} transition:fade={{ duration: 100 }}>
      <div class="help-title">Type it in plain text — Quick Add picks these out automatically:</div>
      <dl class="help-list">
        <dt>Date</dt><dd><code>tomorrow</code>, <code>friday</code>, <code>next fri</code>, <code>in 3 days</code>, <code>aug 3</code></dd>
        <dt>Time</dt><dd><code>at 5pm</code>, <code>17:30</code> — sets a reminder</dd>
        <dt>Priority</dt><dd><code>!high</code>, <code>!low</code>, <code>!!</code>, <code>!!!</code></dd>
        <dt>Tag</dt><dd><code>#errand</code> — repeat for more than one</dd>
        <dt>Project</dt><dd><code>@fitness</code> — matches a project by name</dd>
        <dt>Escape</dt><dd><code>\#</code> <code>\@</code> <code>\!</code> keep one character literal; wrap the whole title in <code>"quotes"</code> to turn parsing off entirely</dd>
      </dl>
      <div class="help-example">"Log workout tomorrow at 6am !high #fitness @fitness"</div>
    </div>
  {/if}

  <input
    bind:this={inputEl}
    bind:value={title}
    class="title-input"
    placeholder="Task title… try “tomorrow 5pm !high #errand @project”"
    enterkeyhint="done"
    on:keydown={onKey}
  />

  {#if parsed.raw}
    <div class="parsed-chips">
      <span class="chip chip-raw">Quoted — parsing off</span>
    </div>
  {:else if parsed.due_date || parsed.priority || parsed.tags.length || parsed.matchedProjectLabel}
    <div class="parsed-chips">
      {#if parsed.due_date}
        <span class="chip chip-date">
          {new Date(`${parsed.due_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {#if parsed.reminder_at}· {fmtTime(new Date(parsed.reminder_at))}{/if}
        </span>
      {/if}
      {#if parsed.priority}<span class="chip chip-priority">{PRIORITY_LABEL[parsed.priority]}</span>{/if}
      {#each parsed.tags as tag}<span class="chip chip-tag">#{tag}</span>{/each}
      {#if parsed.matchedProjectLabel}<span class="chip chip-project">→ {parsed.matchedProjectLabel}</span>{/if}
    </div>
  {/if}

  <div class="row">
    <div class="proj-select-wrap">
      <CustomSelect options={projectOptions} bind:value={projectId} placement="up" on:change={onProjectChange} />
    </div>

    <div class="actions">
      <button class="cancel-btn" on:click={() => requestClose()}>Cancel</button>
      <button class="add-btn" on:click={doAdd} disabled={!parsed.title || saving}>
        {saving ? 'Adding…' : 'Add task'}
      </button>
    </div>
  </div>
</div>

<style>
  /* .scrim is defined globally in app.css */

  .panel {
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    width: min(480px, 95vw); z-index: 501;
    background: var(--surface); border: 1px solid var(--border-strong);
    border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.28);
    padding: 16px 18px; display: flex; flex-direction: column; gap: 12px;
  }

  .panel-head { display: flex; align-items: center; justify-content: space-between; }
  .panel-title { font-size: 11px; font-family: var(--mono); text-transform: uppercase; letter-spacing: .08em; color: var(--faint); font-weight: 700; }

  .help-btn {
    width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--border-strong);
    background: none; color: var(--faint); font-size: 11px; font-weight: 700;
    line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: color .12s, border-color .12s, background .12s;
  }
  .help-btn:hover, .help-btn.active { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }

  .help-panel {
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--bg); padding: 10px 12px; font-size: 12px;
  }
  .help-title { color: var(--muted); margin-bottom: 8px; line-height: 1.4; }
  .help-list { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 0; }
  .help-list dt { color: var(--faint); font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; align-self: baseline; }
  .help-list dd { margin: 0; color: var(--text); }
  .help-list code {
    font-family: var(--mono); font-size: 11px; background: var(--col-bg);
    padding: 1px 5px; border-radius: 4px; color: var(--accent);
  }
  .help-example { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); color: var(--faint); font-style: italic; font-size: 11px; }

  .title-input {
    width: 100%; border: 1.5px solid var(--border-strong); border-radius: var(--radius-sm);
    padding: .55rem .7rem; font-size: 15px; font-family: inherit;
    background: var(--bg); color: var(--text); outline: none;
    transition: border-color .12s;
    box-sizing: border-box;
  }
  .title-input:focus { border-color: var(--accent); background: var(--surface); }
  .title-input::placeholder { color: var(--faint); }

  /* Live preview of what nlpParse.ts picked out of the title -- only
     rendered when something was actually recognized, so a plain-text
     quick add (the common case) shows nothing extra. */
  .parsed-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: -4px; }
  .chip {
    font-family: var(--mono); font-size: 10.5px; font-weight: 600;
    letter-spacing: .02em; padding: 3px 8px; border-radius: 20px;
    background: var(--col-bg); color: var(--muted);
  }
  .chip-date { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  .chip-priority { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
  .chip-tag { background: var(--col-bg); color: var(--muted); }
  .chip-project { background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); }
  .chip-raw { background: var(--col-bg); color: var(--faint); font-style: italic; }

  .row { display: flex; align-items: center; gap: 10px; }

  .proj-select-wrap { flex: 1; min-width: 0; }

  .actions { display: flex; gap: 7px; flex-shrink: 0; }

  .cancel-btn {
    padding: .42rem .85rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--muted); font-size: .85rem; font-weight: 500;
  }
  .cancel-btn:hover { color: var(--text); }

  .add-btn {
    padding: .42rem .85rem; border-radius: var(--radius-sm);
    border: none; cursor: pointer;
    background: var(--accent); color: var(--on-accent); font-size: .85rem; font-weight: 600;
    transition: opacity .12s;
  }
  .add-btn:disabled { opacity: .45; cursor: default; }
  .add-btn:not(:disabled):hover { opacity: .88; }
</style>
