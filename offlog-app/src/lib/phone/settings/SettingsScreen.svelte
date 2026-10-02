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

  $: sync =
    !syncOn ? { title: 'Sync is off', sub: 'Everything stays on this device', tone: 'off' } :
    !syncUrl ? { title: 'Sync is on', sub: 'Not connected yet', tone: 'off' } :
    status === 'error' ? { title: 'Sync error', sub: syncError || 'Something went wrong', tone: 'error' } :
    status === 'syncing' ? { title: 'Syncing…', sub: lastSynced ? `Last synced ${fmtLastSynced(lastSynced)}` : 'First sync', tone: 'ok' } :
    status === 'offline' ? { title: 'Offline', sub: 'Resumes on your network', tone: 'off' } :
    { title: 'Sync is on', sub: lastSynced ? `Last synced ${fmtLastSynced(lastSynced)}` : 'Waiting for the first sync', tone: 'ok' };

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

  // Each row's icon sits on a small tile in one of the app's own colours.
  type Row = { page: string; icon: string; label: string; value?: string; tone: string };
  $: groups = [
    [
      { page: 'appearance', icon: I.setSun, label: 'Appearance', value: THEME[theme], tone: 'var(--accent)' },
      { page: 'notifications', icon: I.bell, label: 'Notifications', value: !notifications ? 'Off' : $permissionState === 'denied' ? 'Blocked' : 'On', tone: 'var(--amber)' },
      { page: 'security', icon: I.setLock, label: 'App lock', value: appLock ? 'On' : 'Off', tone: 'var(--success)' },
    ],
    [
      { page: 'organize', icon: I.setBox, label: 'Spaces, tags & fields', tone: 'var(--accent)' },
      { page: 'archived', icon: I.arch, label: 'Archived projects', value: archivedCount ? String(archivedCount) : '', tone: 'var(--faint)' },
      { page: 'data', icon: I.setDisk, label: 'Backup & restore', tone: 'var(--success)' },
    ],
    [
      { page: 'trash', icon: I.trash, label: 'Recycle bin', value: trashCount ? String(trashCount) : '', tone: 'var(--danger)' },
      { page: 'history', icon: I.clock, label: 'History', tone: 'var(--amber)' },
      { page: 'advanced', icon: I.sliders, label: 'Advanced', tone: 'var(--faint)' },
    ],
  ] as Row[][];
</script>

<TopBar title="Settings" />

<div class="about">
  <svg viewBox="0 0 1024 1024" aria-hidden="true">{#each MARK_PATHS as d}<path {d} />{/each}</svg>
  <span><b>Offlog</b><span>On this device · no account{version ? ` · ${version}` : ''}</span></span>
</div>

<div class="p-group synccard">
  <button class="p-row" on:click={() => go('sync')}>
    <span class="p-dot {$staleHostAlert ? 'error' : sync.tone}"></span>
    <span class="p-k">
      <b>{sync.title}</b>
      {#if $staleHostAlert}
        <span class="p-sub conf">Paired computer not found — pair again</span>
      {:else}
        <span class="p-sub">{sync.sub}{#if conflicts > 0}{' · '}<span class="conf">{conflicts} conflict{conflicts === 1 ? '' : 's'}</span>{/if}</span>
      {/if}
    </span>
    {#if !canSync}<span class="chev">{@html I.chev}</span>{/if}
  </button>
  {#if canSync}
    <button class="p-tbtn now" on:click={runSyncNow} disabled={$syncing || status === 'syncing'}>Sync now</button>
  {/if}
</div>

{#each groups as rows}
  <div class="p-group">
    {#each rows as r (r.page)}
      <button class="p-row" on:click={() => go(r.page)}>
        <span class="p-ico tile" style:--tone={r.tone}>{@html r.icon}</span>
        <span class="p-k"><span>{r.label}</span></span>
        {#if r.value}<span class="p-v">{r.value}</span>{/if}
        <span class="chev">{@html I.chev}</span>
      </button>
    {/each}
  </div>
{/each}


<style>
  .synccard { margin-top: 6px; display: flex; align-items: center; padding-right: 6px; }
  .synccard .p-row { flex: 1; min-width: 0; }
  .now { flex-shrink: 0; }
  .synccard b { font-size: 15.5px; }
  .synccard .p-dot { width: 10px; height: 10px; background: var(--faint); }
  .synccard .p-dot.ok { background: var(--success); }
  .synccard .p-dot.error { background: var(--danger); }
  .conf { color: var(--overdue-ink); }
  .chev { display: flex; color: var(--faint); margin-left: 2px; }
  .p-v + .chev { margin-left: 0; }
  .p-row > .p-k + .chev { margin-left: auto; }
  .about { display: flex; align-items: center; gap: 14px; margin: 2px 0 14px; padding: 16px; border-radius: 16px; background: var(--hero); color: var(--on-hero); }
  .about svg { width: 40px; height: 40px; flex-shrink: 0; fill: currentColor; }
  .about b { display: block; font-size: var(--p-fs-xl); }
  .about > span > span { font-size: var(--p-fs-s); opacity: .88; }
  /* Light mode darkens each tone toward --text so a white icon reads on it;
     dark mode's tones are light already, and --on-accent turns dark there. */
  .tile { width: 30px; height: 30px; border-radius: 9px; background: color-mix(in srgb, var(--tone) 82%, var(--text)); color: var(--on-accent); }
  :global(body.dark) .tile { background: var(--tone); }
  .tile :global(svg.i) { width: 18px; height: 18px; }
</style>
