<script lang="ts">
  import { activeProjectId, activeSpaceId, projects, spaces, projectTasks, showError } from '../store';
  import { updateProject } from '../db';
  import type { ProjectDoc } from '../types';
  import KanbanBoard from '../KanbanBoard.svelte';
  import ListView from '../ListView.svelte';
  import TopBar from './TopBar.svelte';
  import { I } from './icons';

  export let id: string;

  $: project = $projects.find(p => p._id === id) ?? null;
  $: space = project ? $spaces.find(s => s._id === project!.space_id) : undefined;
  // The board and list read the store's active project, so the screen on
  // top claims it (including when a lower project screen is uncovered).
  $: if (project && $activeProjectId !== id) { activeSpaceId.set(project.space_id); activeProjectId.set(id); }
  $: view = project?.default_view === 'list' || project?.default_view === 'table' ? 'list' : 'kanban';
  $: open = $projectTasks.filter(t => t.project_id === id && t.column_id !== project?.columns.at(-1)?.id).length;

  async function toggleView() {
    if (!project) return;
    const next = view === 'kanban' ? 'list' : 'kanban';
    const prev = project;
    projects.update(ps => ps.map(p => (p._id === id ? { ...p, default_view: next } : p)));
    try {
      await updateProject(id, { default_view: next });
    } catch {
      projects.update(ps => ps.map(p => (p._id === id ? prev : p)));
      showError('Could not switch the view. Please try again.');
    }
  }
  function onProjectUpdated(e: CustomEvent<ProjectDoc>) {
    projects.update(ps => ps.map(p => (p._id === e.detail._id ? e.detail : p)));
  }
</script>

{#if project}
  <div class="pad">
    <TopBar title={project.name} sub="{space?.name ?? ''} · {open} open">
      <span slot="sub-lead" class="dot" style="background:{space?.color ?? 'var(--faint)'}"></span>
      <button class="ib" on:click={toggleView} aria-label={view === 'kanban' ? 'Show as list' : 'Show as board'}>{@html view === 'kanban' ? I.list : I.board}</button>
    </TopBar>
  </div>
  <div class="body">
    {#if $activeProjectId === id}
      {#if view === 'kanban'}
        <KanbanBoard {project} tasks={$projectTasks} on:projectUpdated={onProjectUpdated} />
      {:else}
        <ListView {project} tasks={$projectTasks} />
      {/if}
    {/if}
  </div>
{:else}
  <div class="pad"><TopBar title="Project" /></div>
  <p class="gone">This project no longer exists.</p>
{/if}

<style>
  .pad { padding: 0 16px; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .gone { text-align: center; color: var(--faint); padding: 28px 0; }
</style>
