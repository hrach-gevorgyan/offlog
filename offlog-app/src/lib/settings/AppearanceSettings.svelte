<script lang="ts">
  import { isNativePlatform } from '../../config';
  import type { ThemeMode } from '../theme';

  export let themeMode: ThemeMode;
  export let selectThemeMode: (mode: ThemeMode) => void;
  export let weekStartsMonday: boolean;
  export let setWeekStart: (monday: boolean) => void;
  export let timeFormat24h: boolean;
  export let setTimeFormat: (is24h: boolean) => void;
  export let highContrast: boolean;
  export let toggleHighContrast: () => void;
  export let reduceMotion: boolean;
  export let toggleReduceMotion: () => void;
  export let hapticsEnabled: boolean;
  export let toggleHaptics: () => void;
</script>

              <div class="setting-group">
                <div class="setting-section-title">Display</div>
                <div class="setting-row">
                  <div class="setting-label">Theme</div>
                  <div class="theme-segment" role="radiogroup" aria-label="Theme">
                    {#each (['light', 'dark', 'system'] as ThemeMode[]) as mode}
                      <button
                        class="theme-seg-btn"
                        class:active={themeMode === mode}
                        role="radio"
                        aria-checked={themeMode === mode}
                        on:click={() => selectThemeMode(mode)}
                      >
                        {mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'}
                      </button>
                    {/each}
                  </div>
                </div>
                <p class="setting-hint">"System" follows your device's light/dark setting automatically.</p>

                <div class="setting-row">
                  <div class="setting-label">Week starts on</div>
                  <div class="theme-segment" role="radiogroup" aria-label="Week starts on">
                    <button
                      class="theme-seg-btn"
                      class:active={!weekStartsMonday}
                      role="radio"
                      aria-checked={!weekStartsMonday}
                      on:click={() => setWeekStart(false)}
                    >Sunday</button>
                    <button
                      class="theme-seg-btn"
                      class:active={weekStartsMonday}
                      role="radio"
                      aria-checked={weekStartsMonday}
                      on:click={() => setWeekStart(true)}
                    >Monday</button>
                  </div>
                </div>
                <p class="setting-hint">Controls Agenda's month grid and "this week" grouping.</p>

                <div class="setting-row">
                  <div class="setting-label">Time format</div>
                  <div class="theme-segment" role="radiogroup" aria-label="Time format">
                    <button
                      class="theme-seg-btn"
                      class:active={!timeFormat24h}
                      role="radio"
                      aria-checked={!timeFormat24h}
                      on:click={() => setTimeFormat(false)}
                    >12h</button>
                    <button
                      class="theme-seg-btn"
                      class:active={timeFormat24h}
                      role="radio"
                      aria-checked={timeFormat24h}
                      on:click={() => setTimeFormat(true)}
                    >24h</button>
                  </div>
                </div>
                <p class="setting-hint">Controls every clock time shown in the app (Time Travel, reminders, task history, last synced).</p>
              </div>

              <div class="setting-group">
                <div class="setting-section-title">Accessibility</div>
                <div class="setting-row">
                  <div class="setting-label">High contrast</div>
                  <button class="toggle-btn" class:on={highContrast} on:click={toggleHighContrast} aria-label="Toggle high contrast" role="switch" aria-checked={highContrast}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                <p class="setting-hint">Raises border and text contrast throughout, on top of Light or Dark.</p>

                <div class="setting-row">
                  <div class="setting-label">Reduce motion</div>
                  <button class="toggle-btn" class:on={reduceMotion} on:click={toggleReduceMotion} aria-label="Toggle reduce motion" role="switch" aria-checked={reduceMotion}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                <p class="setting-hint">Turns off panel/dialog slide and fade animations throughout the app.</p>

                {#if isNativePlatform()}
                  <div class="setting-row">
                    <div class="setting-label">Haptic feedback</div>
                    <button class="toggle-btn" class:on={hapticsEnabled} on:click={toggleHaptics} aria-label="Toggle haptic feedback" role="switch" aria-checked={hapticsEnabled}>
                      <span class="toggle-knob"></span>
                    </button>
                  </div>
                  <p class="setting-hint">A small vibration on checkbox toggles and drag-and-drop.</p>
                {/if}
              </div>

