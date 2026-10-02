<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, afterUpdate, tick } from 'svelte';
  import { get } from 'svelte/store';
  import type { TaskDoc } from '../types';
  import { projects, spaces, reloadTasks, showError } from '../store';
  import { createTask, findTasksByTitleInProject, ensureFreshTagColor } from '../db';
  import { parseQuickAdd, type ParsedSpan, type ParsedSpanKind } from '../nlpParse';
  import { lastProject, rememberProject, keyboardHeight, trackKeyboard } from './quickadd/memory';
  import { PRIORITY_LABEL, PRIORITY_COLOR } from '../constants';
  import { confirmRequest } from '../confirm';
  import { fmtTime, localDateStr } from '../utils';
  import { duePill, shortDate } from './format';
  import { I } from './icons';
  import { showToast } from './nav';
  import { soften } from '../tagColors';
  import Sheet from './Sheet.svelte';
  import { fade, slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';
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

  $: parsed = parseQuickAdd(text, $projects, new Date(), dueDate ? new Date(dueDate + 'T12:00:00') : undefined);
  const exists = (id: string | null | undefined) => !!id && $projects.some(p => p._id === id);
  const remembered = lastProject();
  $: targetId = (exists(pickedProject) && pickedProject)
    || parsed.projectId
    || (exists(projectId) && projectId)
    || (exists(remembered) && remembered)
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

  // Set chips lead, so a value just parsed is on screen rather than past the
  // row's edge; otherwise Reminder sits next to Date. A newly set chip
  // scrolls the row back to its start.
  const CHIP_ORDER: PanelKind[] = ['due', 'reminder', 'project', 'priority', 'tags'];
  let chipOn: Record<PanelKind, boolean>;
  $: chipOn = { due: !!due, reminder: !!reminder, project: projectSet, priority: !!priority, tags: tags.length > 0 };
  $: chipList = [...CHIP_ORDER.filter(k => chipOn[k]), ...CHIP_ORDER.filter(k => !chipOn[k])];
  let chipsEl: HTMLDivElement;
  let setCount = 0, fadeEnd = false;
  $: revealSet(CHIP_ORDER.filter(k => chipOn[k]).length);
  function revealSet(n: number) {
    if (n > setCount && chipsEl) chipsEl.scrollLeft = 0;
    setCount = n;
  }
  function updateFade() {
    fadeEnd = !!chipsEl && chipsEl.scrollLeft + chipsEl.clientWidth < chipsEl.scrollWidth - 1;
  }

  // The input's own text is transparent; a mirror behind it draws the same
  // text with recognised tokens tinted. Both must share every metric that
  // affects glyph placement (font, size, line-height, padding), and the
  // mirror follows the input's horizontal scroll.
  let mirror: HTMLDivElement;
  $: segments = toSegments(text, parsed.spans);
  function toSegments(t: string, spans: ParsedSpan[]) {
    const out: { text: string; kind: ParsedSpanKind | null }[] = [];
    let i = 0;
    for (const s of spans) {
      if (s.start > i) out.push({ text: t.slice(i, s.start), kind: null });
      out.push({ text: t.slice(s.start, s.end), kind: s.kind });
      i = s.end;
    }
    // A trailing space keeps the mirror's scroll range at least the input's.
    out.push({ text: t.slice(i) + ' ', kind: null });
    return out;
  }
  function syncScroll() { if (mirror && input) mirror.scrollLeft = input.scrollLeft; }
  let syncFrame = 0;
  const onSelectionChange = () => { cancelAnimationFrame(syncFrame); syncFrame = requestAnimationFrame(syncScroll); };
  afterUpdate(() => { syncScroll(); updateFade(); });

  // Tapping a highlighted token offers to keep it as text: a backslash goes
  // in front of it (the parser's own escape), so the choice survives any
  // later edit and stays visible and undoable in the text itself.
  let keep: { span: ParsedSpan; word: string } | null = null;
  function onTitleTap() {
    const c = input.selectionStart;
    const s = c !== null && c === input.selectionEnd ? parsed.spans.find(x => c >= x.start && c <= x.end) : undefined;
    keep = s ? { span: s, word: text.slice(s.start, s.end) } : null;
    // The offer sits at the start of the chip row; bring it into view.
    if (keep && chipsEl) chipsEl.scrollLeft = 0;
  }
  async function keepAsText() {
    if (!keep) return;
    const at = keep.span.start, caret = Math.max(input.selectionStart ?? at, at) + 1;
    text = text.slice(0, at) + '\\' + text.slice(at);
    keep = null;
    await tick();
    input?.setSelectionRange(caret, caret);
  }

  // A panel takes the keyboard's place at the keyboard's height, so the
  // title and chips do not move when one swaps for the other. 10px is the
  // panel's top margin.
  const PICK_FALLBACK = 280, PICK_MIN = 220;
  let kbHeight = keyboardHeight();
  $: pickHeight = Math.max(PICK_MIN, kbHeight ?? PICK_FALLBACK) - 10;

  const PRIORITIES = [
    ...([3, 2, 1] as const).map(p => ({ value: String(p), label: PRIORITY_LABEL[p], dot: soften(PRIORITY_COLOR[p]) })),
    { value: '', label: 'None' },
  ];

  // Hint only, never blocking: a same-titled task in the target project.
  let dupHint = '';
  let dupTimer: ReturnType<typeof setTimeout> | undefined;
  $: { clearTimeout(dupTimer); dupTimer = setTimeout(() => checkDup(parsed.title, targetId), 350); }
  // A slow lookup must not overwrite the answer for a newer title.
  let dupSeq = 0;
  async function checkDup(t: string, pid: string | null) {
    const mine = ++dupSeq;
    if (!t || !pid) { dupHint = ''; return; }
    try {
      const m = await findTasksByTitleInProject(pid, t);
      if (mine !== dupSeq) return;
      dupHint = m.length ? `${$projects.find(p => p._id === pid)?.name ?? 'This project'} already has a task with this name.` : '';
    } catch { if (mine === dupSeq) dupHint = ''; }
  }

  // A panel and the keyboard never share the screen: the WebView shrinks
  // by the keyboard's height (adjustResize), which left a panel no room.
  // Opening a panel drops the keyboard; leaving one by a pick, Done or a
  // tap on the title brings it back. Switching panels keeps it down.
  function openPanel(k: PanelKind) { input?.blur(); showHelp = false; keep = null; panelSession++; panel = k; }
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

  let stopKeyboard = () => {};
  onMount(async () => {
    window.addEventListener('keydown', onKeyCapture, true);
    window.addEventListener('click', onClickCapture, true);
    window.addEventListener('resize', updateFade);
    document.addEventListener('selectionchange', onSelectionChange);
    stopKeyboard = trackKeyboard(h => (kbHeight = h));
    await tick();
    // A chip tapped before this tick already took the keyboard down.
    if (!panel) input?.focus();
  });
  onDestroy(() => {
    clearTimeout(dupTimer);
    window.removeEventListener('keydown', onKeyCapture, true);
    window.removeEventListener('click', onClickCapture, true);
    window.removeEventListener('resize', updateFade);
    document.removeEventListener('selectionchange', onSelectionChange);
    cancelAnimationFrame(syncFrame);
    stopKeyboard();
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
      rememberProject(p._id);
      // Outside the write's error path: the task exists, so a failed reload
      // must not invite a retry that would create it twice.
      try { await reloadTasks(); } catch { /* lists catch up on the next change */ }
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
      <div class="field">
        <div class="mirror" aria-hidden="true" bind:this={mirror}>{#each segments as s}{#if s.kind}<mark class="tok">{s.text}</mark>{:else}{s.text}{/if}{/each}</div>
        <input
          bind:this={input} bind:value={text} class="qa" placeholder="What needs doing?"
          autocomplete="off" enterkeyhint="done" aria-label="Task title" on:keydown={onKey} on:focus={onTitleFocus}
          on:click={onTitleTap} on:input={() => (keep = null)} on:scroll={syncScroll}
        />
      </div>
      <button class="send" on:mousedown={holdFocus} on:click={add} disabled={!parsed.title || !project || saving} aria-label="Add">{@html I.up}</button>
    </div>

    <div class="p-chips chips" class:fade-end={fadeEnd} bind:this={chipsEl} on:scroll={updateFade}>
      {#if keep}
        <button class="p-chip keep" on:mousedown={holdFocus} on:click={keepAsText} aria-label="Keep “{keep.word}” as text">{@html I.x}<span class="p-name">Keep “{keep.word}” as text</span></button>
      {/if}
      {#each chipList as k (k)}
        {#if k === 'due'}
          <button class="p-chip" class:on={!!due} aria-expanded={panel === 'due'} on:click={() => onChip('due')} aria-label="Due: {dueText(due)}">{@html I.today}{due ? dueText(due) : 'Date'}</button>
        {:else if k === 'reminder'}
          <button class="p-chip" class:on={!!reminder} aria-expanded={panel === 'reminder'} on:click={() => onChip('reminder')} aria-label="Reminder: {reminder ? reminderText(reminder) : 'none'}">{@html I.bell}{#if reminder}{reminderText(reminder)}{/if}</button>
        {:else if k === 'project'}
          <button class="p-chip" class:on={projectSet} aria-expanded={panel === 'project'} on:click={() => onChip('project')} aria-label="Project: {project?.name ?? 'none'}">
            {#if space}<span class="p-dot" style="background:{soften(space.color)}"></span>{/if}<span class="p-name">{project?.name ?? 'No project'}</span>
          </button>
        {:else if k === 'priority'}
          <button class="p-chip" class:on={!!priority} aria-expanded={panel === 'priority'} on:click={() => onChip('priority')} aria-label="Priority: {priority ? PRIORITY_LABEL[priority] : 'not set'}">{@html I.flag}{priority ? PRIORITY_LABEL[priority] : 'Priority'}</button>
        {:else}
          <button class="p-chip" class:on={tags.length > 0} aria-expanded={panel === 'tags'} on:click={() => onChip('tags')} aria-label="Tags: {tags.length ? tags.join(', ') : 'none'}">{@html I.tag}{tagText}</button>
        {/if}
      {/each}
      <button class="p-chip help" class:on={showHelp} on:mousedown={holdFocus} on:click={() => (showHelp = !showHelp)} aria-label="Quick add syntax help" aria-expanded={showHelp}>?</button>
    </div>

    {#if parsed.raw || !project}
      <p class="note">{#if !project}Create a project first{:else}Quoted, parsing off{/if}</p>
    {/if}
    {#if dupHint}<p class="warn">{dupHint}</p>{/if}

    {#if showHelp}
      <div class="helpbox" role="note" in:slide={revealIn} out:slide={revealOut}>
        <p>Type it in plain text. These are picked out for you:</p>
        <dl>
          <dt>Date</dt><dd><code>tomorrow</code>, <code>friday</code>, <code>next fri</code>, <code>in 3 days</code>, <code>aug 3</code></dd>
          <dt>Time</dt><dd><code>at 5pm</code>, <code>17:30</code> sets a reminder</dd>
          <dt>Priority</dt><dd><code>!high</code>, <code>!low</code>, <code>!!</code>, <code>!!!</code></dd>
          <dt>Tag</dt><dd><code>#errand</code>, repeat for more</dd>
          <dt>Project</dt><dd><code>@fitness</code> matches a project by name</dd>
          <dt>Escape</dt><dd>Tap a highlighted word to keep it as text, or type <code>\</code> before it: <code>\friday</code>, <code>\#42</code>. Wrap the whole title in <code>"quotes"</code> to turn parsing off</dd>
        </dl>
      </div>
    {/if}

    {#if panel}
      <div class="pick" bind:this={panelEl} style:height="{pickHeight}px" in:fade={revealIn}>
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
  .field { position: relative; flex: 1; min-width: 0; display: flex; }
  /* Inset, so a scrolling parent can't clip it. */
  .field:focus-within { box-shadow: inset 0 0 0 2px var(--accent); border-radius: 10px; }
  /* .qa and .mirror must stay metric-identical, or the caret drifts off the text. */
  .qa, .mirror { font: inherit; font-size: var(--p-fs-xl); line-height: 1.5; letter-spacing: normal; padding: 10px 10px; border: 0; margin: 0; }
  .qa { position: relative; flex: 1; min-width: 0; outline: none; background: none; color: transparent; caret-color: var(--text); }
  .qa::placeholder { color: var(--faint); }
  .mirror { position: absolute; inset: 0; overflow: hidden; white-space: pre; color: var(--text); pointer-events: none; }
  .tok {
    color: var(--accent); border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
  }
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
  .p-name { max-width: 104px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .keep .p-name { max-width: 180px; }
  .keep { color: var(--accent); }
  /* Overflow cue: the row's far edge fades while more chips sit past it. */
  .p-chips.fade-end {
    -webkit-mask-image: linear-gradient(to right, black calc(100% - 56px), transparent);
    mask-image: linear-gradient(to right, black calc(100% - 56px), transparent);
  }
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
