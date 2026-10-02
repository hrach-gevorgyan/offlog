<script lang="ts">
  // The phone's Reminders page: the settings people use first, a set-up card
  // only while Android is in the way, and the off switch last. Times open
  // the app's own time sheet.
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../../motion';
  import { fmtTime } from '../../utils';
  import type { QuietHours } from '../../../config';
  import { requestPermission, permissionState, exactAlarmState, requestExactAlarmPermission } from '../../notifications';
  import TimeSheet from './TimeSheet.svelte';

  export let isAndroid: boolean;
  export let notificationsEnabled: boolean;
  export let toggleNotificationsEnabled: () => void;
  export let defaultReminderTime: string;
  export let saveDefaultReminderTime: (e: CustomEvent<string>) => void;
  export let quietHours: QuietHours;
  export let saveQuietHours: (patch: Partial<QuietHours>) => void;

  const timeLabel = (hhmm: string) => fmtTime(new Date(`1970-01-01T${hhmm}`));

  // The time sheet calls closeOnBack(), so it mounts behind a {#key} bumped
  // on every open.
  type Which = 'default' | 'start' | 'end';
  let editing: Which | null = null, timeSession = 0;
  const TITLES: Record<Which, string> = { default: 'Default time', start: 'Quiet from', end: 'Quiet until' };
  function openTime(w: Which) { timeSession++; editing = w; }
  function current(w: Which) { return w === 'default' ? defaultReminderTime : w === 'start' ? quietHours.start : quietHours.end; }
  function picked(w: Which, v: string) {
    if (w === 'default') saveDefaultReminderTime(new CustomEvent('change', { detail: v }));
    else saveQuietHours(w === 'start' ? { start: v } : { end: v });
  }
</script>

              <!-- The phone page is "Reminders": the two settings people use
                   first, a fix-it row only when Android is in the way, and the
                   off switch last. -->
              {#if notificationsEnabled}
                <!-- Both Android steps in one card, each ticked off when done, so
                     fixing one never looks like being asked again. Gone once
                     both are done. -->
                {#if $permissionState !== 'granted' || (isAndroid && $exactAlarmState === 'denied')}
                  <div class="setting-group setup">
                    <span class="setting-label">Set up reminders</span>
                    <p class="setting-hint compact-hint">{isAndroid ? 'Two quick steps so reminders reach you on time.' : 'One step so reminders reach you.'}</p>
                    <div class="setting-row step" class:done={$permissionState === 'granted'}>
                      <span class="tick" aria-hidden="true">{$permissionState === 'granted' ? '✓' : '1'}</span>
                      <span class="setting-label">Let reminders pop up
                        <span class="perm-state" class:warn={$permissionState === 'denied'}>{$permissionState === 'granted' ? 'Done' : $permissionState === 'denied' ? 'Android is blocking them right now' : 'Android asks you once'}</span>
                      </span>
                      {#if $permissionState !== 'granted' && $permissionState !== 'unsupported'}<button class="export-btn" on:click={() => requestPermission()}>Allow</button>{/if}
                    </div>
                    {#if isAndroid}
                      <div class="setting-row step" class:done={$exactAlarmState !== 'denied'}>
                        <span class="tick" aria-hidden="true">{$exactAlarmState !== 'denied' ? '✓' : '2'}</span>
                        <span class="setting-label">On the exact minute
                          <span class="perm-state">{$exactAlarmState !== 'denied' ? 'Done' : 'Otherwise Android may deliver them a few minutes late'}</span>
                        </span>
                        {#if $exactAlarmState === 'denied'}<button class="export-btn" on:click={() => requestExactAlarmPermission()}>Turn on</button>{/if}
                      </div>
                    {/if}
                  </div>
                {/if}

                <div class="setting-group">
                  <button class="setting-row time-row" on:click={() => openTime('default')}>
                    <span class="setting-label">Default time</span>
                    <span class="setting-value">{timeLabel(defaultReminderTime)}</span>
                  </button>
                  <p class="setting-hint compact-hint">Used when a reminder follows a task's due date.</p>
                </div>

                <div class="setting-group">
                  <div class="setting-row">
                    <span class="setting-label">Quiet hours</span>
                    <button class="toggle-btn" class:on={quietHours.enabled} on:click={() => saveQuietHours({ enabled: !quietHours.enabled })} aria-label="Quiet hours" role="switch" aria-checked={quietHours.enabled}>
                      <span class="toggle-knob"></span>
                    </button>
                  </div>
                  {#if quietHours.enabled}
                    <div class="reveal-wrap" in:slide={revealIn} out:slide={revealOut}>
                      <button class="setting-row time-row" on:click={() => openTime('start')}>
                    <span class="setting-label">From</span>
                    <span class="setting-value">{timeLabel(quietHours.start)}</span>
                  </button>
                      <button class="setting-row time-row" on:click={() => openTime('end')}>
                    <span class="setting-label">To</span>
                    <span class="setting-value">{timeLabel(quietHours.end)}</span>
                  </button>
                      <p class="setting-hint">Reminders in this window wait until it ends.</p>
                    </div>
                  {:else}
                    <p class="setting-hint compact-hint">No reminders at night, for example.</p>
                  {/if}
                </div>
              {/if}

              <div class="setting-group">
                <div class="setting-row">
                  <span class="setting-label">Remind me about tasks</span>
                  <button class="toggle-btn" class:on={notificationsEnabled} on:click={toggleNotificationsEnabled} aria-label="Remind me about tasks" role="switch" aria-checked={notificationsEnabled}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                <p class="setting-hint compact-hint">{notificationsEnabled ? 'Turn off to keep Offlog silent. Your reminder times stay on the tasks.' : 'Offlog is silent. Turn on to get your reminders again.'}</p>
              </div>

{#if editing}
  {#key timeSession}
    <TimeSheet title={TITLES[editing]} value={current(editing)} on:pick={(e) => editing && picked(editing, e.detail)} on:close={() => (editing = null)} />
  {/key}
{/if}
