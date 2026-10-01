<script lang="ts">
  // The board's card menu for a row in a cross-project list. Mount behind a
  // {#key} bumped per open (Sheet rule); it loads the task's project first,
  // since the menu positions moves against every task in it.
  import { createEventDispatcher, onMount } from 'svelte';
  import type { TaskDoc } from '../types';
  import { getTasksForProject } from '../db';
  import { projects, showError } from '../store';
  import CardMenuSheet from './project/CardMenuSheet.svelte';

  export let task: TaskDoc;

  const dispatch = createEventDispatcher<{ close: void }>();
  const project = $projects.find(p => p._id === task.project_id);
  let tasks: TaskDoc[] | null = null;

  onMount(async () => {
    if (!project) { dispatch('close'); return; }
    try {
      tasks = await getTasksForProject(project._id);
    } catch {
      showError('Could not load this task. Please try again.');
      dispatch('close');
    }
  });
  $: fresh = tasks?.find(t => t._id === task._id) ?? task;
</script>

{#if project && tasks}
  <CardMenuSheet task={fresh} {project} {tasks} on:close={() => dispatch('close')} />
{/if}
