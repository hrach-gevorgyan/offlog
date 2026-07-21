<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';
  import { getDeviceName, setDeviceName, isNativePlatform, getSyncUrl, getWeekStartsMonday, setWeekStartsMonday, getTimeFormat24h, setTimeFormat24h } from '../config';
  import { getThemeMode, setThemeMode, type ThemeMode } from './theme';
  import { permissionState, requestPermission } from './notifications';
  import { trapFocus } from './focusTrap';
  import { dialogPop, scrimFade } from './motion';

  // 'setupSync' fires only from step 2's "Set up sync" button — App.svelte
  // uses it to open Settings straight into the Sync tab. 'close' fires
  // whenever the flow actually ends (step 1's Skip, step 3's Done,
  // Escape/scrim-click on step 1 or 3).
  const dispatch = createEventDispatcher<{ close: void; setupSync: void }>();

  // Pre-filled with the same auto-generated default Settings already
  // shows ("PC" / "Android phone") — saving without changing it is a
  // no-op, same as skipping, just via a different button.
  let name = getDeviceName();

  // Owner feedback, 2026-07-21: don't put a standing "set up sync" button
  // in the sidebar footer for people who've never paired — instead offer
  // it once, right here, as step 2 of the same one-time prompt. Only
  // meaningful on native: desktop/web always have a real default sync URL
  // (see config.ts's DEFAULT_SYNC_URL), so "not configured" only exists
  // as a native/Android state.
  const offerSync = isNativePlatform() && !getSyncUrl();

  // Step 3 is a quick-preferences screen (theme/week-start/time-format +
  // a notification-permission ask) — same controls SettingsPanel.svelte
  // already exposes, just surfaced once up front instead of only
  // discoverable by opening Settings later. Shown on every platform
  // (unlike step 2, which is native-unpaired-only).
  let step: 1 | 2 | 3 = 1;

  let themeMode: ThemeMode = getThemeMode();
  function selectThemeMode(mode: ThemeMode) {
    themeMode = mode;
    setThemeMode(mode);
  }
  let weekStartsMonday = getWeekStartsMonday();
  function setWeekStart(monday: boolean) {
    weekStartsMonday = monday;
    setWeekStartsMonday(monday);
  }
  let timeFormat24h = getTimeFormat24h();
  function setTimeFormat(is24h: boolean) {
    timeFormat24h = is24h;
    setTimeFormat24h(is24h);
  }

  // Owner feedback, 2026-07-21: "Skip" means get out of the whole flow,
  // full stop, at every step — not "skip this one step, keep going."
  // Someone who declines naming the device or setting up sync almost
  // certainly doesn't want a 3rd screen either.
  function dismiss() {
    dispatch('close');
  }

  function next() {
    setDeviceName(name);
    step = offerSync ? 2 : 3;
  }

  function setupSync() {
    dispatch('setupSync');
  }

  // Owner feedback, 2026-07-21 (2nd round): step 2's decline should still
  // land on step 3's preferences — only step 1's "Skip" bails out of the
  // whole flow. Declining sync isn't the same as declining everything.
  function declineSync() {
    step = 3;
  }

  // Mirrors each step's own decline button, so Escape/scrim-click never
  // does something more drastic than the visible "Skip" would.
  function decline() {
    if (step === 2) { declineSync(); } else { dismiss(); }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); decline(); }
    if (e.key === 'Enter' && step === 1) { e.preventDefault(); next(); }
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="prompt-scrim" on:click|self={decline} transition:fade={scrimFade}></div>
{#if step === 1}
  <div class="prompt-panel" role="dialog" aria-modal="true" use:trapFocus transition:dialogPop>
    <p class="prompt-title">What should we call this device?</p>
    <p class="prompt-hint">Shows up on this device's own edits when synced with others — changelog entries, task history. You can change this later in Settings, or skip for now.</p>
    <!-- svelte-ignore a11y-autofocus -->
    <input class="prompt-input" bind:value={name} placeholder="PC" autofocus enterkeyhint="done" />
    <div class="prompt-actions">
      <button class="skip-btn" on:click={dismiss}>Skip</button>
      <button class="save-btn" on:click={next}>Next</button>
    </div>
  </div>
{:else if step === 2}
  <div class="prompt-panel" role="dialog" aria-modal="true" use:trapFocus transition:dialogPop>
    <p class="prompt-title">Sync across your devices?</p>
    <p class="prompt-hint">
      Offlog can keep this device in sync with your other phones or a PC running the Offlog desktop app — everything stays local, there's no account or cloud involved. If you'd rather use this device on its own, that's the default and nothing else needs to change.
    </p>
    <p class="prompt-hint">You can always set this up later from Settings → Sync.</p>
    <div class="prompt-actions">
      <button class="skip-btn" on:click={declineSync}>Skip</button>
      <button class="save-btn" on:click={setupSync}>Set up sync</button>
    </div>
  </div>
{:else}
  <div class="prompt-panel" role="dialog" aria-modal="true" use:trapFocus transition:dialogPop>
    <p class="prompt-title">A couple of quick preferences</p>
    <p class="prompt-hint">All of this lives in Settings too, whenever you want to change it.</p>

    <div class="pref-row">
      <span class="pref-label">Theme</span>
      <div class="pref-toggle">
        <button class:active={themeMode === 'light'} on:click={() => selectThemeMode('light')}>Light</button>
        <button class:active={themeMode === 'dark'} on:click={() => selectThemeMode('dark')}>Dark</button>
        <button class:active={themeMode === 'system'} on:click={() => selectThemeMode('system')}>System</button>
      </div>
    </div>

    <div class="pref-row">
      <span class="pref-label">Week starts on</span>
      <div class="pref-toggle">
        <button class:active={!weekStartsMonday} on:click={() => setWeekStart(false)}>Sunday</button>
        <button class:active={weekStartsMonday} on:click={() => setWeekStart(true)}>Monday</button>
      </div>
    </div>

    <div class="pref-row">
      <span class="pref-label">Time format</span>
      <div class="pref-toggle">
        <button class:active={!timeFormat24h} on:click={() => setTimeFormat(false)}>1:00 PM</button>
        <button class:active={timeFormat24h} on:click={() => setTimeFormat(true)}>13:00</button>
      </div>
    </div>

    {#if $permissionState !== 'granted' && $permissionState !== 'unsupported'}
      <div class="pref-row">
        <span class="pref-label-group">
          <span class="pref-label">Notifications</span>
          <span class="pref-sublabel">Needed for reminders to fire</span>
        </span>
        <button class="notif-btn" on:click={() => requestPermission()}>Enable</button>
      </div>
    {/if}

    <div class="prompt-actions">
      <button class="save-btn" on:click={dismiss}>Done</button>
    </div>
  </div>
{/if}

<style>
  .prompt-scrim {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    z-index: 700;
  }

  .prompt-panel {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    z-index: 701; width: min(360px, 90vw);
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 20px 50px rgba(0,0,0,.3);
    padding: 1.35rem 1.5rem;
  }

  .prompt-title { margin: 0 0 .4rem; font-size: .95rem; font-weight: 600; color: var(--text); }
  .prompt-hint { margin: 0 0 .9rem; font-size: .8rem; color: var(--muted); line-height: 1.5; }
  .prompt-input {
    width: 100%; box-sizing: border-box; padding: .5rem .7rem; margin-bottom: 1.2rem;
    border-radius: var(--radius-sm); border: 1px solid var(--border-strong);
    background: var(--bg); color: var(--text); font-size: .9rem;
  }
  .prompt-input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

  .prompt-actions { display: flex; justify-content: flex-end; gap: .6rem; margin-top: .3rem; }
  .skip-btn, .save-btn {
    padding: .5rem 1rem; border-radius: var(--radius-sm); font-size: .85rem; font-weight: 600; cursor: pointer;
    border: 1px solid var(--border-strong); background: var(--bg); color: var(--text);
    transition: background .12s, opacity .12s;
  }
  .skip-btn:hover { background: var(--hover); }
  .save-btn { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .save-btn:hover { opacity: .88; }

  .pref-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: .85rem; gap: .6rem; }
  .pref-label { font-size: .85rem; color: var(--text); font-weight: 600; }
  .pref-label-group { display: flex; flex-direction: column; gap: .15rem; }
  .pref-sublabel { font-size: .74rem; color: var(--muted); font-weight: 400; }
  .pref-toggle { display: flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0; }
  .pref-toggle button {
    padding: .35rem .65rem; font-size: .78rem; font-weight: 600; cursor: pointer;
    border: none; background: var(--bg); color: var(--muted);
    border-right: 1px solid var(--border-strong);
  }
  .pref-toggle button:last-child { border-right: none; }
  .pref-toggle button.active { background: var(--accent); color: var(--on-accent); }
  .notif-btn {
    padding: .35rem .75rem; border-radius: var(--radius-sm); font-size: .78rem; font-weight: 600; cursor: pointer;
    border: 1px solid var(--accent); background: transparent; color: var(--accent);
    flex-shrink: 0;
  }
  .notif-btn:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
</style>
