<script lang="ts">
  // Edit a project's statuses: rename in place, reorder, archive a status's
  // tasks, remove one, add one. Done is positional, so any change to which
  // status is last says what it does to done-ness.
  import { onDestroy } from 'svelte';
  import { activeProjectId, activeSpaceId, projects, projectTasks, reloadTasks, showError } from '../store';
  import { renameColumn, reorderColumns, removeColumn, addColumn, archiveColumnTasks, getProjects } from '../db';
  import type { Column, ProjectDoc } from '../types';
  import { showToast } from './nav';
  import { I } from './icons';
  import { adopt, restore } from './project/actions';
  import TopBar from './TopBar.svelte';
  import Sheet from './Sheet.svelte';

  export let id: string;

  $: project = $projects.find(p => p._id === id) ?? null;
  $: if (project && $activeProjectId !== id) { activeSpaceId.set(project.space_id); activeProjectId.set(id); }
  $: mine = $activeProjectId === id ? $projectTasks : [];
  $: count = (cid: string) => mine.filter(t => t.column_id === cid).length;

  // Typed names not yet saved: leaving the screen (Android back with the
  // field focused) fires no change event, so these are saved on the way out.
  let drafts: Record<string, string> = {};
  async function rename(c: Column, e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const name = input.value.trim();
    delete drafts[c.id];
    if (!project || name === c.name) return;
    if (!name) { input.value = c.name; return; }
    try {
      adopt(await renameColumn(project._id, c.id, name));
    } catch {
      input.value = c.name;
      showError('Could not rename this status. Please try again.');
    }
  }

  onDestroy(() => {
    const p = project;
    if (!p) return;
    for (const [cid, raw] of Object.entries(drafts)) {
      const name = raw.trim(), c = p.columns.find(x => x.id === cid);
      if (!c || !name || name === c.name) continue;
      renameColumn(p._id, cid, name).then(adopt, () => showError('Could not rename this status. Please try again.'));
    }
  });

  // Undo of a reorder works on the project as it is now: a status added or
  // renamed since must survive, or its tasks lose their status and vanish.
  // Statuses that still exist go back to their earlier order in the slots
  // they hold; any other status keeps its place.
  function restoreOrder(current: Column[], order: string[]): Column[] {
    const known = order.map(id => current.find(c => c.id === id)).filter((c): c is Column => !!c);
    let k = 0;
    return current.map(c => (order.includes(c.id) ? known[k++] : c));
  }

  async function move(i: number, d: -1 | 1) {
    if (!project) return;
    const prev = project.columns, cols = [...prev];
    [cols[i], cols[i + d]] = [cols[i + d], cols[i]];
    const pid = project._id, oldLast = prev.at(-1)!, newLast = cols.at(-1)!;
    try {
      adopt(await reorderColumns(pid, cols));
    } catch {
      showError('Could not reorder the statuses. Please try again.');
      return;
    }
    if (oldLast.id !== newLast.id) {
      const prevOrder = prev.map(c => c.id);
      showToast(`“${newLast.name}” is last now, so its ${count(newLast.id)} task(s) count as done`, async () => {
        try {
          const now = (await getProjects()).find(p => p._id === pid);
          if (now) adopt(await reorderColumns(pid, restoreOrder(now.columns, prevOrder)));
        } catch { showError('Could not undo. Please try again.'); }
      });
    }
  }

  async function archiveAll(c: Column) {
    if (!project) return;
    const ids = mine.filter(t => t.column_id === c.id).map(t => t._id);
    try {
      await archiveColumnTasks(project._id, c.id);
      await reloadTasks();
    } catch {
      showError('Could not archive these tasks. Please try again.');
      return;
    }
    showToast(`Archived ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}`, () => restore(ids.map(t => [t, { archived: false }])));
  }

  // The desktop's warning: tasks move to the first status, and removing the
  // last status makes the one before it count as done.
  function removeWarning(c: Column): string {
    if (!project) return '';
    const n = count(c.id);
    let msg = n ? `Its ${n} task(s) move to “${project.columns.find(x => x.id !== c.id)?.name}”.` : 'It has no tasks.';
    if (project.columns.at(-1)?.id === c.id && project.columns.length > 1) {
      const promoted = project.columns.at(-2)!;
      msg += ` “${promoted.name}” then becomes the last status, so its ${count(promoted.id)} task(s) will count as done.`;
    }
    return msg;
  }
  async function remove(c: Column) {
    if (!project) return;
    try {
      adopt(await removeColumn(project._id, c.id));
      await reloadTasks();
    } catch {
      showError('Could not remove this status. Please try again.');
    }
  }

  let newName = '';
  async function add() {
    const name = newName.trim();
    if (!project || !name) return;
    const pid = project._id;
    let added: ProjectDoc;
    try {
      added = await addColumn(pid, name);
    } catch {
      showError('Could not add a status. Please try again.');
      return;
    }
    adopt(added);
    newName = '';
    // A new status goes before the last one, so the done status stays
    // last and no finished task silently becomes unfinished.
    const cols = added.columns;
    if (cols.length < 2) return;
    try {
      adopt(await reorderColumns(pid, [...cols.slice(0, -2), cols[cols.length - 1], cols[cols.length - 2]]));
    } catch {
      showError('Added, but it is last, so its tasks count as done. Move it up.');
    }
  }

  // Per-status menu; {#key} bumped on every open (Sheet rule).
  let menu: Column | null = null, session = 0, confirming = false;
  let sheet: Sheet;
  function openMenu(c: Column) { menu = c; confirming = false; session++; }
  $: mi = menu && project ? project.columns.findIndex(c => c.id === menu!.id) : -1;
  $: mc = project && mi >= 0 ? project.columns[mi] : null;
  function pick(fn: () => void) { sheet.close(); fn(); }
</script>

{#if project}
  <TopBar title="Statuses" sub="{project.name} · the last status counts as done" />
  <div class="p-group">
    {#each project.columns as c (c.id)}
      <div class="p-row st">
        <input class="name" value={c.name} aria-label="Name of {c.name}" enterkeyhint="done"
          on:input={e => (drafts[c.id] = e.currentTarget.value)} on:change={e => rename(c, e)} on:keydown={e => e.key === 'Enter' && e.currentTarget.blur()} />
        <span class="n">{count(c.id)}</span>
        <button class="p-ib" aria-label="More for {c.name}" on:click={() => openMenu(c)}>{@html I.more}</button>
      </div>
    {/each}
    <div class="p-row st">
      <input class="name" bind:value={newName} placeholder="Add a status" aria-label="New status name" enterkeyhint="done" on:keydown={e => e.key === 'Enter' && add()} />
      <button class="p-tbtn" disabled={!newName.trim()} on:click={add}>Add</button>
    </div>
  </div>

  {#if menu}
    {@const c = mc ?? menu}
    {#key session}
      <Sheet bind:this={sheet} title={confirming ? `Remove ${c.name}?` : c.name} on:close={() => (menu = null)}>
        {#if !confirming}
          <div class="p-group">
            {#if mi > 0}<button class="p-row" on:click={() => pick(() => move(mi, -1))}>Move up</button>{/if}
            {#if mi >= 0 && mi < project.columns.length - 1}<button class="p-row" on:click={() => pick(() => move(mi, 1))}>Move down</button>{/if}
            <button class="p-row" disabled={!count(c.id)} on:click={() => pick(() => archiveAll(c))}>Archive all its tasks</button>
          </div>
          <div class="p-group"><button class="p-row danger" disabled={project.columns.length < 2} on:click={() => (confirming = true)}>Remove status</button></div>
          {#if mi === project.columns.length - 1}<p class="p-say">This is the last status, so its tasks count as done.</p>{/if}
        {:else}
          <p class="p-say">{removeWarning(c)}</p>
          <button class="p-go danger" on:click={() => pick(() => remove(c))}>Remove status</button>
          <button class="p-row cancel" on:click={() => (confirming = false)}>Cancel</button>
        {/if}
      </Sheet>
    {/key}
  {/if}
{:else}
  <TopBar title="Statuses" />
  <p class="p-empty">This project no longer exists.</p>
{/if}

<style>
  .st { gap: 8px; padding-top: 4px; padding-bottom: 4px; cursor: default; }
  .name { flex: 1; min-width: 0; border: 0; outline: none; background: none; font: inherit; font-size: var(--p-fs-l); color: var(--text); padding: 8px 0; }
  .name:focus-visible { box-shadow: 0 2px 0 var(--accent); }
  .n { font-size: var(--p-fs-s); color: var(--faint); min-width: 20px; text-align: right; }
  .cancel { justify-content: center; font-weight: 600; margin-top: 4px; }
</style>
