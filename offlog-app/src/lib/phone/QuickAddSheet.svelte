<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import type { TaskDoc } from '../types';
  import { projects, spaces, reloadTasks, showError } from '../store';
  import { createTask, findTasksByTitleInProject, ensureFreshTagColor } from '../db';
  import { parseQuickAdd } from '../nlpParse';
  import { PRIORITY_LABEL } from '../constants';
  import { fmtTime, localDateStr } from '../utils';
  import { shortDate } from './format';
  import { I } from './icons';
  import { showToast } from './nav';
  import { soften } from '../tagColors';
  import Sheet from './Sheet.svelte';

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
  let pickProject = false;

  let chosenProject = projectId;
  let manualChoice = false;
  let manualDue = dueDate;
  let manualPriority: 1 | 2 | 3 | null = null;

  $: parsed = parseQuickAdd(text, $projects);
  // A typed @project wins unless one was picked by hand; a typed date wins
  // over the prefilled one.
  $: targetId = (!manualChoice && parsed.projectId) || (chosenProject && $projects.some(p => p._id === chosenProject) ? chosenProject : $projects[0]?._id) || null;
  $: project = $projects.find(p => p._id === targetId);
  $: space = $spaces.find(s => s._id === project?.space_id);
  $: due = parsed.due_date ?? manualDue;
  $: priority = parsed.priority ?? manualPriority;
  // Highlighted only once the project was chosen, by hand or by @mention.
  $: projectSet = (manualChoice && !!chosenProject) || !!parsed.projectId;

  const todayIso = () => localDateStr(new Date());
  const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d); };
  function dueText(d: string | null): string {
    if (!d) return 'No date';
    if (d === todayIso()) return 'Today';
    if (d === plusDays(1)) return 'Tomorrow';
    return shortDate(d);
  }

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
  onDestroy(() => clearTimeout(dupTimer));

  function cycleDue() {
    const seq = [todayIso(), plusDays(1), null];
    manualDue = seq[(seq.indexOf(manualDue) + 1) % seq.length];
  }
  function cyclePriority() {
    const seq: (1 | 2 | 3 | null)[] = [null, 3, 2, 1];
    manualPriority = seq[(seq.indexOf(manualPriority) + 1) % seq.length];
  }
  function choose(id: string) { chosenProject = id; manualChoice = true; pickProject = false; input?.focus(); }
  async function hint(s: string) {
    text = (text.trimEnd() + ' ' + s).trimStart();
    await tick();
    input?.focus();
    input?.setSelectionRange(text.length, text.length);
  }

  onMount(async () => { await tick(); input?.focus(); });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }

  async function add() {
    const t = parsed.title, p = project, tags = parsed.tags;
    if (!t || !p || saving) return;
    // A status only applies inside the project it was opened from.
    const col = p._id === projectId && columnId && p.columns.some(c => c.id === columnId) ? columnId : p.columns[0]?.id;
    if (!col) return;
    const overrides = {
      priority: priority ?? undefined,
      due_date: due,
      reminder_at: parsed.reminder_at,
      tags: tags.length ? tags : undefined,
    };
    saving = true;
    try {
      // Sequential and before createTask: each new tag must see the colour
      // the previous one just claimed, and must not yet exist on a task.
      for (const tag of tags) {
        try { await ensureFreshTagColor(tag, tags.filter(x => x !== tag)); }
        catch (e) { console.warn('tag color assignment failed', e); }
      }
      const doc = await createTask(p._id, p.space_id, col, t, overrides);
      await reloadTasks();
      text = '';
      dispatch('created', doc);
      sheet?.close();
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
  <div class="top">
    <input
      bind:this={input} bind:value={text} class="qa" placeholder="What needs doing?"
      autocomplete="off" enterkeyhint="done" aria-label="Task title" on:keydown={onKey}
    />
    <button class="p-ib help" class:on={showHelp} on:click={() => (showHelp = !showHelp)} aria-label="Quick add syntax help" aria-expanded={showHelp}>?</button>
  </div>

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

  {#if parsed.raw}
    <div class="p-chips"><span class="p-chip">Quoted, parsing off</span></div>
  {/if}
  <div class="p-chips">
    <button class="p-chip" class:on={!!due} on:click={cycleDue} aria-label="Due: {dueText(due)}">{@html I.today}{dueText(due)}</button>
    <button class="p-chip" class:on={projectSet} on:click={() => (pickProject = !pickProject)} aria-expanded={pickProject} aria-label="Project: {project?.name ?? 'none'}">
      {#if space}<span class="p-dot" style="background:{soften(space.color)}"></span>{/if}{project?.name ?? 'No project'}
    </button>
    <button class="p-chip" class:on={!!priority} on:click={cyclePriority} aria-label="Priority: {priority ? PRIORITY_LABEL[priority] : 'not set'}">{@html I.flag}{priority ? PRIORITY_LABEL[priority] : 'Priority'}</button>
    {#each parsed.tags as tag}<span class="p-chip on">{@html I.tag}{tag}</span>{:else}<button class="p-chip" on:click={() => hint('#')}>{@html I.tag}Tag</button>{/each}
    {#if parsed.reminder_at}
      <span class="p-chip on">{@html I.bell}{fmtTime(new Date(parsed.reminder_at))}</span>
    {:else}
      <button class="p-chip" on:click={() => hint('at ')} aria-label="Add a reminder time">{@html I.bell}</button>
    {/if}
  </div>

  {#if pickProject}
    <div class="p-group plist">
      {#each $projects as p (p._id)}
        {@const sp = $spaces.find(s => s._id === p.space_id)}
        <button class="p-row" on:click={() => choose(p._id)}>
          <span class="p-dot" style="background:{sp ? soften(sp.color) : 'var(--faint)'}"></span>
          <span class="p-k"><span>{p.name}</span>{#if sp}<span class="p-sub">{sp.name}</span>{/if}</span>
          {#if p._id === targetId}<span class="p-tick">{@html I.check}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if dupHint}<p class="warn">{dupHint}</p>{/if}

  <div class="foot">
    {#if !project}<span>Create a project first</span>{/if}
    <button class="send" on:click={add} disabled={!parsed.title || !project || saving} aria-label="Add">{@html I.up}</button>
  </div>
</Sheet>

<style>
  .top { display: flex; align-items: flex-start; gap: 4px; }
  .qa { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--text); font: inherit; font-size: 18px; padding: 10px 4px 12px; }
  .qa::placeholder { color: var(--faint); }
  .help { font-weight: 700; font-size: 15px; }
  .helpbox { background: var(--surface); border-radius: 12px; padding: 10px 12px; margin: 0 0 10px; font-size: 13px; color: var(--muted); }
  .helpbox p { margin: 0 0 8px; }
  .helpbox dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 10px; margin: 0; }
  .helpbox dt { color: var(--faint); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .helpbox dd { margin: 0; color: var(--text); }
  .helpbox code { font-family: var(--mono); font-size: 12px; background: var(--col-bg); padding: 1px 5px; border-radius: 4px; color: var(--accent); }
  /* A scrolling row clips overflow on both axes; padding keeps the chips'
     44px tap extension inside it. */
  .p-chips { padding: 7px 0; margin: -5px 0 -3px; }
  .plist { margin: 10px 0 0; max-height: 40dvh; overflow-y: auto; }
  .warn { font-size: 12.5px; color: var(--overdue-ink); margin: 8px 4px 0; }
  .foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; }
  .foot span { font-size: 13px; color: var(--faint); min-width: 0; margin-right: auto; }
  .send {
    width: 44px; height: 44px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; flex-shrink: 0;
    background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center;
  }
  .send:disabled { opacity: .4; cursor: default; }
</style>
