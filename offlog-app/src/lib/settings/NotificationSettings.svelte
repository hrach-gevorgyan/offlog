<script lang="ts">
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';
  import TimePicker from '../TimePicker.svelte';
  import type { QuietHours } from '../../config';
  import { requestPermission, permissionState, exactAlarmState, requestExactAlarmPermission } from '../notifications';

  export let isAndroid: boolean;
  export let isTauri: boolean;
  export let notificationsEnabled: boolean;
  export let toggleNotificationsEnabled: () => void;
  export let defaultReminderTime: string;
  export let saveDefaultReminderTime: (e: CustomEvent<string>) => void;
  export let quietHours: QuietHours;
  export let saveQuietHours: (patch: Partial<QuietHours>) => void;
</script>

              <div class="setting-group">
                <div class="setting-section-title">Status</div>
                <div class="setting-row">
                  <span class="setting-label">{notificationsEnabled ? 'Task reminders enabled' : 'Task reminders off'}</span>
                  <button class="toggle-btn" class:on={notificationsEnabled} on:click={toggleNotificationsEnabled} aria-label="Toggle task reminders" role="switch" aria-checked={notificationsEnabled}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                <p class="setting-hint">Turn this off to stop all reminders in-app, regardless of the OS permission below.</p>
              </div>

              {#if notificationsEnabled}
              <div class="reveal-wrap" in:slide={revealIn} out:slide={revealOut}>
              <div class="setting-group">
                <div class="setting-section-title">Permission</div>
                <div class="setting-row">
                  <span class="setting-label">
                    {#if $permissionState === 'granted'}Enabled — task reminders will notify you
                    {:else if $permissionState === 'denied'}Blocked — {isTauri ? 'allow notifications for Offlog in Windows Settings → Notifications' : 'allow notifications for this site in your browser settings'}
                    {:else if $permissionState === 'unsupported'}Not supported in this browser
                    {:else}Not enabled yet{/if}
                  </span>
                  {#if $permissionState !== 'granted' && $permissionState !== 'unsupported'}
                    <button class="export-btn" on:click={() => requestPermission()}>Enable</button>
                  {/if}
                </div>
                {#if isAndroid}
                  <div class="setting-row">
                    <span class="setting-label">
                      {#if $exactAlarmState === 'granted'}Precise timing enabled — reminders fire exactly on time
                      {:else if $exactAlarmState === 'denied'}Not enabled — reminders may arrive a few minutes late
                      {:else}Checking…{/if}
                    </span>
                    {#if $exactAlarmState === 'denied'}
                      <button class="export-btn" on:click={() => requestExactAlarmPermission()}>Enable</button>
                    {/if}
                  </div>
                  <p class="setting-hint">
                    This is a separate Android permission from notifications themselves ("Alarms & reminders", since Android 12) — it's a system settings toggle with no in-app prompt, so it's easy to miss. Without it, reminders still arrive, just batched into the OS's next low-power wakeup window instead of at the exact minute you set.
                  </p>
                {/if}
              </div>

              <div class="setting-group">
                <div class="setting-section-title">Reminder timing</div>
                <label class="field-label">
                  Default "remind me on the due date" time
                  <TimePicker value={defaultReminderTime} on:change={saveDefaultReminderTime} />
                </label>
                <p class="setting-hint">Used whenever a task's "Remind me on the due date" checkbox is on, instead of picking the exact time yourself.</p>
              </div>

              <div class="setting-group">
                <div class="setting-section-title">Quiet hours</div>
                <div class="setting-row">
                  <span class="setting-label">Delay reminders until quiet hours end</span>
                  <button class="toggle-btn" class:on={quietHours.enabled} on:click={() => saveQuietHours({ enabled: !quietHours.enabled })} aria-label="Toggle quiet hours" role="switch" aria-checked={quietHours.enabled}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                {#if quietHours.enabled}
                  <div class="setting-row" in:slide={revealIn} out:slide={revealOut}>
                    <span class="setting-label">From</span>
                    <TimePicker value={quietHours.start} placement="up" on:change={(e) => saveQuietHours({ start: e.detail })} />
                    <span class="setting-label">to</span>
                    <TimePicker value={quietHours.end} placement="up" on:change={(e) => saveQuietHours({ end: e.detail })} />
                  </div>
                {/if}
                <p class="setting-hint">A reminder due in this window fires as soon as it ends instead of interrupting you.</p>
              </div>
              </div>
              {/if}

