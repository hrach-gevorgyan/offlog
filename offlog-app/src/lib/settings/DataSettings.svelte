<script lang="ts">
  import CustomSelect from '../CustomSelect.svelte';
  import { formatAttachmentSize } from '../attachments';
  import { fmtLastSynced } from '../utils';
  import { isNativePlatform, isTauri as isTauriCheck } from '../../config';
  import type { StorageBreakdown } from '../db';

  // Only warn once usage is close enough to the browser-assigned quota to
  // matter; below this the storage line stays a quiet fact, not a nag.
  const STORAGE_WARN_THRESHOLD = 0.8;

  export let storageAvailable: boolean;
  export let storagePercent: number;
  export let storageInfo: string;
  export let backupUsage: { count: number; bytes: number } | null = null;
  export let breakdown: StorageBreakdown | null;
  export let autoBackupEnabled: boolean;
  export let toggleAutoBackup: () => void;
  export let lastAutoBackupAt: string | null;
  export let backupScope: string;
  export let backupScopeOptions: { value: string; label: string }[];
  export let doBackup: () => void;
  export let doExportCSV: () => void;
  export let importStatus: string;
  export let handleImport: () => void;
</script>

              <div class="setting-group">
                <div class="setting-section-title">Storage</div>
                <div class="storage-summary">
                  {#if !storageAvailable}
                    <span class="storage-headline">Storage info not available in this browser</span>
                  {:else if storagePercent >= STORAGE_WARN_THRESHOLD}
                    <span class="storage-headline storage-headline-warn">Storage is getting full ({(storagePercent * 100).toFixed(0)}%)</span>
                    <span class="storage-detail">{storageInfo}</span>
                  {:else}
                    <span class="storage-headline">Your data is tiny — nothing to worry about</span>
                    <span class="storage-detail">{storageInfo || 'Calculating…'}</span>
                  {/if}
                </div>
                {#if storageAvailable && storagePercent >= STORAGE_WARN_THRESHOLD}
                  <p class="setting-hint setting-hint-warn">
                    Try the maintenance tools in Advanced (prune old history, empty Recycle), or free up
                    space on this device — once storage is truly full, new changes would stop saving.
                  </p>
                {/if}
                {#if breakdown}
                  <p class="setting-hint">
                    {breakdown.activeTasks} active task{breakdown.activeTasks === 1 ? '' : 's'} ·
                    {breakdown.archivedTasks} archived ·
                    {breakdown.deletedTasks} in Recycle ·
                    {breakdown.logEntries} history entries
                    {#if breakdown.attachmentCount}
                      · {breakdown.attachmentCount} attachment{breakdown.attachmentCount === 1 ? '' : 's'} ({formatAttachmentSize(breakdown.attachmentBytes)})
                    {/if}
                  </p>
                {/if}
                {#if backupUsage && backupUsage.count > 0}
                  <p class="setting-hint">
                    Plus {backupUsage.count} automatic backup{backupUsage.count === 1 ? '' : 's'}
                    ({formatAttachmentSize(backupUsage.bytes)}) saved on this device. Each one is a full
                    copy, attachments included, so these grow with your files rather than your task count.
                  </p>
                {/if}
              </div>

              {#if isNativePlatform() || isTauriCheck()}
              <div class="setting-group">
                <div class="setting-section-title">Automatic backups</div>
                <div class="setting-row">
                  <span class="setting-label">Back up automatically</span>
                  <button class="toggle-btn" class:on={autoBackupEnabled} on:click={toggleAutoBackup} aria-label="Toggle automatic backups" role="switch" aria-checked={autoBackupEnabled}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                <p class="setting-hint">
                  {#if lastAutoBackupAt}
                    Last saved: {fmtLastSynced(lastAutoBackupAt)}. This stays on your device, so it won't
                    help if your device is lost or breaks — use "Back up" below for a copy you can keep
                    somewhere else too.
                  {:else}
                    Saves a safety copy on your device every day, automatically. This won't help if your
                    device is lost or breaks — use "Back up" below for a copy you can keep somewhere else too.
                  {/if}
                </p>
              </div>
              {/if}

              <div class="setting-group">
                <div class="setting-section-title">Back up</div>
                <p class="setting-hint">Everything, or just one project — either can be restored later.</p>
                <div class="setting-row">
                  <div class="project-export-select">
                    <CustomSelect options={backupScopeOptions} bind:value={backupScope} />
                  </div>
                  <button class="export-btn" on:click={doBackup}>Back up</button>
                </div>
                <div class="setting-row">
                  <span class="storage-info" style="color: var(--muted)">Every task, one row, for a spreadsheet (one-way, can't be restored)</span>
                  <button class="export-btn" on:click={doExportCSV}>Export CSV</button>
                </div>
              </div>

              <div class="setting-group">
                <div class="setting-section-title">Restore</div>
                <div class="setting-row">
                  <span class="storage-info" style="color: var(--muted)">{importStatus || 'Restore from a backup file'}</span>
                  <button class="export-btn" on:click={handleImport}>Choose backup file</button>
                </div>
              </div>

