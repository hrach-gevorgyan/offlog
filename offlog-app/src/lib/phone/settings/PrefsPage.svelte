<script lang="ts">
  // The phone settings pages. Appearance reuses shared/AppearanceSettings;
  // the page carries SettingsPanel's state and handlers for one category at a time,
  // so every setting keeps its exact behaviour; only the chrome is phone.
  // Multi-step flows (maintenance, restore preview) open as bottom sheets
  // instead of SettingsPanel's mini-modals. Sync has its own page.
  import { onMount, onDestroy } from 'svelte';
  import AppearanceSettings from '../../shared/AppearanceSettings.svelte';
  import BackupPage from './BackupPage.svelte';
  import { downloadBlob, freshMaintSteps, formatStorageEstimate, summarizeIssues, type MaintStep } from '../../shared/settingsHelpers';
  import { isAutoBackupEnabled, setAutoBackupEnabled, getLastAutoBackupAt } from '../../autoBackup';
  import db, {
    importJSON, analyzeImport, exportProjectDocs, exportTasksCSV,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
    runMaintenanceSteps, type IntegrityIssue, type MaintStepResult,
    type ImportedDoc,
  } from '../../db';
  import { projects as projectsStore, showError } from '../../store';
  import { getSyncUrl, getPairedHostUuid, getPairedHostName, getDefaultReminderTime, setDefaultReminderTime, getWeekStartsMonday, setWeekStartsMonday, getTimeFormat24h, setTimeFormat24h, getQuietHours, setQuietHours, getNotificationsEnabled, setNotificationsEnabled, isAppLockEnabled, setAppLockPin, clearAppLockPin, getAppLockTimeoutMinutes, setAppLockTimeoutMinutes, getAppLockHint, isNativePlatform, isAppLockBiometricEnabled, setAppLockBiometricEnabled, syncPrivacyScreen, isHapticsEnabled, setHapticsEnabled, isPrivacyScreenEnabled, setPrivacyScreenEnabled } from '../../../config';
  import { fmtLastSynced, localDateStr } from '../../utils';
  import { checkExactAlarmPermission, rescheduleAll } from '../../notifications';
  import { getThemeMode, setThemeMode, getHighContrast, setHighContrast, getReduceMotion, setReduceMotion, type ThemeMode } from '../../theme';
  import { trapFocus } from '../../focusTrap';
  import { fade } from 'svelte/transition';
  import { scrimIn, scrimOut } from '../../motion';
  import { I } from '../icons';
  import TopBar from '../TopBar.svelte';
  import Sheet from '../Sheet.svelte';
  import Pick from '../task/Pick.svelte';
  import LockPage from './LockPage.svelte';
  import RemindersPage from './RemindersPage.svelte';
  import { push, stack } from '../nav';
  import { openLink, REPO_URL } from '../openLink';
  import { get } from 'svelte/store';
  import { closeOnBack } from '../../modalStack';
  import { rowTaps } from './rowTaps';

  export let page: string;

  const TITLE: Record<string, string> = {
    appearance: 'Appearance', notifications: 'Reminders',
    data: 'Backup & restore', security: 'App lock', advanced: 'Advanced',
  };

  // ── Appearance ──
  let themeMode: ThemeMode = getThemeMode();
  function selectThemeMode(mode: ThemeMode) { themeMode = mode; setThemeMode(mode); }
  let highContrast = getHighContrast();
  function toggleHighContrast() { highContrast = !highContrast; setHighContrast(highContrast); }
  let reduceMotion = getReduceMotion();
  function toggleReduceMotion() { reduceMotion = !reduceMotion; setReduceMotion(reduceMotion); }
  let hapticsEnabled = isHapticsEnabled();
  function toggleHaptics() { hapticsEnabled = !hapticsEnabled; setHapticsEnabled(hapticsEnabled); }
  let weekStartsMonday = getWeekStartsMonday();
  function setWeekStart(monday: boolean) { weekStartsMonday = monday; setWeekStartsMonday(monday); }
  let timeFormat24h = getTimeFormat24h();
  function setTimeFormat(is24h: boolean) { timeFormat24h = is24h; setTimeFormat24h(is24h); }

  // ── Notifications ──
  const isAndroid = window.Capacitor?.getPlatform?.() === 'android';
  let notificationsEnabled = getNotificationsEnabled();
  function toggleNotificationsEnabled() {
    notificationsEnabled = !notificationsEnabled;
    setNotificationsEnabled(notificationsEnabled);
    rescheduleAll().catch(() => {});
  }
  let defaultReminderTime = getDefaultReminderTime();
  function saveDefaultReminderTime(e: CustomEvent<string>) {
    defaultReminderTime = e.detail;
    setDefaultReminderTime(defaultReminderTime);
  }
  let quietHours = getQuietHours();
  // rescheduleAll() re-applies quiet hours to reminders already pending.
  function saveQuietHours(patch: Partial<typeof quietHours>) {
    quietHours = { ...quietHours, ...patch };
    setQuietHours(quietHours);
    rescheduleAll().catch(() => {});
  }
  // Re-checked on every open: the user may have just come back from the OS
  // "Alarms & reminders" screen.
  onMount(() => { if (isAndroid && page === 'notifications') checkExactAlarmPermission(); });

  // ── App lock ──
  let appLockEnabled = isAppLockEnabled();
  let lockTimeoutStr = String(getAppLockTimeoutMinutes());
  let showPinForm = false;
  let newPin = '';
  let confirmPin = '';
  let pinHint = '';
  let pinError = '';
  let pinSaving = false;
  // The plaintext recovery code is never stored: this is the only time it
  // can be shown.
  let newRecoveryCode: string | null = null;
  let recoveryCopied = false;

  async function copyRecoveryCode() {
    if (!newRecoveryCode) return;
    try {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: newRecoveryCode });
      recoveryCopied = true;
      setTimeout(() => { recoveryCopied = false; }, 2000);
    } catch { /* the code is still on screen */ }
  }

  // Sharing hands the code to an app the person picks (a password manager,
  // notes); it never leaves the phone any other way.
  const canShare = isNativePlatform();
  async function shareRecoveryCode() {
    if (!newRecoveryCode) return;
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'Offlog recovery code', text: newRecoveryCode });
    } catch { /* dismissed, or nothing to share to: the code is still on screen */ }
  }

  // Back must not take the page (and the one-time code) away: while the code
  // is up, a back press only re-arms this entry. Continue is the one way out.
  let recoveryClose: (() => void) | null = null;
  let recoveryDone = false, destroyed = false;
  // This page's own screen entry. closeAll() (a widget jump, a tab switch)
  // removes it from the stack while the page is still animating out; re-arming
  // then would leave a history layer nothing owns.
  const ownScreen = get(stack).at(-1);
  function guardRecovery() {
    recoveryDone = false;
    recoveryClose = closeOnBack(() => {
      recoveryClose = null;
      if (recoveryDone) { newRecoveryCode = null; return; }
      // Deferred: closeAll() also lands here, and pushing before its
      // history.go() resolves would desync history.
      setTimeout(() => { if (!destroyed && newRecoveryCode && get(stack).at(-1) === ownScreen) guardRecovery(); }, 0);
    });
  }
  let armRecovery = false;
  function onPinFormClosed() {
    if (!armRecovery) return;
    armRecovery = false;
    if (!destroyed && get(stack).at(-1) === ownScreen) guardRecovery();
  }
  function finishRecovery() {
    recoveryDone = true;
    if (recoveryClose) recoveryClose(); else newRecoveryCode = null;
  }
  onDestroy(() => { destroyed = true; });

  let privacyScreenEnabled = isPrivacyScreenEnabled();
  function togglePrivacyScreen() {
    privacyScreenEnabled = !privacyScreenEnabled;
    setPrivacyScreenEnabled(privacyScreenEnabled);
    syncPrivacyScreen();
  }

  let biometricEnabled = isAppLockBiometricEnabled();
  let biometricError = '';
  let biometricBusy = false;
  let biometricNoneEnrolled = false;
  // Enabling needs a real successful prompt, so a device with nothing
  // enrolled never ends up "enabled" with no way to unlock.
  async function toggleBiometric() {
    biometricError = '';
    biometricNoneEnrolled = false;
    if (biometricEnabled) {
      setAppLockBiometricEnabled(false);
      biometricEnabled = false;
      return;
    }
    biometricBusy = true;
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');
      const available = await NativeBiometric.isAvailable();
      if (!available.isAvailable) {
        biometricError = 'No fingerprint or face is enrolled on this device yet — add one in your phone\'s system settings first.';
        biometricNoneEnrolled = true;
        return;
      }
      await NativeBiometric.verifyIdentity({ reason: 'Enable biometric unlock for Offlog', title: 'Confirm it\'s you' });
      setAppLockBiometricEnabled(true);
      biometricEnabled = true;
    } catch {
      biometricError = 'Could not confirm your fingerprint/face. Try again.';
    } finally {
      biometricBusy = false;
    }
  }

  // BIOMETRIC_ENROLL needs API 30+; older devices fall back to Security.
  async function openBiometricEnrollment() {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      const result = await AppLauncher.openUrl({ url: 'android.settings.BIOMETRIC_ENROLL' });
      if (!result.completed) await AppLauncher.openUrl({ url: 'android.settings.SECURITY_SETTINGS' });
    } catch { /* the inline message already says what to do */ }
  }

  function openPinForm() {
    newPin = ''; confirmPin = ''; pinError = '';
    pinHint = getAppLockHint() ?? '';
    showPinForm = true;
  }

  async function savePin() {
    if (newPin.length < 4) { pinError = 'PIN must be at least 4 digits.'; return; }
    if (!/^\d+$/.test(newPin)) { pinError = 'PIN can only contain digits.'; return; }
    if (newPin !== confirmPin) { pinError = "PINs don't match."; return; }
    if (pinHint.trim() && pinHint.includes(newPin)) { pinError = "The hint can't contain the PIN itself."; return; }
    pinSaving = true;
    try {
      const result = await setAppLockPin(newPin, pinHint);
      appLockEnabled = true;
      showPinForm = false;
      syncPrivacyScreen();
      // The PIN sheet is closing through Back right now; the code's own Back
      // guard is armed once that has landed (onPinFormClosed), or the two
      // history steps cross.
      if (result.recoveryCode) { newRecoveryCode = result.recoveryCode; recoveryCopied = false; armRecovery = true; }
    } catch {
      pinError = 'Could not save PIN. Please try again.';
    } finally {
      pinSaving = false;
    }
  }

  // Change and Remove both go through ConfirmPinGate; entering the current
  // PIN is the confirmation.
  let pinGateMode: 'change' | 'remove' | null = null;
  function onPinGateVerified() {
    const mode = pinGateMode;
    pinGateMode = null;
    if (mode === 'change') openPinForm();
    else if (mode === 'remove') {
      clearAppLockPin();
      appLockEnabled = false;
      biometricEnabled = false;
      privacyScreenEnabled = false;
      syncPrivacyScreen();
    }
  }
  function onLockTimeoutChange(v: string) { setAppLockTimeoutMinutes(Number(v)); }

  // Set by the Check and repair row; the sheet clears it once its outro has
  // played.
  let showMaintenanceModal = false;
  // Sheet calls closeOnBack() at setup, so each real open needs a fresh {#key}.
  let maintSession = 0, importSession = 0;
  let scopeOpen = false, scopeSession = 0;
  function openScope() { scopeSession++; scopeOpen = true; }
  let wasMaint = false, wasImport = false;
  $: { if (showMaintenanceModal && !wasMaint) maintSession++; wasMaint = showMaintenanceModal; }
  $: { if (importPreview && !wasImport) importSession++; wasImport = !!importPreview; }

  // ── Backup & storage ──
  let breakdown: StorageBreakdown | null = null;
  async function loadBreakdown() {
    try {
      breakdown = await getStorageBreakdown();
    } catch {
      showError('Could not load storage usage. Please try again.');
    }
  }
  let storageUsed = '';
  let storagePercent = 0;
  let storageAvailable = true;
  async function loadStorage() {
    try {
      if (navigator.storage?.estimate) {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        ({ percent: storagePercent } = formatStorageEstimate(usage, quota));
        storageUsed = `${(usage / 1048576).toFixed(1)} MB`;
        storageAvailable = true;
      } else storageAvailable = false;
    } catch {
      storageAvailable = false;
    }
  }
  onMount(() => {
    if (page !== 'data' && page !== 'advanced') return;
    loadBreakdown();
    loadStorage();
    return subscribeDb(() => loadBreakdown());
  });

  // Restore parses and previews counts before anything is written.
  let importStatus = '';
  let pendingImportDocs: ImportedDoc[] | null = null;
  let importPreview: { toCreate: number; toSkip: number; byType: Record<string, number> } | null = null;
  let importFileName = '';
  let importFileModified = '';
  // Blocks a second restore from starting while one is still writing.
  let importBusy = false;

  function handleImport() {
    if (importBusy) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        let docs: unknown;
        try { docs = JSON.parse(text); } catch { throw new Error("That doesn't look like an Offlog backup file."); }
        if (!Array.isArray(docs)) throw new Error("That doesn't look like an Offlog backup file.");
        pendingImportDocs = docs as ImportedDoc[];
        importPreview = analyzeImport(docs as ImportedDoc[]);
        importFileName = file.name;
        importFileModified = file.lastModified ? fmtLastSynced(new Date(file.lastModified).toISOString()) : '';
      } catch (e) {
        importStatus = e instanceof Error ? e.message : "That doesn't look like an Offlog backup file.";
        setTimeout(() => { importStatus = ''; }, 4000);
      }
    };
    input.click();
  }
  function cancelImport() { pendingImportDocs = null; importPreview = null; importFileName = ''; importFileModified = ''; }

  // Takes the docs before the sheet closes: closing clears the preview state.
  async function confirmImport(close: () => void) {
    const docs = pendingImportDocs;
    if (!docs) return;
    close();
    importBusy = true;
    try {
      importStatus = 'Importing…';
      const { ok, skipped } = await importJSON(docs);
      importStatus = `Done — ${ok} imported, ${skipped} skipped`;
    } catch {
      importStatus = 'Import failed. Please try again.';
    }
    importBusy = false;
    setTimeout(() => { importStatus = ''; }, 4000);
  }

  let autoBackupEnabled = isAutoBackupEnabled();
  let lastAutoBackupAt = getLastAutoBackupAt();
  function toggleAutoBackup() { autoBackupEnabled = !autoBackupEnabled; setAutoBackupEnabled(autoBackupEnabled); }

  let backupScope = ''; // '' = everything
  $: backupScopeOptions = [{ value: '', label: 'Everything' }, ...$projectsStore.map(p => ({ value: p._id!, label: p.name }))];
  async function doBackup() {
    try {
      const docs = backupScope
        ? await exportProjectDocs(backupScope)
        // Attachments inlined, not stubs: a stub makes the whole restore fail.
        : (await db.allDocs({ include_docs: true, attachments: true, binary: false })).rows.map(r => r.doc).filter(d => !!d && !d._id.startsWith('_'));
      const name = backupScope ? ($projectsStore.find(p => p._id === backupScope)?.name.toLowerCase().replace(/\s+/g, '-') ?? 'project') : 'backup';
      await downloadBlob(JSON.stringify(docs, null, 2), 'application/json', `offlog-${name}-${localDateStr(new Date())}.json`);
    } catch {
      showError('Could not back up. Please try again.');
    }
  }
  async function doExportCSV() {
    try {
      const csv = await exportTasksCSV();
      await downloadBlob(csv, 'text/csv', `offlog-tasks-${localDateStr(new Date())}.csv`);
    } catch {
      showError('Could not export CSV. Please try again.');
    }
  }

  // ── Advanced ──
  let appVersion = '';
  if (isNativePlatform()) {
    import('@capacitor/app').then(({ App }) => App.getInfo()).then(info => { appVersion = info.version; }).catch(() => {});
  }
  let maintRunning = false;
  let maintSteps: MaintStep[] = freshMaintSteps();
  let maintRemainingIssues: IntegrityIssue[] = [];
  // Cooperative: the step already running still finishes.
  let maintCancelled = false;
  let maintFoundIssues: IntegrityIssue[] = [];
  function setMaintStep(key: MaintStepResult['key'], patch: Partial<MaintStep>) {
    maintSteps = maintSteps.map(s => s.key === key ? { ...s, ...patch } : s);
  }
  async function runMaintenance() {
    maintRunning = true;
    maintCancelled = false;
    maintSteps = freshMaintSteps();
    maintRemainingIssues = [];
    maintFoundIssues = [];
    try {
      const { remainingIssues } = await runMaintenanceSteps(
        (step) => setMaintStep(step.key, { status: step.status, note: step.note }),
        {
          // Repair rewrites docs with no undo, so the sheet asks first and
          // names what it found.
          confirmRepair: (issues) => new Promise<boolean>(res => {
            maintFoundIssues = issues;
            maintDecide = res;
          }),
          isCancelled: () => maintCancelled,
        },
      );
      maintRemainingIssues = remainingIssues;
    } catch {
      const running = maintSteps.find(s => s.status === 'running');
      if (running) setMaintStep(running.key, { status: 'error', note: 'Failed — please try again' });
      showError('Maintenance failed partway through. Please try again.');
    } finally {
      maintRunning = false;
      maintCancelled = false;
    }
  }
  // Set while the run waits on Repair / Skip in the sheet.
  let maintDecide: ((repair: boolean) => void) | null = null;
  function decideRepair(repair: boolean) {
    const fn = maintDecide;
    maintDecide = null;
    fn?.(repair);
  }
  // Closing the sheet mid-question skips the repair (it cannot be undone).
  function onMaintClosed() { showMaintenanceModal = false; decideRepair(false); }
  onDestroy(() => decideRepair(false));
  // A paired computer's address is kept in the same place; only a typed-in
  // one counts as the phone's own server.
  const ownServer = !!getSyncUrl() && !getPairedHostUuid();
  const pairedName = getPairedHostName();
  $: allTasks = breakdown ? breakdown.activeTasks + breakdown.archivedTasks + breakdown.deletedTasks : 0;

  const MAINT_LABEL: Record<string, string> = {
    check: 'Check data', repair: 'Repair', history: 'Clear old history',
    trash: 'Clear old Recycle bin items', compact: 'Free up space',
  };

</script>

<TopBar title={TITLE[page] ?? 'Settings'} />

<div class="pset" use:rowTaps>
  {#if page === 'appearance'}
    <AppearanceSettings phone
      {themeMode} {selectThemeMode} {weekStartsMonday} {setWeekStart}
      {timeFormat24h} {setTimeFormat} {highContrast} {toggleHighContrast}
      {reduceMotion} {toggleReduceMotion} {hapticsEnabled} {toggleHaptics}
    />
  {:else if page === 'notifications'}
    <RemindersPage
      {isAndroid} {notificationsEnabled} {toggleNotificationsEnabled}
      {defaultReminderTime} {saveDefaultReminderTime} {quietHours} {saveQuietHours}
    />
  {:else if page === 'data'}
    <BackupPage scopeLabel={backupScopeOptions.find(o => o.value === backupScope)?.label ?? 'Everything'} pickScope={openScope}
      {doBackup} {autoBackupEnabled} {toggleAutoBackup} {lastAutoBackupAt}
      {importStatus} {handleImport} {importBusy} {doExportCSV} {storageAvailable} {storagePercent}
    />
  {:else if page === 'security'}
    <LockPage
      {appLockEnabled} bind:showPinForm {openPinForm} {onPinFormClosed}
      bind:newPin bind:confirmPin bind:pinHint {pinError} {pinSaving} {savePin}
      bind:pinGateMode {onPinGateVerified}
      bind:lockTimeoutStr {onLockTimeoutChange}
      {biometricEnabled} {biometricBusy} {biometricError} {biometricNoneEnrolled}
      {toggleBiometric} {openBiometricEnrollment}
      {privacyScreenEnabled} {togglePrivacyScreen}
    />
  {:else if page === 'advanced'}
    <div class="adv">
      <div class="p-sec" role="heading" aria-level="2">Your data</div>
      <div class="p-group">
        <button class="p-row" on:click={() => (showMaintenanceModal = true)}>
          <span class="ri">{@html I.wrench}</span>
          <span class="p-k"><span>Check and repair</span><span class="p-sub">Finds problems and clears old history</span></span>
          <span class="chev">{@html I.chev}</span>
        </button>
        <div class="p-row still">
          <span class="ri">{@html I.disk}</span>
          <span class="p-k"><span>Storage used</span>{#if breakdown}<span class="p-sub">{allTasks.toLocaleString()} task{allTasks === 1 ? '' : 's'} · {breakdown.attachmentCount} attachment{breakdown.attachmentCount === 1 ? '' : 's'}</span>{/if}</span>
          <span class="p-v">{storageAvailable ? storageUsed || '…' : '—'}</span>
        </div>
      </div>
      <div class="p-sec" role="heading" aria-level="2">Sync</div>
      <div class="p-group">
        <button class="p-row" on:click={() => push({ k: 'set', page: 'server' })}>
          <span class="ri">{@html I.server}</span>
          <span class="p-k"><span>Own server</span><span class="p-sub">{ownServer ? 'In use' : pairedName ? `Not used · syncing with ${pairedName}` : 'Not used'}</span></span>
          <span class="chev">{@html I.chev}</span>
        </button>
      </div>
      <div class="p-sec" role="heading" aria-level="2">About</div>
      <div class="p-group">
        <div class="p-row still">
          <span class="ri">{@html I.info}</span>
          <span class="p-k"><span>Version</span>{#if isNativePlatform()}<span class="p-sub">Updates come through the Play Store</span>{/if}</span>
          <span class="p-v">{appVersion || '—'}</span>
        </div>
        <button class="p-row" on:click={() => push({ k: 'set', page: 'privacy' })}>
          <span class="ri">{@html I.shield}</span>
          <span class="p-k"><span>Privacy</span><span class="p-sub">No accounts, no tracking, nothing in the cloud</span></span>
          <span class="chev">{@html I.chev}</span>
        </button>
        <button class="p-row" on:click={() => openLink(REPO_URL)}>
          <span class="ri">{@html I.code}</span>
          <span class="p-k"><span>Source code</span><span class="p-sub">Open source on GitHub</span></span>
          <span class="chev">{@html I.ext}</span>
        </button>
      </div>
    </div>
  {:else}
    <p class="p-empty">This page doesn't exist.</p>
  {/if}
</div>

  {#if scopeOpen}
    {#key scopeSession}
      <Sheet title="What to back up" on:close={() => (scopeOpen = false)} let:close>
        <Pick options={backupScopeOptions} current={backupScope} on:pick={(e) => { backupScope = e.detail; close(); }} />
      </Sheet>
    {/key}
  {/if}

  {#if showMaintenanceModal}
    {#key maintSession}
      <Sheet title="Maintenance" on:close={onMaintClosed}>
        <div class="sh">
          <p class="p-say">Checks for problems and clears old history.</p>
          <div class="p-group">
            {#each maintSteps as step (step.key)}
              <div class="p-row step" class:running={step.status === 'running'}>
                <span class="sicon {step.status}">
                  {#if step.status === 'done'}✓{:else if step.status === 'skipped'}–{:else if step.status === 'error'}✕{:else if step.status === 'running'}•{/if}
                </span>
                <span class="p-k"><span>{MAINT_LABEL[step.key] ?? step.label}</span>{#if step.note}<span class="p-sub">{step.note}</span>{/if}</span>
              </div>
            {/each}
          </div>
          {#if maintDecide}
            <div class="decide" role="group" aria-label="Repair">
              <b>Found {maintFoundIssues.length} problem{maintFoundIssues.length === 1 ? '' : 's'}</b>
              {#each summarizeIssues(maintFoundIssues) as group}
                <span>{group.text}{group.manual ? ' · needs your review' : ''}</span>
              {/each}
              <span class="p-sub">Repair can't be undone.</span>
            </div>
            <button class="p-go" on:click={() => decideRepair(true)}>Repair</button>
            <button class="p-tbtn wide" on:click={() => decideRepair(false)}>Skip</button>
          {:else}
            {#if maintFoundIssues.length > 0}
              <p class="p-lab">Found</p>
              <div class="issues">
                {#each summarizeIssues(maintFoundIssues) as group}
                  <div>{group.text}{group.manual ? ' · needs your review' : ''}</div>
                {/each}
              </div>
            {/if}
            {#if maintRemainingIssues.length > 0}
              <p class="p-lab">Needs your review</p>
              <div class="issues">
                {#each maintRemainingIssues.slice(0, 8) as issue}<div>{issue.description}</div>{/each}
              </div>
            {/if}
            <button class="p-go" on:click={runMaintenance} disabled={maintRunning}>
              {maintRunning ? 'Running…' : maintSteps.some(s => s.status === 'done') ? 'Run again' : 'Run'}
            </button>
            {#if maintRunning}
              <button class="p-tbtn wide" on:click={() => maintCancelled = true} disabled={maintCancelled}>
                {maintCancelled ? 'Stopping after this step…' : 'Cancel'}
              </button>
            {/if}
          {/if}
        </div>
      </Sheet>
    {/key}
  {/if}

  {#if importPreview}
    {#key importSession}
      <Sheet title="Restore from backup" on:close={cancelImport} let:close>
        <div class="sh">
          {#if importFileName}
            <p class="fname"><strong>{importFileName}</strong>{#if importFileModified}&nbsp;— modified {importFileModified}{/if}</p>
          {/if}
          <p class="p-say">
            Will create <strong>{importPreview.byType.space}</strong> space{importPreview.byType.space === 1 ? '' : 's'},
            <strong>{importPreview.byType.project}</strong> project{importPreview.byType.project === 1 ? '' : 's'},
            <strong>{importPreview.byType.task}</strong> task{importPreview.byType.task === 1 ? '' : 's'}
            {#if importPreview.toSkip > 0}— <strong>{importPreview.toSkip}</strong> unrecognized entr{importPreview.toSkip === 1 ? 'y' : 'ies'} will be skipped{/if}.
            Anything matching something you already have will be updated in place, not duplicated.
            This isn't a full revert — anything you've created, changed or deleted since this backup was taken stays exactly as it is now.
          </p>
          <button class="p-go" on:click={() => confirmImport(close)}>Import {importPreview.toCreate} item{importPreview.toCreate === 1 ? '' : 's'}</button>
          <button class="p-tbtn wide" on:click={close}>Cancel</button>
        </div>
      </Sheet>
    {/key}
  {/if}

{#if newRecoveryCode}
  <!-- Leaves only through "I've saved it": no Escape, and Back is held by
       guardRecovery(). The code is shown exactly once. -->
  <div class="rpage" use:trapFocus role="dialog" aria-modal="true" aria-labelledby="rtitle" in:fade={scrimIn} out:fade={scrimOut}>
    <span class="rkey" aria-hidden="true">{@html I.key}</span>
    <h1 id="rtitle">Save your recovery code</h1>
    <p class="p-say">If you forget your PIN, this code is the only way back in. There's no account to reset it.</p>
    <div class="rcode">{newRecoveryCode}</div>
    <div class="racts" class:one={!canShare}>
      <button class="rbtn" on:click={copyRecoveryCode}>{@html I.copy}{recoveryCopied ? 'Copied' : 'Copy'}</button>
      {#if canShare}<button class="rbtn" on:click={shareRecoveryCode}>{@html I.share}Share</button>{/if}
    </div>
    <div class="rfill"></div>
    <p class="rfine">It won't be shown again.</p>
    <button class="p-go" on:click={finishRecovery}>I've saved it</button>
  </div>
{/if}

<style>
  /* The settings children are styled from here (they carry no styles of
     their own). Class rules only: a bare element rule under :global() would
     also restyle CustomSelect's and TimePicker's internals. */
  .pset { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
  .pset :global(.setting-group) {
    display: flex; flex-direction: column; gap: 10px;
    background: var(--surface); border-radius: 14px; padding: 14px 16px;
    box-shadow: var(--p-shadow);
  }
  .pset :global(.reveal-wrap) { display: flex; flex-direction: column; gap: 14px; }
  .pset :global(.setting-section-title) { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
  .pset :global(.setting-row) { display: flex; align-items: center; gap: 12px; min-height: 44px; flex-wrap: wrap; }
  .pset :global(.setting-row:has(> .toggle-btn)) { cursor: pointer; margin: 0 -16px; padding: 0 16px; min-height: 52px; transition: background var(--dur-hover) var(--ease-hover); }
  .pset :global(.setting-row:has(> .toggle-btn):active) { background: var(--col-bg); }
  /* A switch row already has 52px of its own; at a card's edge it needs no
     extra padding, or a one-switch card reads as half empty. */
  .pset :global(.setting-group:has(> .setting-row:first-child > .toggle-btn)) { padding-top: 4px; }
  .pset :global(.setting-group:has(> .setting-row:last-child > .toggle-btn)) { padding-bottom: 4px; }
  .pset :global(.setup > .setting-label) { font-weight: 600; }
  .pset :global(.setting-row.step) { flex-wrap: nowrap; padding-top: 4px; }
  .pset :global(.setting-row.step + .setting-row.step) { border-top: 1px solid var(--border); padding-top: 10px; }
  .pset :global(.step .tick) { width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: var(--accent-ink); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .pset :global(.step.done .tick) { color: var(--on-accent); background: var(--success-mark); }
  .pset :global(.step.done .setting-label) { color: var(--muted); }
  .pset :global(.time-row) { position: relative; cursor: pointer; }
  .pset :global(button.time-row) { width: 100%; border: 0; background: none; padding: 0; margin: 0; font: inherit; color: inherit; text-align: left; }
  .pset :global(.time-row .setting-value) { color: var(--accent); font-weight: 600; }
  .pset :global(.perm-state) { display: block; margin-top: 2px; font-size: 13.5px; color: var(--faint); }
  .pset :global(.perm-state.warn) { color: var(--due-soon-ink); font-weight: 500; }
  .pset :global(.setting-label) { flex: 1; min-width: 0; font-size: 16px; color: var(--text); }
  .pset :global(.setting-value) { font-size: 15px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .pset :global(.setting-hint) { margin: 0; font-size: 13.5px; color: var(--faint); line-height: 1.5; }
  .pset :global(.setting-hint.compact-hint) { margin-top: -6px; }
  .pset :global(.setting-hint-error) { color: var(--danger); }
  .pset :global(.setting-hint-warn) { color: var(--due-soon-ink); background: var(--due-soon-bg); padding: 10px 12px; border-radius: 10px; font-weight: 500; }
  .pset :global(.field-label) { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
  .pset :global(.field-label input) {
    font: inherit; font-size: 16px; text-transform: none; letter-spacing: 0; font-weight: 400;
    padding: 12px 14px; border: 0; border-radius: 12px; background: var(--bg); color: var(--text);
    box-shadow: 0 0 0 1px var(--border);
  }
  .pset :global(.field-label input:focus) { outline: none; box-shadow: 0 0 0 2px var(--accent); }
  .pset :global(.field-label input:disabled) { opacity: .5; }

  .pset :global(.theme-segment) { display: flex; background: var(--col-bg); border-radius: 12px; padding: 3px; gap: 2px; flex-shrink: 0; }
  .pset :global(.theme-seg-btn) { min-height: 44px; padding: 0 14px; border-radius: 9px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  /* Same selected look as the shell's .p-seg (Board | List, Organize tabs). */
  .pset :global(.theme-seg-btn.active) { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent-ink); }

  .pset :global(.toggle-btn) {
    width: 42px; height: 26px; border-radius: 13px; border: 0; padding: 0; cursor: pointer; flex-shrink: 0;
    background: var(--switch-off); position: relative; transition: background var(--dur-small) var(--ease-standard);
  }
  .pset :global(.toggle-btn.on) { background: var(--accent); }
  .pset :global(.toggle-btn:disabled) { opacity: .5; }
  .pset :global(.toggle-knob) {
    position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%;
    background: var(--toggle-knob); box-shadow: 0 1px 2px rgba(0,0,0,.25);
    transition: transform var(--dur-small) var(--ease-standard);
  }
  .pset :global(.toggle-btn.on .toggle-knob) { transform: translateX(16px); }

  /* Buttons inside a card are a tint of the card, so they sit above it in
     both themes; the page colour would sink them into a black slab in dark. */
  .pset :global(.export-btn) {
    min-height: 44px; padding: 0 16px; border-radius: 12px; border: 0; cursor: pointer;
    background: color-mix(in srgb, var(--text) 8%, var(--surface)); color: var(--text); font: inherit; font-size: 15px; font-weight: 600; white-space: nowrap;
  }
  .pset :global(.export-btn:active) { background: color-mix(in srgb, var(--text) 14%, var(--surface)); }
  .pset :global(.export-btn:disabled) { opacity: .5; cursor: default; }
  .pset :global(.export-btn-danger) { color: color-mix(in srgb, var(--danger) 82%, var(--text)); background: color-mix(in srgb, var(--danger) 10%, transparent); }

  .pset :global(.link-row) {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 0 14px;
    background: color-mix(in srgb, var(--text) 8%, var(--surface)); border: 0; border-radius: 12px; cursor: pointer; text-align: left; font: inherit; color: var(--text);
  }
  .pset :global(.link-row:active) { background: color-mix(in srgb, var(--text) 14%, var(--surface)); }
  .pset :global(.link-row-title) { flex: 1; font-size: 16px; font-weight: 600; }
  .pset :global(.link-row svg) { flex-shrink: 0; opacity: .5; }
  .save { margin-top: 4px; }

  .sh { display: flex; flex-direction: column; gap: 10px; padding-bottom: 4px; }
  .sh .p-say, .sh .p-fld, .sh .p-group { margin-bottom: 0; }
  .wide { width: 100%; min-height: 44px; }
  .decide { display: flex; flex-direction: column; gap: 4px; background: var(--surface); border-radius: 12px; padding: 12px 14px; box-shadow: var(--p-shadow); font-size: var(--p-fs-m); color: var(--muted); }
  .decide b { color: var(--text); }
  .step { cursor: default; }
  .step.running { background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .sicon {
    width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: var(--faint); border: 1.5px solid var(--border-strong);
  }
  .sicon.done { color: var(--success-ink); border-color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); }
  .sicon.error { color: color-mix(in srgb, var(--danger) 82%, var(--text)); border-color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
  .sicon.running { color: var(--accent); border-color: var(--accent); }
  .issues { display: flex; flex-direction: column; gap: 4px; background: var(--surface); border-radius: 12px; padding: 10px 12px; max-height: 160px; overflow-y: auto; font-size: 13px; color: var(--muted); }
  .fname { margin: 0; background: var(--col-bg); padding: 10px 12px; border-radius: 10px; font-size: 13.5px; word-break: break-all; }

  .adv .ri { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); background: var(--col-bg); }
  .adv .chev { display: flex; margin-left: auto; color: var(--faint); }
  .adv .p-k + .p-v { margin-left: auto; }
  .adv .still { cursor: default; }
  .adv .p-row.still:active { background: none; }
  .rpage {
    position: fixed; inset: 0; z-index: 661; overflow-y: auto; outline: none;
    display: flex; flex-direction: column; background: var(--bg); color: var(--text);
    padding: calc(56px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px));
  }
  .rkey { width: 56px; height: 56px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 22px;
    color: var(--accent-ink); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .rpage .rkey :global(svg.i) { width: 26px; height: 26px; }
  .rpage h1 { margin: 0 0 10px; font-size: 26px; font-weight: 700; line-height: 1.2; }
  .rpage .p-say { margin: 0; }
  .rcode { margin: 28px 0 14px; padding: 26px 10px; border: 2px dashed var(--border-strong); border-radius: 16px; background: var(--surface);
    text-align: center; font-size: 30px; font-weight: 700; letter-spacing: .12em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; user-select: all; }
  .racts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .racts.one { grid-template-columns: 1fr; }
  .rbtn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 48px; border: 0; border-radius: 12px; cursor: pointer;
    font: inherit; font-size: 16px; font-weight: 600; color: var(--accent); background: var(--surface); box-shadow: var(--p-shadow); }
  .rfill { flex: 1; min-height: 24px; }
  .rfine { margin: 0 0 12px; text-align: center; font-size: 14px; color: var(--faint); }
</style>
