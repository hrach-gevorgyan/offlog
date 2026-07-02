<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import db, { checkIntegrity, repairDatabase, pruneOldLogs, pruneOldDeletedTasks, type IntegrityIssue } from './db';
  import { showError } from './store';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';

  const dispatch = createEventDispatcher<{ close: void; done: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  // One combined, visible flow instead of three separate unexplained buttons
  // (Check Database / Repair Issues / Optimize Storage). Runs as an ordered
  // list of steps with live status, so "what does this actually do" has a
  // concrete on-screen answer instead of just a spinner.
  type MaintStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
  interface MaintStep { key: string; label: string; status: MaintStatus; note: string }

  let running = false;
  let steps: MaintStep[] = [];
  let remainingIssues: IntegrityIssue[] = [];

  function freshSteps(): MaintStep[] {
    return [
      { key: 'check',   label: 'Checking database for problems', status: 'pending', note: '' },
      { key: 'repair',  label: 'Repairing anything fixable',      status: 'pending', note: '' },
      { key: 'history', label: 'Clearing old activity history',   status: 'pending', note: '' },
      { key: 'trash',   label: 'Clearing old items from Recycle', status: 'pending', note: '' },
      { key: 'compact', label: 'Compacting the database',         status: 'pending', note: '' },
    ];
  }
  steps = freshSteps();

  function setStep(i: number, patch: Partial<MaintStep>) {
    steps = steps.map((s, idx) => idx === i ? { ...s, ...patch } : s);
  }

  async function run() {
    running = true;
    steps = freshSteps();
    remainingIssues = [];
    try {
      setStep(0, { status: 'running' });
      const { issues, checked } = await checkIntegrity();
      setStep(0, { status: 'done', note: issues.length === 0 ? `No problems found (${checked} items checked)` : `${issues.length} issue${issues.length === 1 ? '' : 's'} found` });

      if (issues.length === 0) {
        setStep(1, { status: 'skipped', note: 'Nothing to repair' });
      } else {
        setStep(1, { status: 'running' });
        const { fixed, skipped } = await repairDatabase();
        setStep(1, { status: 'done', note: `Fixed ${fixed}${skipped ? `, ${skipped} need manual review` : ''}` });
        if (skipped > 0) {
          const after = await checkIntegrity();
          remainingIssues = after.issues;
        }
      }

      setStep(2, { status: 'running' });
      const prunedLogs = await pruneOldLogs();
      setStep(2, { status: 'done', note: prunedLogs > 0 ? `Removed ${prunedLogs} entr${prunedLogs === 1 ? 'y' : 'ies'} older than 6 months` : 'Nothing old enough to remove' });

      setStep(3, { status: 'running' });
      const prunedTasks = await pruneOldDeletedTasks();
      setStep(3, { status: 'done', note: prunedTasks > 0 ? `Removed ${prunedTasks} item${prunedTasks === 1 ? '' : 's'} older than 3 months` : 'Nothing old enough to remove' });

      setStep(4, { status: 'running' });
      await db.compact();
      setStep(4, { status: 'done', note: 'Reclaimed disk space' });

      dispatch('done');
    } catch {
      const runningIdx = steps.findIndex(s => s.status === 'running');
      if (runningIdx >= 0) setStep(runningIdx, { status: 'error', note: 'Failed — please try again' });
      showError('Maintenance failed partway through. Please try again.');
    } finally {
      running = false;
    }
  }

  $: progress = Math.round((steps.filter(s => s.status === 'done' || s.status === 'skipped' || s.status === 'error').length / (steps.length || 1)) * 100);

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !running) requestClose();
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="settings-overlay" on:click|self={() => { if (!running) requestClose(); }}>
  <div class="settings-panel maint-panel" use:trapFocus>
    <h3>Maintenance</h3>
    <p class="setting-hint">
      Runs a full check in order: looks for database problems, repairs what it safely can,
      clears old activity history (6+ months) and old Recycle items (3+ months), then compacts
      the database to reclaim the space they were using.
    </p>

    <div class="progress-track"><div class="progress-fill" style="width:{progress}%"></div></div>

    <div class="maint-steps">
      {#each steps as step (step.key)}
        <div class="maint-step" class:running={step.status === 'running'}>
          <span class="maint-step-icon" class:done={step.status === 'done'} class:skipped={step.status === 'skipped'} class:error={step.status === 'error'} class:running={step.status === 'running'}>
            {#if step.status === 'done'}✓
            {:else if step.status === 'skipped'}–
            {:else if step.status === 'error'}✕
            {:else if step.status === 'running'}<span class="spinner"></span>
            {/if}
          </span>
          <span class="maint-step-label">{step.label}</span>
          {#if step.note}<span class="maint-step-note">{step.note}</span>{/if}
        </div>
      {/each}
    </div>

    {#if remainingIssues.length > 0}
      <div class="integrity-list">
        {#each remainingIssues.slice(0, 8) as issue}
          <div class="integrity-row">{issue.description}</div>
        {/each}
      </div>
      <p class="setting-hint">These need manual review — not safe to fix automatically.</p>
    {/if}

    <div class="settings-actions">
      <button on:click={() => requestClose()} disabled={running}>Close</button>
      <button class="save-btn" on:click={run} disabled={running}>
        {running ? 'Running…' : steps.some(s => s.status === 'done') ? 'Run Again' : 'Run Maintenance'}
      </button>
    </div>
  </div>
</div>

<style>
  .settings-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.35);
    display: flex; align-items: center; justify-content: center; z-index: 210;
  }
  .settings-panel {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 1.5rem; width: min(400px, 90vw);
    display: flex; flex-direction: column; gap: 1rem;
    box-shadow: 0 20px 50px rgba(0,0,0,.18);
    max-height: min(85vh, 720px);
    overflow-y: auto;
  }
  .settings-panel h3 { margin: 0; font-size: 1rem; letter-spacing: -.01em; }
  .setting-hint { margin: 0; font-size: .74rem; color: var(--faint); line-height: 1.5; }

  .settings-actions { display: flex; justify-content: flex-end; gap: .5rem; }
  .settings-actions button {
    padding: .45rem .95rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .85rem; font-weight: 500;
  }
  .settings-actions button:disabled { opacity: .5; cursor: default; }
  .save-btn { background: var(--text) !important; color: var(--bg) !important; border-color: var(--text) !important; }

  .integrity-list {
    display: flex; flex-direction: column; gap: 3px;
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: .5rem .65rem; max-height: 140px; overflow-y: auto;
  }
  .integrity-row { font-size: .74rem; color: var(--muted); line-height: 1.4; }

  .maint-panel { gap: .85rem; }

  .progress-track { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width .3s var(--ease); }

  .maint-steps { display: flex; flex-direction: column; gap: .5rem; }
  .maint-step { display: flex; align-items: center; gap: .6rem; padding: .4rem .1rem; border-radius: var(--radius-sm); }
  .maint-step.running { background: color-mix(in srgb, var(--accent) 8%, transparent); }

  .maint-step-icon {
    width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: .7rem; font-weight: 700; color: var(--faint);
    border: 1.5px solid var(--border-strong);
  }
  .maint-step-icon.done    { color: var(--success); border-color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); }
  .maint-step-icon.skipped { color: var(--faint); }
  .maint-step-icon.error   { color: var(--danger); border-color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
  .maint-step-icon.running { border-color: var(--accent); }

  .spinner {
    width: 9px; height: 9px; border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-top-color: var(--accent);
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .maint-step-label { font-size: .84rem; color: var(--text); flex: 1; }
  .maint-step-note { font-size: .72rem; color: var(--faint); text-align: right; white-space: nowrap; }
</style>
