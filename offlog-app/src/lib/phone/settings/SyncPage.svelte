<script lang="ts">
  // Settings → Sync on the phone: SyncSettings' behaviour (toggle, status,
  // pairing on Android and PC, device name, devices seen, conflicts) with
  // phone chrome. The server address itself lives in Advanced.
  import { onDestroy, onMount } from 'svelte';
  import {
    syncState, startSync, cancelSync, getDeviceLastSeen,
    getConflicts, resolveConflict, getCustomFieldDefs, type ConflictInfo, type ConflictVersion,
  } from '../../db';
  import { showError } from '../../store';
  import { confirmAction } from '../../confirm';
  import { getSyncUrl, getDeviceName, setDeviceName, isSyncEnabled, setSyncEnabled, shouldAskDeviceNameForSync, markDeviceNameAskedForSync, isTauri as isTauriCheck, invokeTauri, otherHostsDetected, getPairedHostName, getPairedHostUuid } from '../../../config';
  import { fmtLastSynced, timeAgo } from '../../utils';
  import { discoveredHosts, isScanning, scanForHosts, stopScan, pairWithHost, staleHostAlert, type DiscoveredHost } from '../../discovery';
  import TopBar from '../TopBar.svelte';
  import Sheet from '../Sheet.svelte';
  import { push } from '../nav';
  import { I } from '../icons';
  import { runSyncNow, syncing } from './syncNow';

  const isAndroid = window.Capacitor?.getPlatform?.() === 'android';
  const isTauri = isTauriCheck();

  let syncUrl = getSyncUrl();
  let syncEnabled = isSyncEnabled();
  let deviceName = getDeviceName();

  let syncStatus = syncState.status;
  let lastSynced = syncState.lastSynced;
  let syncError = syncState.error;
  let conflictCount = syncState.conflictCount;
  function onSyncChange() {
    syncStatus = syncState.status;
    lastSynced = syncState.lastSynced;
    syncError = syncState.error;
    conflictCount = syncState.conflictCount;
  }
  syncState.listeners.add(onSyncChange);
  onDestroy(() => syncState.listeners.delete(onSyncChange));
  onDestroy(() => stopScan());

  // Every device syncs through the paired computer, so the card shows this
  // device's one link: here ↔ that computer.
  const pairedName = getPairedHostName();
  // A server typed in under Own server has no paired computer behind it.
  const ownServer = !!syncUrl && !getPairedHostUuid();
  const hubName = ownServer ? 'Your server' : pairedName || 'Your computer';
  const hubInText = ownServer ? 'your server' : pairedName || 'your computer';
  const here = isAndroid ? 'phone' : 'device';
  type Card = { tone: 'ok' | 'idle' | 'bad'; title: string; text: string; act?: 'sync' | 'retry' | 'on' | 'connect' };
  $: card = ((): Card => {
    if (!syncUrl) return { tone: 'idle', title: 'Sync with your computer', text: `Keep this ${here} and your computer in step over your own Wi-Fi. Nothing goes to the cloud.`, act: isAndroid ? 'connect' : undefined };
    if (!syncEnabled) return { tone: 'idle', title: 'Sync is off', text: `Everything stays on this ${here}.`, act: 'on' };
    if ($staleHostAlert) return { tone: 'bad', title: `Can't find ${hubInText}`, text: `“${$staleHostAlert.name}” is on this network. Connect to it again.`, act: isAndroid ? 'connect' : undefined };
    if (syncStatus === 'syncing') return { tone: 'ok', title: 'Syncing…', text: lastSynced ? `Synced ${fmtLastSynced(lastSynced)}` : 'First sync', act: 'sync' };
    if (syncStatus === 'offline') return { tone: 'idle', title: 'Offline', text: `Sync picks up again when this ${here} is back on your network.`, act: 'sync' };
    if (syncStatus === 'error') return /cannot reach/i.test(syncError ?? '')
      ? { tone: 'bad', title: `Can't reach ${hubInText}`, text: ownServer ? 'Check that the server is on and its address is right. Your changes are safe here until then.' : 'Open Offlog on the computer and make sure both are on the same Wi-Fi. Your changes are safe here until then.', act: 'retry' }
      : { tone: 'bad', title: 'Sync stopped', text: `${syncError || 'Something went wrong.'} Your changes are safe here.`, act: 'retry' };
    if (lastSynced) return { tone: 'ok', title: 'Up to date', text: `Synced ${fmtLastSynced(lastSynced)}`, act: 'sync' };
    return { tone: 'ok', title: 'Waiting for the first sync', text: 'This can take a minute.', act: 'sync' };
  })();

  // The first time Sync goes on, the device name is asked for: it labels
  // this device's edits on the others.
  function toggleSyncEnabled() {
    syncEnabled = !syncEnabled;
    setSyncEnabled(syncEnabled);
    if (syncEnabled) startSync().catch(() => {}); else cancelSync();
    if (syncEnabled && shouldAskDeviceNameForSync()) { markDeviceNameAskedForSync(); openRename(); }
  }

  // ── Devices ──
  let deviceLastSeen: { device: string; lastSeen: string }[] = [];
  async function loadDeviceLastSeen() {
    try {
      deviceLastSeen = await getDeviceLastSeen();
    } catch {
      showError('Failed to load recent devices.');
    }
  }
  loadDeviceLastSeen();
  // The card already shows this device and the computer.
  $: others = deviceLastSeen.filter(d => d.device !== deviceName && d.device !== hubName);
  const DAY = 24 * 3600e3;
  const recent = (iso: string) => Date.now() - new Date(iso).getTime() < DAY;

  let showRename = false, renameSession = 0, nameDraft = '';
  function openRename() { nameDraft = deviceName; renameSession++; showRename = true; }
  // Sync that is already on (paired from another device) asks here, once.
  onMount(() => { if (syncEnabled && shouldAskDeviceNameForSync()) { markDeviceNameAskedForSync(); openRename(); } });
  function saveName(close: () => void) {
    setDeviceName(nameDraft);
    deviceName = getDeviceName();
    close();
  }

  // ── Connect a device ──
  // Sheet calls closeOnBack() at setup, so each real open needs a fresh {#key}.
  let showConnect = false, connectSession = 0;
  function openConnect() { connectSession++; showConnect = true; }

  let selectedHost: DiscoveredHost | null = null;
  let pairingCode = '';
  let pairingBusy = false;
  let pairingError = '';
  // "Incorrect or expired code" never says which, so repeated failures nudge
  // toward the fix generically.
  let pairingFailCount = 0;
  let pairSuccessName: string | null = null;
  let scanAttempted = false;
  function startDeviceScan() {
    selectedHost = null;
    pairingError = '';
    pairSuccessName = null;
    scanAttempted = true;
    scanForHosts();
  }
  $: scanFoundNothing = scanAttempted && !$isScanning && $discoveredHosts.length === 0;

  async function submitPairingCode() {
    if (!selectedHost) return;
    pairingBusy = true;
    pairingError = '';
    try {
      const pairedName = selectedHost.name;
      await pairWithHost(selectedHost, pairingCode);
      syncUrl = getSyncUrl();
      if (!syncEnabled) { syncEnabled = true; setSyncEnabled(true); }
      selectedHost = null;
      pairingCode = '';
      pairSuccessName = pairedName;
      pairingFailCount = 0;
    } catch (e) {
      pairingFailCount++;
      pairingError = e instanceof Error ? e.message : 'Failed to pair.';
      if (pairingFailCount >= 3) pairingError += ' Double-check the code on the PC screen, or generate a new one there.';
    } finally {
      pairingBusy = false;
    }
  }

  // PC side: the phone drives the handshake, so the PC learns of success from
  // the "pairing-succeeded" event and, for the name, by polling for a device
  // that wasn't seen before the code was generated.
  let pcPairingCode = '';
  let pcPairingBusy = false;
  let pcPairedDeviceName: string | null = null;
  let pcJustPaired = false;
  let pcPollTimer: ReturnType<typeof setInterval> | null = null;
  function stopPcPairPoll() { if (pcPollTimer) { clearInterval(pcPollTimer); pcPollTimer = null; } }
  // Mirrors pairing.rs's CODE_TTL (5 min) so a dead code is shown as expired.
  let pcPairingExpired = false;
  let pcPairingExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  function clearPcPairingExpiryTimer() { if (pcPairingExpiryTimer) { clearTimeout(pcPairingExpiryTimer); pcPairingExpiryTimer = null; } }
  async function startPcPairPoll() {
    stopPcPairPoll();
    let before: Set<string>;
    try {
      before = new Set((await getDeviceLastSeen()).map(d => d.device));
    } catch {
      showError('Failed to check for a connected device.');
      return;
    }
    pcPollTimer = setInterval(async () => {
      try {
        const now = await getDeviceLastSeen();
        const found = now.find(d => !before.has(d.device));
        if (found) { pcPairedDeviceName = found.device; stopPcPairPoll(); clearPcPairingExpiryTimer(); }
      } catch { /* next tick retries */ }
    }, 3000);
  }
  async function generatePcPairingCode() {
    pcPairingBusy = true;
    pcPairedDeviceName = null;
    pcJustPaired = false;
    pcPairingExpired = false;
    clearPcPairingExpiryTimer();
    try {
      pcPairingCode = await invokeTauri<string>('generate_pairing_code');
      pcPairingExpiryTimer = setTimeout(() => { pcPairingExpired = true; stopPcPairPoll(); }, 5 * 60 * 1000);
      startPcPairPoll();
    } catch {
      showError('Failed to generate a pairing code.');
    } finally {
      pcPairingBusy = false;
    }
  }
  let unlistenPairing: (() => void) | null = null;
  if (isTauri) {
    import('@tauri-apps/api/event').then(({ listen }) => listen('pairing-succeeded', () => {
      pcJustPaired = true;
      clearPcPairingExpiryTimer();
    })).then(u => { unlistenPairing = u; }).catch(() => {});
  }
  function onConnectClosed() {
    showConnect = false;
    stopPcPairPoll(); clearPcPairingExpiryTimer();
    pcPairedDeviceName = null; pcJustPaired = false; pairSuccessName = null; scanAttempted = false;
    stopScan();
    // A pairing may have added a device.
    loadDeviceLastSeen();
    if (syncUrl && syncEnabled && shouldAskDeviceNameForSync()) { markDeviceNameAskedForSync(); openRename(); }
  }
  onDestroy(() => { stopPcPairPoll(); clearPcPairingExpiryTimer(); unlistenPairing?.(); });

  // ── Conflicts ──
  let showConflicts = false, conflictsSession = 0;
  function openConflicts() { conflictsSession++; showConflicts = true; }
  let conflictList: ConflictInfo[] = [];
  let loadingConflicts = false;
  // Remembers which count was last attempted: without it a failing
  // getConflicts() re-fires the reactive load forever.
  let conflictsAttemptedFor = -1;
  let conflictFieldNames: Record<string, string> = {};
  async function loadConflicts() {
    loadingConflicts = true;
    try {
      conflictList = await getConflicts();
      const defs = await getCustomFieldDefs();
      conflictFieldNames = Object.fromEntries(defs.map(d => [d.id, d.name]));
    } catch {
      showError('Failed to load sync conflicts.');
    } finally { loadingConflicts = false; }
  }
  $: if (conflictCount > 0 && conflictCount !== conflictsAttemptedFor && !loadingConflicts) {
    conflictsAttemptedFor = conflictCount;
    loadConflicts();
  }
  $: conflictsShown = conflictList.length || conflictCount;

  async function resolve(c: ConflictInfo, v: ConflictVersion) {
    const losing = c.versions.length - 1;
    const ok = await confirmAction(
      `Keep this version of "${c.label}"? The other ${losing === 1 ? 'version' : `${losing} versions`} will be discarded permanently.`,
      { confirmLabel: 'Keep this one', danger: true },
    );
    if (!ok) return;
    try {
      await resolveConflict(c.docId, v.isCurrent ? 'current' : 'other', v.rev, c.versions.map(x => x.doc._rev));
      await loadConflicts();
    } catch (e) {
      if ((e as Error)?.name !== 'ConflictChangedError') { showError('Failed to resolve conflict. Please try again.'); return; }
      showError((e as Error).message);
      await loadConflicts();
    }
  }

  function fmtConflictValue(field: string, v: unknown): string {
    if (v === undefined || v === null || v === '') return '—';
    if (field === 'columns' && Array.isArray(v)) return v.map(c => (c as { name?: string })?.name ?? '?').join(' → ') || '—';
    if (field === 'checklist' && Array.isArray(v)) {
      if (!v.length) return '—';
      const done = v.filter(i => (i as { done?: boolean })?.done).length;
      const texts = v.map(i => (i as { text?: string })?.text ?? '').filter(Boolean);
      return `${v.length} item${v.length === 1 ? '' : 's'}, ${done} done — ${texts.join(', ')}`;
    }
    if (field === 'custom_values' && typeof v === 'object') {
      const pairs = Object.entries(v as Record<string, unknown>).map(([id, val]) => `${conflictFieldNames[id] ?? 'deleted field'}: ${val ?? '—'}`);
      return pairs.length ? pairs.join(', ') : '—';
    }
    if ((field === 'related' || field === 'blocked_by') && Array.isArray(v)) return v.length ? `${v.length} task${v.length === 1 ? '' : 's'}` : '—';
    if (Array.isArray(v)) return v.length ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(', ') : '—';
    if (typeof v === 'object') return JSON.stringify(v);
    const str = String(v);
    return str.length > 120 ? str.slice(0, 120) + '…' : str;
  }
  const CONFLICT_FIELD_LABELS: Record<string, string> = {
    title: 'Title', name: 'Name', body: 'Notes', priority: 'Priority',
    due_date: 'Due date', reminder_at: 'Reminder', tags: 'Tags',
    column_id: 'Status', checklist: 'Checklist', custom_values: 'Custom fields',
    related: 'Related', blocked_by: 'Blocked by', pinned: 'Pinned',
    archived: 'Archived', deleted: 'In trash', position: 'Order',
    columns: 'Statuses', color: 'Colour', icon: 'Icon', default_view: 'Default view',
  };
  const conflictFieldLabel = (f: string) => CONFLICT_FIELD_LABELS[f] ?? f;
</script>

<TopBar title="Sync" />


{#if syncEnabled && isTauri && $otherHostsDetected.length}
  <p class="warn">Another Offlog host (“{$otherHostsDetected[0].name}”) is on this network. Pair each device with only one.</p>
{/if}

<section class="card {card.tone}" aria-labelledby="sync-title">
  <div class="pair" aria-hidden="true">
    <span class="end me"><span class="circ">{@html isAndroid ? I.phone : I.monitor}</span><b>{deviceName}</b><small>This {here}</small></span>
    <span class="link"><i>{@html card.tone === 'ok' ? I.check : card.tone === 'bad' ? '!' : ''}</i></span>
    <span class="end"><span class="circ">{@html ownServer ? I.server : I.monitor}</span><b>{hubName}</b><small>Runs sync</small></span>
  </div>
  <h2 id="sync-title">{card.title}</h2>
  <p role="status">{card.text}</p>
  {#if card.act === 'sync'}
    <button class="cbtn" on:click={runSyncNow} disabled={$syncing || syncStatus === 'syncing'}>{@html I.repeat}Sync now</button>
  {:else if card.act === 'retry'}
    <button class="cbtn solid" on:click={runSyncNow} disabled={$syncing || syncStatus === 'syncing'}>{@html I.repeat}Try again</button>
  {:else if card.act === 'on'}
    <button class="cbtn solid" on:click={toggleSyncEnabled}>Turn on sync</button>
  {:else if card.act === 'connect'}
    <button class="cbtn solid" on:click={openConnect}>Connect to my computer</button>
  {/if}
</section>
{#if !isAndroid && !isTauri && !syncUrl}
  <p class="hint">Pair from the Android or PC app.</p>
{/if}

{#if syncEnabled && conflictsShown > 0}
  <div class="p-group">
    <button class="p-row" on:click={openConflicts}>
      <span class="p-k"><span>Conflicts</span><span class="p-sub">Edited on two devices. Pick which to keep.</span></span>
      <span class="p-v"><span class="badge">{conflictsShown}</span></span>
      <span class="chev">{@html I.chev}</span>
    </button>
  </div>
{/if}

{#if syncUrl && (others.length || isAndroid || isTauri)}
  <div class="p-sec" role="heading" aria-level="2">Other devices</div>
  <div class="p-group">
    {#each others as d (d.device)}
      <div class="p-row dev">
        <span class="ava" aria-hidden="true">{d.device.trim().charAt(0).toUpperCase() || '?'}</span>
        <span class="p-k">
          <span>{d.device}</span>
          <span class="p-sub seen"><span class="p-dot" class:fresh={recent(d.lastSeen)}></span>{recent(d.lastSeen) ? 'Synced' : 'Last seen'} {timeAgo(d.lastSeen)}</span>
        </span>
      </div>
    {/each}
    {#if isAndroid || isTauri}
      <button class="p-row acc" on:click={openConnect}>
        <span class="ri">{@html I.plus}</span>
        <span class="p-k"><span>Connect a device</span></span>
      </button>
    {/if}
  </div>
{/if}

<div class="p-sec" role="heading" aria-level="2">This {here}</div>
<div class="p-group">
  <button class="p-row" aria-label="Name, {deviceName}" on:click={openRename}>
    <span class="ri">{@html I.pen}</span>
    <span class="p-k"><span>Name</span><span class="p-sub">Shown on the changes you make</span></span>
    <span class="p-v set name">{deviceName}</span>
    <span class="chev">{@html I.chev}</span>
  </button>
  {#if syncUrl}
  <button class="p-row" role="switch" aria-checked={syncEnabled} on:click={toggleSyncEnabled}>
    <span class="ri">{@html I.repeat}</span>
    <span class="p-k"><span>Sync this {here}</span><span class="p-sub">Off keeps everything here only</span></span>
    <span class="p-sw" class:on={syncEnabled}></span>
  </button>
  {/if}
</div>

<div class="p-sec" role="heading" aria-level="2">Advanced</div>
<div class="p-group">
  <button class="p-row" on:click={() => push({ k: 'set', page: 'server' })}>
    <span class="ri">{@html I.server}</span>
    <span class="p-k"><span>Use my own server</span><span class="p-sub">{ownServer ? 'In use' : 'Instead of the computer'}</span></span>
    <span class="chev">{@html I.chev}</span>
  </button>
</div>

{#if showRename}
  {#key renameSession}
    <Sheet title="Device name" on:close={() => showRename = false} let:close>
      <!-- svelte-ignore a11y-autofocus -->
      <input class="p-fld" bind:value={nameDraft} aria-label="Device name" autofocus enterkeyhint="done"
        on:keydown={(e) => { if (e.key === 'Enter') saveName(close); }} />
      <p class="p-say">Shown on this device's edits.</p>
      <button class="p-go" on:click={() => saveName(close)}>Save</button>
    </Sheet>
  {/key}
{/if}

<!-- Sheets sit below ConfirmDialog (z 700) so "Keep this" can confirm on top. -->
<div class="under">
  {#if showConnect}
    {#key connectSession}
      <Sheet title="Connect a device" on:close={onConnectClosed} let:close>
        <div class="sh">
          {#if isAndroid}
            {#if pairSuccessName}
              <p class="ok">Connected to “{pairSuccessName}”. Syncing now.</p>
              <button class="p-go" on:click={close}>Done</button>
            {:else if !selectedHost}
              <button class="p-go" on:click={startDeviceScan} disabled={$isScanning}>
                {$isScanning ? 'Looking for your computer…' : 'Find my computer'}
              </button>
              {#if $discoveredHosts.length}
                <div class="p-group">
                  {#each $discoveredHosts as host (host.uuid)}
                    <button class="p-row" on:click={() => { selectedHost = host; stopScan(); }}>
                      <span class="p-k"><span>{host.name}</span></span><span class="p-v set">Connect</span>
                    </button>
                  {/each}
                </div>
              {/if}
              {#if scanFoundNothing}
                <p class="warn">No computer found. Turn on Sync there and use the same Wi-Fi, then try again.</p>
              {/if}
            {:else}
              <p class="p-say">Enter the code shown on “{selectedHost.name}”.</p>
              <input class="p-fld" bind:value={pairingCode} placeholder="123456" inputmode="numeric" maxlength="6" disabled={pairingBusy} aria-label="Pairing code" />
              {#if pairingError}<p class="warn">{pairingError}</p>{/if}
              <button class="p-go" on:click={submitPairingCode} disabled={pairingBusy || pairingCode.trim().length !== 6}>
                {pairingBusy ? 'Connecting…' : 'Connect'}
              </button>
              <button class="p-tbtn wide" on:click={() => { selectedHost = null; pairingCode = ''; pairingError = ''; pairingFailCount = 0; }} disabled={pairingBusy}>Cancel</button>
            {/if}
          {:else if isTauri}
            {#if pcPairedDeviceName}
              <p class="ok">Connected to “{pcPairedDeviceName}”. Syncing now.</p>
              <button class="p-go" on:click={close}>Done</button>
            {:else if pcJustPaired}
              <p class="ok">A device just connected. Syncing now.</p>
              <button class="p-go" on:click={close}>Done</button>
            {:else}
              {#if pcPairingCode && pcPairingExpired}
                <p class="warn">This code has expired. Generate a new one.</p>
              {:else if pcPairingCode}
                <p class="code">{pcPairingCode}</p>
                <p class="p-say">Enter it on your phone under Sync → Connect a device. Valid for 5 minutes.</p>
              {:else}
                <p class="p-say">Get a one-time code to enter on your phone.</p>
              {/if}
              <button class="p-go" on:click={generatePcPairingCode} disabled={pcPairingBusy}>
                {pcPairingBusy ? 'Generating…' : pcPairingCode ? 'New code' : 'Get a code'}
              </button>
            {/if}
          {/if}
        </div>
      </Sheet>
    {/key}
  {/if}

  {#if showConflicts}
    {#key conflictsSession}
      <Sheet title="Conflicts" on:close={() => showConflicts = false}>
        <div class="sh">
          <div class="crow">
            <span class="cmeta">
              {#if loadingConflicts}Loading…
              {:else if conflictList.length}{conflictList.length} item{conflictList.length === 1 ? '' : 's'} edited on two devices
              {:else}{conflictCount} conflict{conflictCount === 1 ? '' : 's'}{/if}
            </span>
            <button class="p-tbtn" on:click={loadConflicts} disabled={loadingConflicts}>Refresh</button>
          </div>
          {#each conflictList as c (c.docId)}
            <div class="p-group conflict">
              <div class="ctitle">{c.label} <span class="ctype">({c.type})</span></div>
              <div class="cnote">
                {#if c.differing.length}
                  Differs in {c.differing.map(conflictFieldLabel).join(', ')}. Keeping one discards the other{c.versions.length > 2 ? 's' : ''}.
                {:else}
                  Same on every device. Keep either.
                {/if}
              </div>
              {#each c.versions as v (v.rev || 'current')}
                <div class="cver">
                  <div class="crow">
                    <span class="cmeta">
                      {v.doc.source ?? 'Unknown device'}{v.doc.source === deviceName ? ' (this device)' : ''}{v.isCurrent ? ' · shown now' : ''}{v.isNewest ? ' · newest' : ''}
                      · {fmtLastSynced(String(v.doc.updated_at ?? v.doc.created_at ?? ''))}
                    </span>
                    <button class="p-tbtn" on:click={() => resolve(c, v)}>Keep this</button>
                  </div>
                  {#each c.differing as f}
                    <div class="cfield"><span class="cfname">{conflictFieldLabel(f)}</span><span>{fmtConflictValue(f, v.doc[f])}</span></div>
                  {/each}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </Sheet>
    {/key}
  {/if}
</div>

<style>
  .card { background: var(--surface); border-radius: 20px; box-shadow: var(--p-shadow); padding: 22px 18px 18px; margin-bottom: 14px; text-align: center; }
  .pair { display: flex; align-items: flex-start; justify-content: center; gap: 4px; margin-bottom: 16px; }
  .end { display: flex; flex-direction: column; align-items: center; width: 108px; min-width: 0; font-size: var(--p-fs-s); color: var(--faint); }
  .end b { margin-top: 8px; font-size: var(--p-fs-m); font-weight: 600; color: var(--text); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .circ { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    color: var(--accent-ink); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .me .circ { color: var(--on-accent); background: var(--accent); }
  .circ :global(svg.i) { width: 26px; height: 26px; }
  .link { flex: 1; max-width: 76px; height: 3px; border-radius: 2px; margin-top: 29px; position: relative; background: var(--border-strong); }
  .link i { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 26px; height: 26px; border-radius: 50%; border: 3px solid var(--surface);
    display: flex; align-items: center; justify-content: center; font-style: normal; font-weight: 800; font-size: 14px; color: var(--on-accent); background: var(--border-strong); }
  .link i :global(svg.i) { width: 14px; height: 14px; stroke-width: 3; }
  .ok .link, .ok .link i { background: var(--success); }
  .bad .link { background: repeating-linear-gradient(90deg, var(--danger) 0 6px, transparent 6px 11px); }
  .bad .link i { background: var(--danger); }
  .idle .link { background: repeating-linear-gradient(90deg, var(--border-strong) 0 6px, transparent 6px 11px); }
  .idle .link i { display: none; }
  .card h2 { margin: 0; font-size: 19px; font-weight: 700; }
  .card p { margin: 4px 0 16px; font-size: var(--p-fs-m); color: var(--muted); line-height: 1.45; }
  .cbtn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 48px; border: 0; border-radius: 12px; cursor: pointer;
    font: inherit; font-size: var(--p-fs-l); font-weight: 700; color: var(--accent-ink); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
  .cbtn.solid { color: var(--on-accent); background: var(--accent); }
  .cbtn:disabled { opacity: .5; cursor: default; }
  .ri, .ava { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); background: var(--col-bg); }
  .ava { border-radius: 50%; font-weight: 700; font-size: var(--p-fs-m); }
  .acc .ri { color: var(--accent-ink); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .seen { display: flex; align-items: center; gap: 6px; }
  .seen .p-dot { background: var(--border-strong); }
  .seen .p-dot.fresh { background: var(--success); }
  .chev { display: flex; color: var(--faint); }
  .p-row > .p-k + .chev { margin-left: auto; }
  .p-v + .chev { margin-left: -6px; }
  .name { max-width: 50%; overflow: hidden; text-overflow: ellipsis; display: block; }
  .badge {
    font-size: var(--p-fs-xs); font-weight: 700; background: var(--due-soon-bg); color: var(--due-soon-ink);
    min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
  }
  .dev { cursor: default; }
  .p-row.dev:active { background: none; }
  .hint { font-size: var(--p-fs-s); color: var(--faint); margin: -6px 4px 14px; }
  .warn { margin: 0 0 14px; color: var(--due-soon-ink); background: var(--due-soon-bg); padding: 12px 14px; border-radius: 12px; font-size: var(--p-fs-m); }

  .under :global(.psheet-scrim) { z-index: 650; }
  .under :global(div.psheet) { z-index: 651; }
  .sh { display: flex; flex-direction: column; gap: 10px; padding-bottom: 4px; }
  .sh .p-say, .sh .p-fld, .sh .p-group, .sh .warn { margin-bottom: 0; }
  .wide { width: 100%; }
  .ok { margin: 0; color: var(--text); background: color-mix(in srgb, var(--success) 14%, transparent); padding: 12px 14px; border-radius: 12px; font-weight: 600; }
  .code { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: .2em; text-align: center; color: var(--text); }
  .crow { display: flex; align-items: center; gap: 10px; }
  .cmeta { flex: 1; min-width: 0; font-size: var(--p-fs-s); color: var(--muted); }
  .conflict { padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .ctitle { font-weight: 600; font-size: var(--p-fs-m); }
  .ctype { font-weight: 400; color: var(--faint); }
  .cnote { font-size: var(--p-fs-s); color: var(--muted); }
  .cver { border-top: 1px solid var(--border); padding-top: 6px; display: flex; flex-direction: column; gap: 3px; }
  .cfield { display: flex; gap: 8px; font-size: var(--p-fs-s); line-height: 1.45; }
  .cfname { color: var(--faint); min-width: 6rem; flex-shrink: 0; }
  .cfield span:last-child { word-break: break-word; }
</style>
