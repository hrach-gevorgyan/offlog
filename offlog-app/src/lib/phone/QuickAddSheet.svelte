<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import type { TaskDoc } from '../types';
  import { projects, spaces, reloadTasks, showError } from '../store';
  import { createTask, findTasksByTitleInProject, ensureFreshTagColor } from '../db';
  import { parseQuickAdd } from '../nlpParse';
  import { PRIORITY_LABEL, PRIORITY_COLOR } from '../constants';
  import { confirmRequest } from '../confirm';
  import { fmtTime, localDateStr } from '../utils';
  import { duePill, shortDate } from './format';
  import { I } from './icons';
  import { showToast } from './nav';
  import { soften } from '../tagColors';
  import Sheet from './Sheet.svelte';
  import Pick from './task/Pick.svelte';
  import Panel from './quickadd/Panel.svelte';
  import DuePanel from './quickadd/DuePanel.svelte';
  import ReminderPanel from './quickadd/ReminderPanel.svelte';
  import ProjectPanel from './quickadd/ProjectPanel.svelte';
  import TagsPanel from './quickadd/TagsPanel.svelte';

  // Opened from a project (and its status) or from an Agenda day.
  export let projectId: string | null = null;
  export let columnId: string | null = null;
  export let dueDate: string | null = null;

  const dispatch = createEventDispatcher<{ created: TaskDoc; close: void }>();

  let sheet: Sheet;
  let input: HTMLInputElement;
  let text = '';
  let saving = false;
  let showHelp = false;

  type PanelKind = 'due' | 'project' | 'priority' | 'tags' | 'reminder';
  const PANEL_TITLE: Record<PanelKind, string> = { due: 'Date', project: 'Project', priority: 'Priority', tags: 'Tags', reminder: 'Reminder' };
  let panel: PanelKind | null = null;
  let panelSession = 0;
  let panelRef: Panel | undefined;
  let panelEl: HTMLDivElement;
  let afterPanel: (() => void) | null = null;

  // A value picked in a panel beats the same thing typed in the text;
  // undefined = never picked. The typed token still leaves the title.
  let pickedProject: string | undefined;
  let pickedDue: string | null | undefined;
  let pickedPriority: 1 | 2 | 3 | null | undefined;
  let pickedReminder: string | null | undefined;
  let addedTags: string[] = [];
  let removedTags: string[] = [];

  $: parsed = parseQuickAdd(text, $projects);
  const exists = (id: string | null | undefined) => !!id && $projects.some(p => p._id === id);
  $: targetId = (exists(pickedProject) && pickedProject)
    || parsed.projectId
    || (exists(projectId) && projectId)
    || $projects[0]?._id || null;
  $: project = $projects.find(p => p._id === targetId);
  $: space = $spaces.find(s => s._id === project?.space_id);
  // A typed date also beats the prefilled one.
  $: due = pickedDue !== undefined ? pickedDue : parsed.due_date ?? dueDate;
  $: priority = pickedPriority !== undefined ? pickedPriority : parsed.priority;
  $: reminder = pickedReminder !== undefined ? pickedReminder : parsed.reminder_at;
  $: tags = [...parsed.tags.filter(t => !removedTags.includes(t)), ...addedTags.filter(t => !parsed.tags.includes(t))];
  // Highlighted only once the project was chosen, by hand or by @mention.
  $: projectSet = exists(pickedProject) || !!parsed.projectId;

  function dueText(d: string | null): string {
    if (!d) return 'No date';
    return d < localDateStr(new Date()) ? shortDate(d) : duePill(d)!.text;
  }
  function reminderText(iso: string): string {
    const d = new Date(iso), day = localDateStr(d);
    return day === localDateStr(new Date()) ? fmtTime(d) : `${dueText(day)} ${fmtTime(d)}`;
  }
  $: tagText = tags.length ? `#${tags[0]}${tags.length > 1 ? ` +${tags.length - 1}` : ''}` : 'Tag';

  const PRIORITIES = [
    ...([3, 2, 1] as const).map(p => ({ value: String(p), label: PRIORITY_LABEL[p], dot: soften(PRIORITY_COLOR[p]) })),
    { value: '', label: 'None' },
  ];

  // Hint only, never blocking: a same-titled task in the target project.
  let dupHint = '';
  let dupTimer: ReturnType<typeof setTimeout> | undefined;
  $: { clearTimeout(dupTimer); dupTimer = setTimeout(() => checkDup(parsed.title, targetId), 350); }
  async function checkDup(t: string, pid: string | null) {
    if (!t || !pid) { dupHint = ''; return; }
    try {
      const m = await findTasksByTitleInProject(pid, t);
      dupHint = m.length ? `${$projects.find(p => p._id === pid)?.name ?? 'This project'} already has a task with this name.` : '';
    } catch { dupHint = ''; }
  }

  // A panel and the keyboard never share the screen: the WebView shrinks
  // by the keyboard's height (adjustResize), which left a panel no room.
  // Opening a panel drops the keyboard; leaving one by a pick, Done or a
  // tap on the title brings it back. Switching panels keeps it down.
  function openPanel(k: PanelKind) { input?.blur(); showHelp = false; panelSession++; panel = k; }
  function closePanel() { panelRef?.close(); }
  function onChip(k: PanelKind) {
    if (panel === k) toTitle();
    else if (panel) { afterPanel = () => openPanel(k); closePanel(); }
    else openPanel(k);
  }
  // Focus inside the tap's own handler: Android raises the keyboard only
  // for a focus() made during a user gesture.
  function toTitle() { input?.focus(); closePanel(); }
  function onTitleFocus() { if (panel) closePanel(); }
  async function onPanelClosed() {
    panel = null;
    const next = afterPanel;
    afterPanel = null;
    if (next) { next(); return; }
    await tick();
    if (!panel) input?.focus();
  }
  // The panel's history layer sits above the sheet's, so it goes first.
  function closeSheet() {
    if (panel) { afterPanel = () => sheet?.close(); closePanel(); }
    else sheet?.close();
  }

  function pickDue(v: string) { pickedDue = v || null; toTitle(); }
  function pickPriority(v: string) { pickedPriority = v ? (Number(v) as 1 | 2 | 3) : null; toTitle(); }
  function pickProject(id: string) { pickedProject = id; toTitle(); }
  function pickReminder(v: string) { pickedReminder = v || null; toTitle(); }
  function toggleTag(t: string) {
    if (tags.includes(t)) {
      if (addedTags.includes(t)) addedTags = addedTags.filter(x => x !== t);
      else removedTags = [...removedTags, t];
    } else if (removedTags.includes(t)) removedTags = removedTags.filter(x => x !== t);
    else addedTags = [...addedTags, t];
  }

  // Add and ? leave the title focused, so the keyboard does not drop and
  // rise again under the finger.
  const holdFocus = (e: MouseEvent) => e.preventDefault();

  // Escape and the scrim close an open panel before the sheet: both are
  // caught in the capture phase, ahead of the sheet's own handlers.
  function onKeyCapture(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !panel || e.defaultPrevented || get(confirmRequest)) return;
    e.preventDefault();
    // An open calendar popover closes itself first.
    if (panelEl?.querySelector('.cal-popover')) return;
    closePanel();
  }
  function onClickCapture(e: MouseEvent) {
    if (!panel || !(e.target as Element).classList?.contains('psheet-scrim')) return;
    e.stopPropagation();
    closeSheet();
  }

  onMount(async () => {
    window.addEventListener('keydown', onKeyCapture, true);
    window.addEventListener('click', onClickCapture, true);
    await tick();
    // A chip tapped before this tick already took the keyboard down.
    if (!panel) input?.focus();
  });
  onDestroy(() => {
    clearTimeout(dupTimer);
    window.removeEventListener('keydown', onKeyCapture, true);
    window.removeEventListener('click', onClickCapture, true);
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }

  async function add() {
    const t = parsed.title, p = project, tagList = tags;
    if (!t || !p || saving) return;
    // A status only applies inside the project it was opened from.
    const col = p._id === projectId && columnId && p.columns.some(c => c.id === columnId) ? columnId : p.columns[0]?.id;
    if (!col) return;
    const overrides = {
      priority: priority ?? undefined,
      due_date: due,
      reminder_at: reminder,
      tags: tagList.length ? tagList : undefined,
    };
    saving = true;
    try {
      // Sequential and before createTask: each new tag must see the colour
      // the previous one just claimed, and must not yet exist on a task.
      for (const tag of tagList) {
        try { await ensureFreshTagColor(tag, tagList.filter(x => x !== tag)); }
        catch (e) { console.warn('tag color assignment failed', e); }
      }
      const doc = await createTask(p._id, p.space_id, col, t, overrides);
      await reloadTasks();
      text = '';
      dispatch('created', doc);
      closeSheet();
      // No Undo here: deleteTask would raise its own undo toast and leave
      // the task in the Recycle bin.
      showToast(`Added to ${p.name}`);
    } catch {
      showError('Failed to create task. Please try again.');
    } finally {
      saving = false;
    }
  }
</script>

<Sheet bind:this={sheet} label="Add a task" on:close>
  <!-- One column capped at the sheet's own room: the compose row and chips
       stay put; only the help or the panel below them scrolls. -->
  <div class="qa-root">
    <div class="compose">
      <input
        bind:this={input} bind:value={text} class="qa" placeholder="What needs doing?"
        autocomplete="off" enterkeyhint="done" aria-label="Task title" on:keydown={onKey} on:focus={onTitleFocus}
      />
      <button class="send" on:mousedown={holdFocus} on:click={add} disabled={!parsed.title || !project || saving} aria-label="Add">{@html I.up}</button>
    </div>

    <div class="p-chips chips">
      <button class="p-chip" class:on={!!due} aria-expanded={panel === 'due'} on:click={() => onChip('due')} aria-label="Due: {dueText(due)}">{@html I.today}{due ? dueText(due) : 'Date'}</button>
      <button class="p-chip" class:on={projectSet} aria-expanded={panel === 'project'} on:click={() => onChip('project')} aria-label="Project: {project?.name ?? 'none'}">
        {#if space}<span class="p-dot" style="background:{soften(space.color)}"></span>{/if}{project?.name ?? 'No project'}
      </button>
      <button class="p-chip" class:on={!!priority} aria-expanded={panel === 'priority'} on:click={() => onChip('priority')} aria-label="Priority: {priority ? PRIORITY_LABEL[priority] : 'not set'}">{@html I.flag}{priority ? PRIORITY_LABEL[priority] : 'Priority'}</button>
      <button class="p-chip" class:on={tags.length > 0} aria-expanded={panel === 'tags'} on:click={() => onChip('tags')} aria-label="Tags: {tags.length ? tags.join(', ') : 'none'}">{@html I.tag}{tagText}</button>
      <button class="p-chip" class:on={!!reminder} aria-expanded={panel === 'reminder'} on:click={() => onChip('reminder')} aria-label="Reminder: {reminder ? reminderText(reminder) : 'none'}">{@html I.bell}{#if reminder}{reminderText(reminder)}{/if}</button>
      <button class="p-chip help" class:on={showHelp} on:mousedown={holdFocus} on:click={() => (showHelp = !showHelp)} aria-label="Quick add syntax help" aria-expanded={showHelp}>?</button>
    </div>

    {#if parsed.raw || !project}
      <p class="note">{#if !project}Create a project first{:else}Quoted, parsing off{/if}</p>
    {/if}
    {#if dupHint}<p class="warn">{dupHint}</p>{/if}

    {#if showHelp}
      <div class="helpbox" role="note">
        <p>Type it in plain text. These are picked out for you:</p>
        <dl>
          <dt>Date</dt><dd><code>tomorrow</code>, <code>friday</code>, <code>next fri</code>, <code>in 3 days</code>, <code>aug 3</code></dd>
          <dt>Time</dt><dd><code>at 5pm</code>, <code>17:30</code> sets a reminder</dd>
          <dt>Priority</dt><dd><code>!high</code>, <code>!low</code>, <code>!!</code>, <code>!!!</code></dd>
          <dt>Tag</dt><dd><code>#errand</code>, repeat for more</dd>
          <dt>Project</dt><dd><code>@fitness</code> matches a project by name</dd>
          <dt>Escape</dt><dd><code>\#</code> <code>\@</code> <code>\!</code> keep one character; wrap the whole title in <code>"quotes"</code> to turn parsing off</dd>
        </dl>
      </div>
    {/if}

    {#if panel}
      <div class="pick" bind:this={panelEl}>
        {#key panelSession}
          <Panel bind:this={panelRef} title={PANEL_TITLE[panel]} on:close={onPanelClosed} on:done={toTitle}>
            {#if panel === 'due'}
              <DuePanel value={due} on:pick={e => pickDue(e.detail)} />
            {:else if panel === 'priority'}
              <Pick options={PRIORITIES} current={priority ? String(priority) : ''} on:pick={e => pickPriority(e.detail)} />
            {:else if panel === 'project'}
              <ProjectPanel current={targetId} on:pick={e => pickProject(e.detail)} />
            {:else if panel === 'tags'}
              <TagsPanel selected={tags} on:toggle={e => toggleTag(e.detail)} on:add={e => toggleTag(e.detail)} />
            {:else}
              <ReminderPanel value={reminder} on:pick={e => pickReminder(e.detail)} on:set={e => (pickedReminder = e.detail || null)} />
            {/if}
          </Panel>
        {/key}
      </div>
    {/if}
  </div>
</Sheet>

<style>
  /* Sheet.svelte: max-height 88dvh, a 27px handle zone, 16px + safe-area
     bottom padding. The WebView resizes with the keyboard (adjustResize),
     so dvh is the room actually left above it. */
  .qa-root {
    display: flex; flex-direction: column;
    max-height: calc(88dvh - 27px - 16px - env(safe-area-inset-bottom, 0px));
  }
  .compose, .chips, .note, .warn { flex: none; }
  .compose { display: flex; align-items: center; gap: 8px; }
  .qa { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--text); font: inherit; font-size: var(--p-fs-xl); padding: 10px 4px; }
  .qa::placeholder { color: var(--faint); }
  .send {
    width: 44px; height: 44px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; flex-shrink: 0;
    background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center;
  }
  .send:not(:disabled):active { filter: brightness(.94); }
  .send:disabled { opacity: .4; cursor: default; }
  /* A scrolling row clips overflow on both axes; padding keeps the chips'
     44px tap extension inside it. */
  .p-chips { padding: 7px 0; margin: 2px 0 -3px; }
  .chips .p-chip { min-height: 36px; flex-shrink: 0; }
  .chips .p-chip::before { top: -4px; bottom: -4px; }
  .chips .p-chip[aria-expanded="true"] { box-shadow: inset 0 0 0 1.5px var(--accent); }
  .help { min-width: 44px; justify-content: center; font-weight: 700; }
  .note, .warn { font-size: var(--p-fs-s); margin: 6px 4px 0; }
  .note { color: var(--faint); }
  .warn { color: var(--overdue-ink); }
  /* Shrinkable: they give way before the compose row or the chips do. */
  .helpbox, .pick { flex: 0 1 auto; min-height: 0; margin-top: 10px; }
  .helpbox { overflow-y: auto; overscroll-behavior: contain; background: var(--surface); border-radius: 12px; padding: 10px 12px; font-size: var(--p-fs-s); color: var(--muted); }
  .helpbox p { margin: 0 0 8px; }
  .helpbox dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 10px; margin: 0; }
  .helpbox dt { color: var(--faint); font-size: var(--p-fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .helpbox dd { margin: 0; color: var(--text); }
  .helpbox code { font-family: var(--mono); font-size: var(--p-fs-xs); background: var(--col-bg); padding: 1px 5px; border-radius: 4px; color: var(--accent); }
  .pick { display: flex; flex-direction: column; }
</style>
