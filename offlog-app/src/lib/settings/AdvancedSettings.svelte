<script lang="ts">
  import { fmtLastSynced } from '../utils';
  import { isNativePlatform } from '../../config';

  export let isTauri: boolean;
  export let isTauriDebug: boolean;
  export let showMaintenanceModal: boolean;
  export let autoUpdateCheckEnabled: boolean;
  export let toggleAutoUpdateCheck: () => void;
  export let appVersion: string;
  export let updateChecking: boolean;
  export let updateStatus: string;
  export let onCheckForUpdate: () => void;
  export let syncEnabled: boolean;
  export let syncUrl: string;
  export let credentialUser: string;
  export let credentialPass: string;
  export let syncError: string | null;
  export let lastErrorAt: string | null;
  export let resetBusy: boolean;
  export let resetPcTestData: () => void;
</script>

              <div class="setting-group">
                <div class="setting-section-title">Maintenance</div>
                <button class="link-row link-row-compact" on:click={() => showMaintenanceModal = true}>
                  <span class="link-row-title">Run maintenance</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
                <p class="setting-hint">Checks your data for problems, repairs what it safely can, and clears old history.</p>
              </div>

              {#if isTauri}
                <div class="setting-group">
                  <div class="setting-section-title">Software updates</div>
                  <div class="setting-row">
                    <span class="setting-label">Check automatically in the background</span>
                    <button class="toggle-btn" class:on={autoUpdateCheckEnabled} on:click={toggleAutoUpdateCheck} aria-label="Toggle automatic update checks" role="switch" aria-checked={autoUpdateCheckEnabled}>
                      <span class="toggle-knob"></span>
                    </button>
                  </div>
                  <div class="setting-row">
                    <span class="setting-label">Version {appVersion || '—'}</span>
                    <button class="export-btn" on:click={onCheckForUpdate} disabled={updateChecking}>
                      {updateChecking ? 'Checking…' : 'Check for updates'}
                    </button>
                  </div>
                  {#if updateStatus}<p class="setting-hint compact-hint">{updateStatus}</p>{/if}
                </div>
              {:else if isNativePlatform()}
                <div class="setting-group">
                  <div class="setting-section-title">About</div>
                  <div class="setting-row">
                    <span class="setting-label">Version</span>
                    <span class="setting-value">{appVersion || '—'}</span>
                  </div>
                  <p class="setting-hint">Updates on this platform come through the Play Store.</p>
                </div>
              {/if}

              {#if syncEnabled}
                <div class="setting-group">
                  <div class="setting-section-title">Manual server connection (advanced)</div>
                  <p class="setting-hint">Most people never need this — the "Find my computer" option above already handles connecting for you. This is only for advanced users running their own sync server by hand, instead of pairing a device.</p>
                  <label class="field-label">
                    Server address (must be a CouchDB-protocol-compatible server)
                    <input bind:value={syncUrl} placeholder="http://192.168.1.100:5984/offlog" />
                  </label>
                  <label class="field-label">
                    Username
                    <input bind:value={credentialUser} placeholder="offlog" />
                  </label>
                  <label class="field-label">
                    Password
                    <input type="password" bind:value={credentialPass} />
                  </label>
                  {#if syncError && lastErrorAt}
                    <p class="setting-hint setting-hint-warn">Last error at {fmtLastSynced(lastErrorAt)}: {syncError}</p>
                  {/if}
                </div>
              {:else}
                <div class="setting-group">
                  <div class="setting-section-title">Manual server connection (advanced)</div>
                  <p class="setting-hint">Turn on Sync (in the Sync tab) to configure this.</p>
                </div>
              {/if}

              {#if isTauriDebug}
                <div class="setting-group">
                  <div class="setting-section-title">Debug build only</div>
                  <p class="setting-hint">Wipes every task/project on this PC and restarts — for testing what a real first-run install looks like, never shown in a release build.</p>
                  <button class="export-btn" on:click={resetPcTestData} disabled={resetBusy}>
                    {resetBusy ? 'Resetting…' : 'Reset test data'}
                  </button>
                </div>
              {/if}
