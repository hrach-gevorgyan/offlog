<script lang="ts">
  import { otherHostsDetected } from '../../config';
  import { timeAgo } from '../utils';
  import type { ConflictInfo } from '../db';

  export let isAndroid: boolean;
  export let isTauri: boolean;
  export let syncEnabled: boolean;
  export let toggleSyncEnabled: () => void;
  export let connectionStatus: { text: string; tone: string };
  export let showConnectModal: boolean;
  export let showConflictsModal: boolean;
  export let deviceName: string;
  export let saveDeviceName: () => void;
  export let deviceLastSeen: { device: string; lastSeen: string }[];
  export let conflictCount: number;
  export let conflictList: ConflictInfo[];
</script>

              <div class="setting-group">
                <div class="setting-section-title">Status</div>
                <div class="setting-row">
                  <span class="setting-label">{syncEnabled ? 'Sync enabled' : 'Sync paused'}</span>
                  <button class="toggle-btn" class:on={syncEnabled} on:click={toggleSyncEnabled} aria-label="Toggle sync" role="switch" aria-checked={syncEnabled}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                <p class="setting-hint" class:setting-hint-warn={connectionStatus.tone === 'warn'} class:success-hint={connectionStatus.tone === 'ok'}>{connectionStatus.text}</p>
                {#if syncEnabled && isTauri && $otherHostsDetected.length}
                  <p class="setting-hint setting-hint-warn">
                    Another Offlog host ("{$otherHostsDetected[0].name}") was found on this
                    network. Running two hosts on the same network means they won't share
                    data — make sure every device pairs with only one.
                  </p>
                {/if}
              </div>

              {#if syncEnabled}
                <div class="setting-group">
                  <div class="setting-section-title">Connect a device</div>
                  {#if isAndroid || isTauri}
                    <button class="link-row link-row-compact" on:click={() => showConnectModal = true}>
                      <span class="link-row-title">Connect a device</span>
                      <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                    </button>
                  {:else}
                    <p class="setting-hint">Happens from the Android app (Settings → Sync → "Find my computer") or the PC app (Settings → Sync → "Generate a code") — not from a plain web browser.</p>
                  {/if}
                </div>

                <div class="setting-group">
                  <div class="setting-section-title">This device</div>
                  <label class="field-label">
                    Name
                    <input bind:value={deviceName} placeholder="PC" on:blur={saveDeviceName} enterkeyhint="done"
                      on:keydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
                  </label>
                  <p class="setting-hint">Shown on this device's own edits from now on — changelog entries, task history, and the list below.</p>
                </div>

                {#if deviceLastSeen.length}
                  <div class="setting-group">
                    <div class="setting-section-title">Devices seen recently</div>
                    {#each deviceLastSeen as d (d.device)}
                      <div class="setting-row">
                        <span class="storage-info">{d.device}</span>
                        <span class="storage-info" style="color: var(--faint)">{timeAgo(d.lastSeen)}</span>
                      </div>
                    {/each}
                  </div>
                {/if}

                {#if conflictCount > 0 || conflictList.length > 0}
                  <div class="setting-group">
                    <div class="setting-section-title">Conflicts</div>
                    <button class="link-row link-row-compact" on:click={() => showConflictsModal = true}>
                      <span class="link-row-title">Resolve conflicts</span>
                      <span class="nav-badge">{conflictList.length || conflictCount}</span>
                    </button>
                  </div>
                {/if}
              {/if}

