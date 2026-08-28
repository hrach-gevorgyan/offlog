<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';
  import { scrimIn, scrimOut, dialogIn, dialogOut, exitMs } from './motion';
  import { getDeviceName, setDeviceName, isNativePlatform, isTauri, getSyncUrl, getWeekStartsMonday, setWeekStartsMonday, getTimeFormat24h, setTimeFormat24h } from '../config';
  import { getThemeMode, setThemeMode, type ThemeMode } from './theme';
  import { permissionState, requestPermission } from './notifications';
  import { trapFocus } from './focusTrap';
  // Svelte does not run intro transitions on a component's own root elements
  // when the component itself is being created -- and every panel here is
  // created by a parent's {#if}. The result was that no modal in this app
  // animated at all, however carefully its preset was tuned. Gating the
  // markup on a flag set in onMount() makes the elements the product of an
  // UPDATE inside this component, which is what Svelte animates.
  // See docs/motion.md.
  let __introReady = false;
  onMount(() => { __introReady = true; });

  // 'setupSync' fires only from the last step's "Set up sync" button —
  // App.svelte uses it to open Settings straight into the Sync tab.
  // 'close' fires whenever the flow actually ends (Skip on step 1 or the
  // sync step, Done on the prefs step when sync isn't offered).
  const dispatch = createEventDispatcher<{ close: void; setupSync: void }>();

  // Pre-filled with the same auto-generated default Settings shows
  // ("PC" / "Android phone"), so saving unchanged is a no-op.
  let name = getDeviceName();

  // Sync is offered once here, rather than via a standing button
  // elsewhere. Only meaningful on native: desktop/web always have a
  // default sync URL (config.ts's DEFAULT_SYNC_URL), so "not configured"
  // is a native-only state.
  const offerSync = isNativePlatform() && !getSyncUrl();

  // Step 2 is a quick-preferences screen (theme/week-start/time-format +
  // a notification-permission ask) duplicating controls SettingsPanel
  // also exposes, shown on every platform. Sync is offered last, as step
  // 3, so choosing "Set up sync" — which hands off to full Settings —
  // never skips past prefs that were still ahead of it.
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

  // Step 1's "Skip" leaves the whole flow, not just that step.
  //
  // Hide the markup first and tell the parent only once the outro has played:
  // the parent's {#if} destroys this component the instant it hears, which
  // would cut the exit off before its first frame. Duration read here, at
  // close time, so Reduce Motion is honoured.
  function dismiss() {
    __introReady = false;
    setTimeout(() => dispatch('close'), exitMs.medium);
  }

  function next() {
    setDeviceName(name);
    step = 2;
  }

  // Prefs' "Done" advances to the sync offer when there is one, otherwise
  // ends the flow.
  function finishPrefs() {
    if (offerSync) { step = 3; } else { dismiss(); }
  }

  function setupSync() {
    dispatch('setupSync');
  }

  // Mirrors each step's own decline button, so Escape/scrim-click never
  // does something more drastic than the visible control would.
  function decline() {
    if (step === 1) { dismiss(); }
    else if (step === 2) { finishPrefs(); }
    else { dismiss(); }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); decline(); }
    if (e.key === 'Enter' && step === 1) { e.preventDefault(); next(); }
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
{#if __introReady}
<div class="prompt-scrim" on:click|self={decline} in:fade={scrimIn} out:fade={scrimOut}></div>
{#if step === 1}
  <div class="prompt-panel" role="dialog" aria-modal="true" use:trapFocus in:dialogIn out:dialogOut>
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
  <div class="prompt-panel" role="dialog" aria-modal="true" use:trapFocus in:dialogIn out:dialogOut>
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
        <button class:active={!timeFormat24h} on:click={() => setTimeFormat(false)}>12h</button>
        <button class:active={timeFormat24h} on:click={() => setTimeFormat(true)}>24h</button>
      </div>
    </div>

    {#if $permissionState !== 'granted' && $permissionState !== 'unsupported'}
      <div class="pref-row">
        <span class="pref-label-group">
          <span class="pref-label">Notifications</span>
          <span class="pref-sublabel">
            {#if $permissionState === 'denied'}
              Blocked — allow them for Offlog in {isTauri() ? 'Windows Settings → Notifications' : 'your browser/system settings'}, then tap Enable to re-check
            {:else}
              Needed for reminders to fire
            {/if}
          </span>
        </span>
        <button class="notif-btn" on:click={() => requestPermission()}>Enable</button>
      </div>
    {/if}

    <div class="prompt-actions">
      <button class="save-btn" on:click={finishPrefs}>Done</button>
    </div>
  </div>
{:else}
  <div class="prompt-panel" role="dialog" aria-modal="true" use:trapFocus in:dialogIn out:dialogOut>
    <p class="prompt-title">Sync across your devices?</p>
    <p class="prompt-hint">
      Offlog can keep this device in sync with your other phones or a PC running the Offlog desktop app — everything stays local, there's no account or cloud involved. If you'd rather use this device on its own, that's the default and nothing else needs to change.
    </p>
    <p class="prompt-hint">You can always set this up later from Settings → Sync.</p>
    <div class="prompt-actions">
      <button class="skip-btn" on:click={dismiss}>Skip</button>
      <button class="save-btn" on:click={setupSync}>Set up sync</button>
    </div>
  </div>
{/if}
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
    transition: background var(--dur-hover) var(--ease-hover), opacity var(--dur-hover) var(--ease-hover);
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
