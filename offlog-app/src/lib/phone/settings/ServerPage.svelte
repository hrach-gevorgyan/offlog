<script lang="ts">
  // Settings → Own server: sync with a CouchDB-compatible server typed in by
  // hand instead of a paired computer. Saving or stopping reloads the app,
  // which restarts sync on the new address.
  import { onMount, onDestroy } from 'svelte';
  import { syncState } from '../../db';
  import { showError } from '../../store';
  import { confirmAction } from '../../confirm';
  import { getSyncUrl, setSyncUrl, getSyncCredentials, setSyncCredentials, setSyncEnabled, getPairedHostUuid, getPairedHostName, clearPairedHost } from '../../../config';
  import { fmtLastSynced } from '../../utils';
  import { closeAll } from '../../modalStack';
  import { back } from '../nav';
  import { I } from '../icons';
  import TopBar from '../TopBar.svelte';

  // A paired computer's address lives in the same place; it is not "own".
  const inUse = !!getSyncUrl() && !getPairedHostUuid();
  const pairedName = getPairedHostName();
  let url = inUse ? getSyncUrl() : '';
  let user = '', pass = '';
  let storedUser = '', storedPass = '';
  onMount(async () => {
    if (!inUse) return;
    try { ({ user: storedUser, pass: storedPass } = await getSyncCredentials()); } catch { /* left empty */ }
    user = storedUser; pass = storedPass;
  });

  let status = syncState.status, lastSynced = syncState.lastSynced, lastErrorAt = syncState.lastErrorAt;
  function onSync() { status = syncState.status; lastSynced = syncState.lastSynced; lastErrorAt = syncState.lastErrorAt; }
  syncState.listeners.add(onSync);
  onDestroy(() => syncState.listeners.delete(onSync));

  $: state = !inUse
    ? { tone: 'idle', title: 'Not in use', text: pairedName || getPairedHostUuid() ? `This phone syncs with ${pairedName ?? 'your computer'}. Saving a server here replaces it.` : 'This phone isn’t syncing with anything yet.' }
    : status === 'error'
      ? { tone: 'bad', title: 'Can’t reach it', text: `Check the address and that the server is on.${lastErrorAt ? ` Last tried ${fmtLastSynced(lastErrorAt)}.` : ''}` }
      : status === 'offline'
        ? { tone: 'idle', title: 'Offline', text: 'Sync picks up again when this phone is back online.' }
        : { tone: 'ok', title: status === 'syncing' ? 'Syncing…' : 'Connected', text: lastSynced ? `Synced ${fmtLastSynced(lastSynced)}` : 'Waiting for the first sync' };

  let urlError = '';
  // Pushed screens unwind first, or the first back after the reload lands on
  // a stale history entry and does nothing.
  async function restart() {
    if (closeAll()) {
      await new Promise<void>(r => {
        const done = () => { window.removeEventListener('popstate', done); r(); };
        window.addEventListener('popstate', done);
        setTimeout(done, 300);
      });
    }
    location.reload();
  }
  async function save() {
    const next = url.trim();
    if (!/^https?:\/\/\S+$/i.test(next)) { urlError = 'Enter the full address, starting with http:// or https://'; return; }
    if (inUse && next === getSyncUrl() && user === storedUser && pass === storedPass) { back(); return; }
    try {
      await setSyncCredentials(user, pass);
    } catch {
      showError('Could not save sync credentials securely. Please try again.');
      return;
    }
    setSyncUrl(next);
    clearPairedHost();
    setSyncEnabled(true);
    await restart();
  }
  async function stop() {
    if (!(await confirmAction('Stop using this server? This phone stops syncing until you connect it again.', { confirmLabel: 'Stop using it', danger: true }))) return;
    try {
      await setSyncCredentials('', '');
    } catch {
      showError('Could not remove the server. Please try again.');
      return;
    }
    setSyncUrl('');
    await restart();
  }
</script>

<TopBar title="Own server" />

<div class="state {state.tone}" role="status">
  <span class="ri">{@html I.server}</span>
  <span class="k"><b><span class="p-dot"></span>{state.title}</b><small>{state.text}</small></span>
</div>
<p class="note">For people who run their own CouchDB-compatible server instead of pairing with a computer.</p>

<label class="fld"><small>Address</small>
  <input bind:value={url} on:input={() => (urlError = '')} placeholder="http://192.168.1.20:5984/offlog" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" />
</label>
{#if urlError}<p class="err" role="alert">{urlError}</p>{/if}
<label class="fld"><small>Username</small>
  <input bind:value={user} autocapitalize="off" autocomplete="off" spellcheck="false" />
</label>
<label class="fld"><small>Password</small>
  <input type="password" bind:value={pass} autocomplete="off" />
</label>
<button class="p-go" on:click={save}>Save and connect</button>
{#if inUse}<button class="stop" on:click={stop}>Stop using it</button>{/if}

<style>
  .state { display: flex; gap: 12px; align-items: center; background: var(--surface); border-radius: 14px; box-shadow: var(--p-shadow); padding: 14px 16px; margin-bottom: 8px; }
  .ri { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); background: var(--col-bg); }
  .k { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .k b { display: flex; align-items: center; gap: 6px; font-size: var(--p-fs-l); }
  .k small { font-size: var(--p-fs-s); color: var(--muted); line-height: 1.4; }
  .state .p-dot { background: var(--border-strong); }
  .ok .p-dot { background: var(--success-mark); }
  .bad .p-dot { background: var(--danger); }
  .note { margin: 0 4px 14px; font-size: var(--p-fs-s); color: var(--faint); line-height: 1.45; }
  .fld { display: block; background: var(--surface); border-radius: 12px; box-shadow: var(--p-shadow); padding: 9px 14px; margin-bottom: 8px; }
  .fld:focus-within { box-shadow: 0 0 0 2px var(--accent); }
  .fld small { display: block; font-size: var(--p-fs-xs); color: var(--faint); margin-bottom: 2px; }
  .fld input { width: 100%; border: 0; background: none; padding: 2px 0; font: inherit; font-size: var(--p-fs-l); color: var(--text); outline: none; }
  .err { margin: -2px 4px 8px; font-size: var(--p-fs-s); color: var(--danger); }
  .p-go { margin-top: 6px; }
  .stop { display: block; width: 100%; height: 46px; margin-top: 4px; border: 0; background: none; cursor: pointer; font: inherit; font-size: var(--p-fs-m); font-weight: 600; color: var(--danger); }
</style>
