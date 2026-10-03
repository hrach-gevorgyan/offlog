<script lang="ts">
  // The phone's first launch: one page, no questions. Week start and 12/24 h
  // follow the phone's locale and the theme follows the system until changed
  // in Settings; Android is asked about notifications at the first reminder.
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { scrimIn, scrimOut } from '../motion';
  import { closeOnBack } from '../modalStack';
  import { claimStatusBar } from '../theme';
  import { trapFocus } from '../focusTrap';
  import { MARK_PATHS } from './mark';

  const dispatch = createEventDispatcher<{ start: void; connect: void }>();

  // Back is the same as Start.
  const requestClose = closeOnBack(() => dispatch(choice));
  let choice: 'start' | 'connect' = 'start';
  function leave(c: 'start' | 'connect') { choice = c; requestClose(); }

  // Home's hero claims light status icons underneath; this page is light.
  const strip = claimStatusBar(null);
  onDestroy(() => strip.release());

  let ready = false;
  onMount(() => { ready = true; });
</script>

{#if ready}
<div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" use:trapFocus in:fade={scrimIn} out:fade={scrimOut}>
  <div class="intro">
    <svg class="mark" viewBox="0 0 1024 1024" aria-hidden="true">{#each MARK_PATHS as d}<path d={d} />{/each}</svg>
    <h1 id="welcome-title">Welcome to Offlog</h1>
    <p class="lead">A calm place for your tasks.</p>
  </div>

  <ul class="points">
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>
      <span><b>Everything stays on this phone</b>Your tasks never go to anyone's server.</span>
    </li>
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M3 3l18 18"/></svg>
      <span><b>No account</b>Nothing to sign up for, nothing to forget.</span>
    </li>
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01"/><path d="M3 3l18 18"/></svg>
      <span><b>Works without internet</b>Always, everywhere.</span>
    </li>
  </ul>

  <div class="actions">
    <button class="go" on:click={() => leave('start')}>Start</button>
    <button class="link" on:click={() => leave('connect')}>Connect to Offlog on my computer</button>
  </div>
</div>
{/if}

<style>
  .welcome {
    position: fixed; inset: 0; z-index: 9000; background: var(--bg); color: var(--text);
    display: flex; flex-direction: column; overflow-y: auto;
    padding: calc(env(safe-area-inset-top, 0px) + 64px) 26px calc(env(safe-area-inset-bottom, 0px) + 20px);
  }
  .intro { display: contents; }
  .mark { width: 58px; height: 58px; fill: var(--accent); flex-shrink: 0; }
  h1 { margin: 22px 0 8px; font-size: 30px; font-weight: 700; letter-spacing: -.01em; }
  .lead { margin: 0; font-size: 16px; color: var(--faint); line-height: 1.5; }
  .points { list-style: none; margin: 34px 0 0; padding: 0; display: flex; flex-direction: column; gap: 22px; }
  .points li { display: flex; gap: 14px; align-items: flex-start; }
  .points svg { width: 22px; height: 22px; flex-shrink: 0; fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; margin-top: 1px; }
  .points span { font-size: 14px; color: var(--faint); line-height: 1.45; }
  .points b { display: block; font-size: 16px; color: var(--text); font-weight: 600; }
  .actions { margin-top: auto; padding-top: 28px; display: flex; flex-direction: column; gap: 4px; }
  .go { border: 0; border-radius: 14px; padding: 16px; cursor: pointer; font: inherit; font-size: 17px; font-weight: 700; background: var(--accent); color: var(--on-accent); }
  .go:active { filter: brightness(.94); }
  .link { border: 0; background: none; padding: 14px; cursor: pointer; font: inherit; font-size: 16px; font-weight: 600; color: var(--accent); }

  /* Sideways: the greeting on the left, the points and the buttons on the
     right, so Start is on the first screen. */
  @media (orientation: landscape) and (max-height: 500px) {
    .welcome {
      display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); grid-template-rows: 1fr auto auto auto 1fr;
      column-gap: 48px; align-items: start;
      padding: calc(env(safe-area-inset-top, 0px) + 16px) calc(env(safe-area-inset-right, 0px) + 32px) calc(env(safe-area-inset-bottom, 0px) + 16px) calc(env(safe-area-inset-left, 0px) + 32px);
    }
    .intro { display: flex; flex-direction: column; grid-column: 1; grid-row: 2 / 5; align-self: center; }
    .mark { width: 46px; height: 46px; }
    h1 { margin: 14px 0 6px; font-size: 26px; }
    .points { grid-column: 2; grid-row: 2 / 4; margin: 0; gap: 14px; }
    .actions { grid-column: 2; grid-row: 4; margin-top: 0; padding-top: 18px; }
    .go { padding: 13px; }
    .link { padding: 10px; }
  }
</style>
