<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { syncState, getAllDeletedTasks, getArchivedProjects, subscribe } from '../../db';
  import { showError } from '../../store';
  import { getSyncUrl, isSyncEnabled, getNotificationsEnabled, isAppLockEnabled, isTauri, isNativePlatform } from '../../../config';
  import { getThemeMode } from '../../theme';
  import { fmtLastSynced } from '../../utils';
  import TopBar from '../TopBar.svelte';
  import { push } from '../nav';
  import { I } from '../icons';
  import { MARK_PATHS } from '../mark';
  import { staleHostAlert } from '../../discovery';
  import { runSyncNow, syncing } from './syncNow';
  import { permissionState } from '../../notifications';

  // Read at mount: this screen remounts each time a settings page pops back to it.
  const theme = getThemeMode();
  const notifications = getNotificationsEnabled();
  const appLock = isAppLockEnabled();
  const syncOn = isSyncEnabled();
  const syncUrl = getSyncUrl();

  let status = syncState.status;
  let lastSynced = syncState.lastSynced;
  let syncError = syncState.error;
  let conflicts = syncState.conflictCount;
  function onSync() {
    status = syncState.status;
    lastSynced = syncState.lastSynced;
    syncError = syncState.error;
    conflicts = syncState.conflictCount;
  }
  syncState.listeners.add(onSync);
  onDestroy(() => syncState.listeners.delete(onSync));

  // The three things that decide whether your tasks are safe and reach you,
  // each a tile that opens its page.
  $: syncTile =
    !syncOn ? { value: 'Off', tone: '' } :
    !syncUrl ? { value: 'Not set up', tone: '' } :
    status === 'error' ? { value: 'Error', tone: 'bad' } :
    status === 'syncing' ? { value: 'Syncing…', tone: 'ok' } :
    status === 'offline' ? { value: 'Offline', tone: '' } :
    { value: lastSynced ? fmtLastSynced(lastSynced) : 'Waiting', tone: 'ok' };
  $: remindTile = !notifications ? { value: 'Off', tone: '' } : $permissionState === 'denied' ? { value: 'Blocked', tone: 'bad' } : $permissionState === 'granted' ? { value: 'On', tone: 'ok' } : { value: 'Not yet', tone: '' };
  $: lockTile = appLock ? { value: 'On', tone: 'ok' } : { value: 'Off', tone: '' };
  $: alert = $staleHostAlert ? 'Paired computer not found. Pair again' : status === 'error' && syncError ? syncError : conflicts > 0 ? `${conflicts} sync conflict${conflicts === 1 ? '' : 's'} to resolve` : '';

  $: canSync = syncOn && !!syncUrl;

  let trashCount: number | null = null;
  let archivedCount: number | null = null;
  async function load() {
    try {
      const [t, a] = await Promise.all([getAllDeletedTasks(), getArchivedProjects()]);
      trashCount = t.length;
      archivedCount = a.length;
    } catch {
      showError('Failed to load settings.');
    }
  }
  onMount(() => {
    load();
    return subscribe(() => load());
  });

  // Same source as Settings → Advanced on desktop: the native shell's own version.
  let version = '';
  if (isTauri()) {
    import('@tauri-apps/api/app').then(({ getVersion }) => getVersion()).then(v => { version = v; }).catch(() => {});
  } else if (isNativePlatform()) {
    import('@capacitor/app').then(({ App }) => App.getInfo()).then(info => { version = info.version; }).catch(() => {});
  }

  const go = (page: string) => push({ k: 'set', page });
  const THEME = { system: 'System', light: 'Light', dark: 'Dark' };

  type Row = { page: string; icon: string; label: string; value?: string };
  $: groups = [
    [
      { page: 'appearance', icon: I.setSun, label: 'Appearance', value: THEME[theme] },
      { page: 'notifications', icon: I.bell, label: 'Reminders', value: remindTile.value },
      { page: 'security', icon: I.setLock, label: 'App lock', value: appLock ? 'On' : 'Off' },
    ],
    [
      { page: 'organize', icon: I.setBox, label: 'Spaces, tags & fields' },
      { page: 'archived', icon: I.arch, label: 'Archived projects', value: archivedCount ? String(archivedCount) : '' },
      { page: 'data', icon: I.setDisk, label: 'Backup & restore' },
    ],
    [
      { page: 'trash', icon: I.trash, label: 'Recycle bin', value: trashCount ? String(trashCount) : '' },
      { page: 'history', icon: I.clock, label: 'History' },
      { page: 'advanced', icon: I.sliders, label: 'Advanced' },
    ],
  ] as Row[][];
</script>

<TopBar title="Settings" />

<div class="glance">
  <div class="head">
    <svg viewBox="0 0 1024 1024" aria-hidden="true">{#each MARK_PATHS as d}<path {d} />{/each}</svg>
    <span class="who"><b>Offlog{version ? ` ${version}` : ''}</b><span>On this phone · no account</span></span>
    {#if canSync}<button class="p-tbtn" on:click={runSyncNow} disabled={$syncing || status === 'syncing'}>Sync now</button>{/if}
  </div>
  <div class="tiles">
    <button class="tile" on:click={() => go('sync')}><small>Sync</small><strong class={syncTile.tone}>{syncTile.value}</strong></button>
    <button class="tile" on:click={() => go('notifications')}><small>Reminders</small><strong class={remindTile.tone}>{remindTile.value}</strong></button>
    <button class="tile" on:click={() => go('security')}><small>App lock</small><strong class={lockTile.tone}>{lockTile.value}</strong></button>
  </div>
  {#if alert}<button class="alert" on:click={() => go('sync')}>{alert}</button>{/if}
</div>

{#each groups as rows}
  <div class="p-group">
    {#each rows as r (r.page)}
      <button class="p-row" on:click={() => go(r.page)}>
        <span class="p-ico">{@html r.icon}</span>
        <span class="p-k"><span>{r.label}</span></span>
        {#if r.value}<span class="p-v">{r.value}</span>{/if}
        <span class="chev">{@html I.chev}</span>
      </button>
    {/each}
  </div>
{/each}


<style>
  .chev { display: flex; color: var(--faint); margin-left: 2px; }
  .p-v + .chev { margin-left: 0; }
  .p-row > .p-k + .chev { margin-left: auto; }
  .glance { background: var(--surface); border-radius: 16px; box-shadow: var(--p-shadow); padding: 16px; margin: 2px 0 14px; }
  .head { display: flex; align-items: center; gap: 12px; }
  .head svg { width: 36px; height: 36px; flex-shrink: 0; fill: var(--accent); }
  .who { flex: 1; min-width: 0; }
  .who b { display: block; font-size: var(--p-fs-l); }
  .who > span { font-size: var(--p-fs-s); color: var(--faint); }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
  .tile { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; padding: 10px 12px; border: 0; border-radius: 12px; cursor: pointer; text-align: left; font: inherit; color: var(--text); background: color-mix(in srgb, var(--text) 6%, var(--surface)); }
  .tile:active { background: color-mix(in srgb, var(--text) 12%, var(--surface)); }
  .tile small { font-size: var(--p-fs-xs); color: var(--muted); }
  .tile strong { font-size: var(--p-fs-m); font-weight: 600; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile strong.ok { color: var(--success-ink); }
  .tile strong.bad { color: var(--danger); }
  .alert { display: block; width: 100%; margin-top: 10px; padding: 10px 12px; border: 0; border-radius: 10px; text-align: left; font: inherit; font-size: var(--p-fs-s); font-weight: 600; cursor: pointer; color: var(--overdue-ink); background: var(--overdue-bg); }
</style>
