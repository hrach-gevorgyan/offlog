<script lang="ts">
  // Settings → Backup & restore on the phone: back up, restore, export, as
  // rows. PrefsPage owns the work; this is only the page.
  import { fmtLastSynced } from '../../utils';
  import { isNativePlatform } from '../../../config';
  import { I } from '../icons';

  export let scopeLabel: string;
  export let pickScope: () => void;
  export let doBackup: () => void;
  export let autoBackupEnabled: boolean;
  export let toggleAutoBackup: () => void;
  export let lastAutoBackupAt: string | null;
  export let importStatus: string;
  export let handleImport: () => void;
  export let importBusy: boolean;
  export let doExportCSV: () => void;
  export let storageAvailable: boolean;
  export let storagePercent: number;

  // Only worth a word once the quota is nearly used.
  const STORAGE_WARN_THRESHOLD = 0.8;
  const native = isNativePlatform();
</script>

<div class="bk">
  <div class="p-sec" role="heading" aria-level="2">Back up</div>
  <div class="p-group">
    <button class="p-row" aria-label="Back up now" on:click={doBackup}>
      <span class="ri">{@html I.down}</span>
      <span class="p-k"><span>Back up now</span><span class="p-sub">Saves a file you keep anywhere</span></span>
      <span class="chev">{@html I.chev}</span>
    </button>
    <button class="p-row" aria-label="What to include: {scopeLabel}" on:click={pickScope}>
      <span class="ri">{@html I.setBox}</span>
      <span class="p-k"><span>What to include</span></span>
      <span class="p-v">{scopeLabel}</span>
      <span class="chev">{@html I.chev}</span>
    </button>
    {#if native}
      <button class="p-row" role="switch" aria-checked={autoBackupEnabled} aria-label="Daily safety copy" on:click={toggleAutoBackup}>
        <span class="ri">{@html I.clock}</span>
        <span class="p-k"><span>Daily safety copy</span><span class="p-sub">Keeps the last 7 on this phone{autoBackupEnabled && lastAutoBackupAt ? ` · last ${fmtLastSynced(lastAutoBackupAt)}` : ''}</span></span>
        <span class="p-sw" class:on={autoBackupEnabled}></span>
      </button>
    {/if}
  </div>

  <div class="p-sec" role="heading" aria-level="2">Restore</div>
  <div class="p-group">
    <button class="p-row" aria-label="Restore from a file" on:click={handleImport} disabled={importBusy}>
      <span class="ri">{@html I.up}</span>
      <span class="p-k"><span>Restore from a file</span><span class="p-sub" role="status">{importStatus || 'Shows what’s inside before anything changes'}</span></span>
      <span class="chev">{@html I.chev}</span>
    </button>
  </div>

  <div class="p-sec" role="heading" aria-level="2">Export</div>
  <div class="p-group">
    <button class="p-row" aria-label="Export as spreadsheet" on:click={doExportCSV}>
      <span class="ri">{@html I.grid}</span>
      <span class="p-k"><span>Export as spreadsheet</span><span class="p-sub">CSV for Excel or Sheets. Can’t be restored</span></span>
      <span class="chev">{@html I.chev}</span>
    </button>
  </div>

  {#if storageAvailable && storagePercent >= STORAGE_WARN_THRESHOLD}
    <p class="warn" role="status">Storage is {(storagePercent * 100).toFixed(0)}% full. Use Check and repair in Advanced, or free up space.</p>
  {/if}
</div>

<style>
  .ri { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); background: var(--col-bg); }
  .chev { display: flex; margin-left: auto; color: var(--faint); }
  .p-k + .p-v { margin-left: auto; }
  .p-v + .chev { margin-left: 0; }
  .warn { margin: 6px 4px 0; font-size: var(--p-fs-s); color: var(--danger); }
</style>
