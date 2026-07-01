<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getDashboardData, subscribe } from './db';
  import { PRIORITY_COLOR } from './constants';
  import { dueLabelLong } from './utils';

  const dispatch = createEventDispatcher<{ openProject: string }>();

  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;

  async function load() { data = await getDashboardData(); }

  onMount(() => {
    load();
    return subscribe(() => load());
  });
</script>

<div class="dash">
  <div class="dash-header">
    <h1 class="dash-title">Dashboard</h1>
    {#if data}
      <span class="dash-sub">{data.totalTasks} active task{data.totalTasks === 1 ? '' : 's'} across {data.allProjects.length} project{data.allProjects.length === 1 ? '' : 's'}</span>
    {/if}
  </div>

  {#if !data}
    <div class="loading">Loading…</div>
  {:else}
    <div class="dash-body">
      <div class="dash-cols">

        <!-- Left: Project cards -->
        <div class="col-projects">
          <div class="section-title">Projects</div>
          <div class="project-grid">
            {#each data.allProjects as proj (proj._id)}
              {@const stats = data.byProject[proj._id] ?? { total: 0, pinned: 0, overdue: 0 }}
              {@const space = data.allSpaces.find(s => s._id === proj.space_id)}
              <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
              <div class="proj-card" on:click={() => dispatch('openProject', proj._id)}>
                <div class="proj-card-top">
                  {#if space}
                    <span class="space-dot" style="background:{space.color}"></span>
                    <span class="space-name">{space.name}</span>
                  {/if}
                </div>
                <div class="proj-name">{proj.name}</div>
                <div class="proj-stats">
                  <span class="stat"><strong>{stats.total}</strong> tasks</span>
                  {#if stats.pinned}<span class="stat pinned-stat">★ {stats.pinned} pinned</span>{/if}
                  {#if stats.overdue}<span class="stat overdue-stat">⚠ {stats.overdue} overdue</span>{/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Right: Pinned + Overdue -->
        <div class="col-tasks">
          {#if data.pinnedTasks.length > 0}
            <section class="section">
              <div class="section-title">★ Pinned</div>
              <div class="task-list">
                {#each data.pinnedTasks as t (t._id)}
                  <div class="task-row">
                    <span class="prio-bar" style="background:{PRIORITY_COLOR[t.priority]}"></span>
                    <span class="task-title">{t.title}</span>
                    <span class="task-proj">{data.projCache[t.project_id] ?? '—'}</span>
                  </div>
                {/each}
              </div>
            </section>
          {/if}

          {#if data.overdueTasks.length > 0}
            <section class="section">
              <div class="section-title overdue-title">⚠ Overdue</div>
              <div class="task-list">
                {#each data.overdueTasks as t (t._id)}
                  <div class="task-row">
                    <span class="prio-bar" style="background:{PRIORITY_COLOR[t.priority]}"></span>
                    <span class="task-title">{t.title}</span>
                    <span class="task-proj">{data.projCache[t.project_id] ?? '—'}</span>
                    <span class="task-due overdue">{dueLabelLong(t.due_date!)}</span>
                  </div>
                {/each}
              </div>
            </section>
          {/if}

          {#if data.pinnedTasks.length === 0 && data.overdueTasks.length === 0}
            <div class="all-good">All caught up — no pinned or overdue tasks.</div>
          {/if}
        </div>

      </div>
    </div>
  {/if}
</div>

<style>
  .dash { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

  .dash-header {
    padding: 20px 28px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .dash-title { margin: 0 0 3px; font-size: 20px; font-weight: 700; letter-spacing: -.015em; }
  .dash-sub { font-family: var(--mono); font-size: 11px; color: var(--faint); }

  .dash-body {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 20px 28px 32px;
    display: flex; flex-direction: column;
  }

  /* Two-column layout: projects left, tasks right */
  .dash-cols {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 24px;
    flex: 1;
  }

  .col-projects { display: flex; flex-direction: column; }
  .col-tasks { display: flex; flex-direction: column; gap: 20px; }

  .section { display: flex; flex-direction: column; }

  .section-title {
    font-family: var(--mono); font-size: 10.5px; text-transform: uppercase;
    letter-spacing: .08em; font-weight: 700; color: var(--faint);
    margin-bottom: 10px;
  }
  .overdue-title { color: var(--danger); }

  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    grid-auto-rows: 130px;
    gap: 12px;
    align-content: start;
  }
  .proj-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 18px 20px; cursor: pointer;
    transition: border-color .12s, box-shadow .12s, transform .12s;
    display: flex; flex-direction: column; gap: 8px;
  }
  .proj-card:hover { border-color: var(--accent); box-shadow: 0 4px 12px rgba(0,0,0,.09); transform: translateY(-1px); }

  .proj-card-top { display: flex; align-items: center; gap: 6px; }
  .space-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .space-name { font-family: var(--mono); font-size: 10px; color: var(--faint); text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .proj-name { font-size: 16px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .proj-stats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; padding-top: 8px; }
  .stat { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .stat strong { color: var(--text); font-size: 13px; }
  .pinned-stat { color: var(--accent); }
  .overdue-stat { color: var(--danger); }

  .task-list { display: flex; flex-direction: column; gap: 1px; background: var(--border); border-radius: 10px; overflow: hidden; }
  .task-row {
    display: flex; align-items: center; gap: 9px;
    padding: 9px 12px; background: var(--surface);
  }
  .prio-bar { width: 3px; height: 24px; border-radius: 2px; flex-shrink: 0; }
  .task-title { flex: 1; font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .task-proj { font-family: var(--mono); font-size: 10px; color: var(--faint); white-space: nowrap; flex-shrink: 0; }
  .task-due { font-family: var(--mono); font-size: 10px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }
  .task-due.overdue { color: var(--danger); }

  .all-good { color: var(--faint); font-size: 13px; padding: 6px 0; }
  .loading { padding: 3rem; color: var(--faint); font-family: var(--mono); font-size: .8rem; }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .dash-cols { grid-template-columns: 1fr; }
    .col-tasks { gap: 16px; }
  }
  @media (max-width: 600px) {
    .dash-header { padding: 14px 16px 10px; }
    .dash-body { padding: 14px 14px 32px; }
    .project-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
    .task-proj { display: none; }
  }
</style>
