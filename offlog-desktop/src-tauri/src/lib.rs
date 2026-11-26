mod discovery;
mod pairing;
#[cfg(windows)]
mod secure_storage;
mod sync_host;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_window_state::{AppHandleExt as WindowStateExt, StateFlags};

struct NyxdbProcess(Mutex<Option<std::process::Child>>);

// Set before any deliberate NyxDB teardown (quit, reset_sync_data) so the
// supervisor never mistakes it for a crash and respawns the sidecar.
static NYXDB_STOPPING: AtomicBool = AtomicBool::new(false);

// The login entry launches with this flag. The app then stays in the tray:
// the start-up reveal (show_main_window_at_start and the 5-second fallback)
// does nothing. Every deliberate show -- tray, Ctrl+Alt+O, a second launch,
// a reminder click -- still shows the window.
const LAUNCH_HIDDEN_ARG: &str = "--minimized";
static LAUNCHED_HIDDEN: AtomicBool = AtomicBool::new(false);

const GLOBAL_SHORTCUT: &str = "Ctrl+Alt+O";
// Present when the user switched the global shortcut off. A file, not
// localStorage, because the shortcut is registered in setup(), before the
// frontend has loaded; AltGr layouts (Polish "ó" is AltGr+O) arrive as
// Ctrl+Alt, so for some people the shortcut swallows a letter.
const SHORTCUT_OFF_FILE: &str = "global-shortcut-off";

// Size, position and maximized state, restored by tauri-plugin-window-state.
// Never VISIBLE: the window's visibility belongs to the start-up reveal and
// the --minimized login start.
fn window_state_flags() -> StateFlags {
    StateFlags::all() & !StateFlags::VISIBLE
}

fn device_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Offlog PC".to_string())
}

// The default name for this computer's edits, before the user picks one.
#[tauri::command]
fn get_device_name() -> String {
    device_name()
}

#[tauri::command]
fn get_sync_info(info: tauri::State<sync_host::SyncHostInfo>) -> sync_host::SyncHostInfo {
    info.inner().clone()
}

// The sync password (a paired phone's credential, or one typed into
// Settings' manual-connection field) is encrypted at rest via Windows
// DPAPI and kept separately from sync-host.json, the sync server's own
// identity (its admin password and the sync key), plain JSON beside the
// data those protect (security.md §2).
// See secure_storage.rs. Debug builds use their own file, same split as
// sync-host.dev.json -- a dev run must never read or overwrite the
// installed build's stored credential.
#[cfg(windows)]
fn sync_secret_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let filename = if cfg!(debug_assertions) { "sync-secret.dev.enc" } else { "sync-secret.enc" };
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join(filename))
}

#[tauri::command]
#[cfg(windows)]
fn store_sync_secret(app: tauri::AppHandle, user: String, pass: String) -> Result<(), String> {
    secure_storage::store_secret(&sync_secret_path(&app)?, &user, &pass).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[cfg(windows)]
struct SyncSecret { user: String, pass: String }

#[tauri::command]
#[cfg(windows)]
fn get_sync_secret(app: tauri::AppHandle) -> Result<Option<SyncSecret>, String> {
    Ok(secure_storage::load_secret(&sync_secret_path(&app)?).map(|(user, pass)| SyncSecret { user, pass }))
}

// Surfaces whatever discovery::browse_for_others() found at startup so
// the frontend can warn about a second host on the LAN. Managed empty
// before the background scan runs, so the command never errors -- it
// answers "nothing detected yet" if called before the scan finishes
// (a few seconds after NyxDB boots). Callers must poll rather than
// treat one empty answer as final.
struct DetectedOtherHosts(Mutex<Vec<discovery::OtherHost>>);

// Where a damaged NyxDB data folder was moved this run (supervise_nyxdb), for
// Settings to say so; also sent as the "sync-data-set-aside" event.
struct SyncDataSetAside(Mutex<Option<String>>);

#[tauri::command]
fn get_sync_data_set_aside(state: tauri::State<SyncDataSetAside>) -> Option<String> {
    state.0.lock().ok().and_then(|v| v.clone())
}

#[tauri::command]
fn get_detected_other_hosts(state: tauri::State<DetectedOtherHosts>) -> Vec<discovery::OtherHost> {
    state.0.lock().map(|v| v.clone()).unwrap_or_default()
}

// Lets the frontend gate dev-only UI (the "Reset test data" button) on
// whether this is actually a debug build -- the frontend has no other
// way to know, since it's the same web bundle either way.
#[tauri::command]
fn is_debug_build() -> bool {
    cfg!(debug_assertions)
}

// Every desktop reminder is built here with tauri-winrt-notification; the
// app has no notification plugin. Its Toast::on_activated is what gets a
// click or a Done/Snooze press back to the frontend, as the
// 'notification-action' event.
//
// That callback lives only as long as this process, and Windows can't
// relaunch the app for a toast clicked from the notification list (no COM
// activator is registered). The Reminder scenario keeps the toast on screen
// until the user acts on it, so the press reaches the running app instead of
// a toast that slid into the list and went dead.
#[tauri::command]
fn send_task_notification(app: tauri::AppHandle, title: String, body: String, task_id: String) -> Result<(), String> {
    use tauri_winrt_notification::{Scenario, Toast};
    let app_id = app.config().identifier.clone();
    let emit_id = task_id.clone();
    Toast::new(&app_id)
        .title(&title)
        .text1(&body)
        .scenario(Scenario::Reminder)
        .add_button("Done", "done")
        .add_button("Snooze 1h", "snooze")
        .on_activated(move |action| {
            let action_id = action.unwrap_or_default();
            let _ = app.emit("notification-action", (action_id, emit_id.clone()));
            Ok(())
        })
        .show()
        .map_err(|e| format!("failed to show notification: {e}"))
}

// Windows still accepts a toast when Offlog's notifications are switched
// off and just doesn't show it, so the frontend reads the real per-app
// toggle here, via WinRT -- the same setting the user flips under
// Settings > Notifications -- before firing a reminder. Any query failure (unregistered
// AUMID, non-Windows target, API unavailable) falls back to `true`, same
// as the frontend's prior always-granted assumption -- an unreadable
// setting shouldn't regress a working install to "blocked".
#[tauri::command]
fn check_desktop_notification_setting(app: tauri::AppHandle) -> bool {
    use windows::UI::Notifications::{NotificationSetting, ToastNotificationManager};
    use windows::core::HSTRING;
    let app_id = app.config().identifier.clone();
    (|| -> windows::core::Result<bool> {
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))?;
        Ok(notifier.Setting()? == NotificationSetting::Enabled)
    })()
    .unwrap_or(true)
}

// Notes arrive by sync, so only a plain http(s) address may reach
// ShellExecute: anything else (a path, file:, a custom scheme) could open a
// file or start a program.
fn is_web_link(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let rest = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://"));
    matches!(rest, Some(r) if !r.is_empty())
        && url.len() <= 2048
        && !url.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"')
}

// Opens a link from a task's notes in the default browser.
#[tauri::command]
fn open_web_link(url: String) -> Result<(), String> {
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    if !is_web_link(&url) {
        return Err("not a web address".into());
    }
    let r = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(url), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
    // ShellExecute reports success as a value above 32.
    if (r.0 as isize) <= 32 {
        return Err(format!("could not open the link ({})", r.0 as isize));
    }
    Ok(())
}

// The main window starts hidden (tauri.conf.json's `visible: false`) so
// there's no blank-white-then-content-pops-in flash while the frontend's
// own onMount does its thing (theme, init(), view restore) -- App.svelte
// calls show_main_window_at_start once `ready = true` is actually painted,
// revealing a window that's already fully rendered instead of an empty
// shell. `show()` is idempotent, so the setup()-side timeout fallback below
// firing after this already ran is harmless.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    bring_to_front(&app);
}

// Only for the reveal at start-up; anything the user asked for uses
// show_main_window, so a login start can't swallow it.
#[tauri::command]
fn show_main_window_at_start(app: tauri::AppHandle) {
    if !LAUNCHED_HIDDEN.load(Ordering::SeqCst) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

// The plugin writes its file only on a normal exit, which Offlog rarely has:
// Windows ends it at sign-out and an update exits the process. So the state
// is also written on close-to-tray, on Quit and before an update installs.
#[tauri::command]
fn save_window_state(app: tauri::AppHandle) {
    if let Err(e) = app.save_window_state(window_state_flags()) {
        log::warn!("window state: could not save: {e}");
    }
}

fn shortcut_off_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(SHORTCUT_OFF_FILE))
}

#[tauri::command]
// On only when wanted and actually held: another app can own Ctrl+Alt+O, and
// the switch must not claim a hotkey that does nothing.
fn get_global_shortcut_enabled(app: tauri::AppHandle) -> bool {
    shortcut_off_path(&app).map_or(true, |p| !p.exists()) && app.global_shortcut().is_registered(GLOBAL_SHORTCUT)
}

#[tauri::command]
fn set_global_shortcut_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let path = shortcut_off_path(&app).ok_or("no config folder")?;
    if enabled {
        // Registered first: if another app holds the key, the "off" marker
        // stays and the preference keeps matching what the switch shows.
        if !app.global_shortcut().is_registered(GLOBAL_SHORTCUT) {
            app.global_shortcut().register(GLOBAL_SHORTCUT).map_err(|e| e.to_string())?;
        }
        let _ = std::fs::remove_file(&path);
    } else {
        if let Some(dir) = path.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
        std::fs::write(&path, b"").map_err(|e| e.to_string())?;
        if app.global_shortcut().is_registered(GLOBAL_SHORTCUT) {
            app.global_shortcut().unregister(GLOBAL_SHORTCUT).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// Shared by the tray menu, tray left-click, and the global shortcut handler
// below -- all need to reliably bring the main window to the front, not
// just make it visible.
//
// set_focus() alone is not enough when the window is already open but
// unfocused: Windows' foreground-lock timeout silently ignores
// SetForegroundWindow (what set_focus() calls) from a thread that isn't
// the current foreground app, which a global-shortcut or tray callback
// never is. Toggling always-on-top is the workaround -- Windows treats
// that as a legitimate reason to actually raise the window. Keep both
// set_always_on_top calls.
fn bring_to_front(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.set_always_on_top(true);
        let _ = w.set_always_on_top(false);
    }
}

// Shared by the tray "Quit" menu item and the ExitRequested handler below --
// both are real, deliberate quits (closing the window to the tray never
// reaches either path), so both need the same NyxDB teardown. Every exit
// path must call this, or the sidecar outlives the app. Safe to call
// twice in a row: the Job/Child state is simply gone the second time and
// the `let _ =` swallows the no-op error.
fn terminate_nyxdb(app_handle: &tauri::AppHandle) {
    // The flag goes up before the kill and the Child is taken under the
    // same lock supervise_nyxdb() respawns under, so a restart racing this
    // either sees the flag or has its new Child taken and killed here.
    NYXDB_STOPPING.store(true, Ordering::SeqCst);
    if let Some(job) = app_handle.try_state::<win32job::Job>() {
        let _ = unsafe { TerminateJobObject(job.handle(), 0) };
    }
    if let Some(state) = app_handle.try_state::<NyxdbProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

#[tauri::command]
fn generate_pairing_code(state: tauri::State<Arc<pairing::PairingState>>) -> String {
    state.generate_code()
}

// Keeps polling after the initial readiness window instead of giving up:
// the pairing server and mDNS start only once, so a slow first start would
// otherwise leave the whole session unpairable. Stops only when the
// sidecar is gone -- exited on its own (supervise_nyxdb() then decides
// whether to restart it), or taken by terminate_nyxdb() on quit.
fn wait_ready_with_backoff(app_handle: &tauri::AppHandle, port: u16) -> bool {
    let mut attempt = 0u32;
    loop {
        let alive = app_handle.try_state::<NyxdbProcess>().is_some_and(|state| {
            state.0.lock().map(|mut guard| matches!(guard.as_mut().map(|c| c.try_wait()), Some(Ok(None)))).unwrap_or(false)
        });
        if !alive {
            log::error!("sync_host: NyxDB exited before becoming ready on port {port}");
            return false;
        }
        std::thread::sleep(sync_host::retry_delay(attempt));
        if sync_host::is_ready(port) {
            log::info!("sync_host: NyxDB ready on port {port} after {} retries", attempt + 1);
            return true;
        }
        attempt = attempt.saturating_add(1);
    }
}

// Runs once per session, the first time NyxDB is ready -- never again on a
// supervisor restart: the pairing server's port and the mDNS daemon are
// tied to this process, not to the sidecar, and survive it.
fn start_pairing_and_discovery(app_handle: &tauri::AppHandle, info: &sync_host::SyncHostInfo) {
    let Some(uuid) = sync_host::fetch_uuid(info.port) else {
        log::warn!("discovery: couldn't fetch NyxDB uuid, skipping mDNS advertise");
        return;
    };
    // Runs before this instance advertises itself below, so it
    // can only see genuinely other hosts, never a self-echo.
    let others = discovery::browse_for_others(Duration::from_millis(1500), &uuid);
    if !others.is_empty() {
        log::warn!("discovery: {} other Offlog host(s) detected on this network", others.len());
    }
    if let Some(state) = app_handle.try_state::<DetectedOtherHosts>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = others;
        }
    }
    let pairing_state = Arc::new(pairing::PairingState::new(info.clone()));
    match pairing::spawn_server(pairing_state.clone(), uuid.clone(), app_handle.clone()) {
        Ok(pairing_port) => {
            app_handle.manage(pairing_state);
            let name = device_name();
            if let Some(daemon) = discovery::advertise(info.port, &uuid, &name, pairing_port) {
                app_handle.manage(daemon);
            }
        }
        Err(e) => log::error!("pairing: failed to start server: {e}"),
    }
}

const SUPERVISE_POLL: Duration = Duration::from_secs(5);

// Restarts NyxDB if it exits mid-session, with the same binary, data dir,
// port and credentials (so paired phones and the app's own sync URL keep
// working), inside the original Job. Backoff and the give-up limit are
// sync_host::RestartPolicy; after a burst of crashes it rests an hour and
// tries again. Returns on quit, or if the Child has been taken by
// terminate_nyxdb().
fn supervise_nyxdb(
    app_handle: &tauri::AppHandle,
    binary: &std::path::Path,
    data_dir: &std::path::Path,
    info: &sync_host::SyncHostInfo,
    mut announced: bool,
) {
    let mut policy = sync_host::RestartPolicy::default();
    let mut damaged = sync_host::DamagedStore::default();
    loop {
        std::thread::sleep(SUPERVISE_POLL);
        if NYXDB_STOPPING.load(Ordering::SeqCst) {
            return;
        }
        let Some(state) = app_handle.try_state::<NyxdbProcess>() else { return };
        let status = {
            let Ok(mut guard) = state.0.lock() else { return };
            let Some(child) = guard.as_mut() else { return };
            match child.try_wait() {
                Ok(None) => continue,
                Ok(Some(status)) => status,
                Err(e) => {
                    log::warn!("sync_host: couldn't poll NyxDB status: {e}");
                    continue;
                }
            }
        };
        if NYXDB_STOPPING.load(Ordering::SeqCst) {
            return;
        }
        // NyxDB is not running here, so its folder is free to move. Every
        // device keeps a full copy, so a fresh store loses nothing.
        if damaged.record_exit(status.code()) {
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            match sync_host::set_aside_data_dir(data_dir, now) {
                Ok(to) => {
                    log::error!("sync_host: NyxDB can't open its data; moved it to {} and starting fresh, devices upload again on their next sync", to.display());
                    let path = to.display().to_string();
                    if let Some(state) = app_handle.try_state::<SyncDataSetAside>() {
                        if let Ok(mut guard) = state.0.lock() { *guard = Some(path.clone()); }
                    }
                    let _ = app_handle.emit("sync-data-set-aside", path);
                }
                Err(e) => log::error!("sync_host: NyxDB can't open its data, and moving it aside failed: {e}"),
            }
        }
        let delay = match policy.record_crash(Instant::now()) {
            Some(delay) => {
                log::warn!("sync_host: NyxDB exited ({status}); restarting in {} s", delay.as_secs());
                delay
            }
            None => {
                log::error!(
                    "sync_host: NyxDB exited ({status}) {} times within {} s; trying again in {} min",
                    sync_host::MAX_CRASHES_IN_WINDOW,
                    sync_host::CRASH_WINDOW.as_secs(),
                    sync_host::REST_AFTER_CRASH_BURST.as_secs() / 60
                );
                sync_host::REST_AFTER_CRASH_BURST
            }
        };
        std::thread::sleep(delay);

        let Some(job) = app_handle.try_state::<win32job::Job>() else { return };
        {
            let Ok(mut guard) = state.0.lock() else { return };
            // Checked under the lock terminate_nyxdb() takes the Child
            // under, so a quit can't land between this check and the spawn.
            if NYXDB_STOPPING.load(Ordering::SeqCst) || guard.is_none() {
                return;
            }
            match sync_host::respawn_nyxdb(binary, data_dir, info, &job) {
                Ok(child) => *guard = Some(child),
                Err(e) => {
                    // The exited Child stays in place, so the next poll
                    // sees it again and counts this as another crash.
                    log::error!("sync_host: failed to restart NyxDB: {e}");
                    continue;
                }
            }
        }
        log::info!("sync_host: NyxDB restarted on port {}", info.port);
        if sync_host::wait_ready(info.port, Duration::from_secs(20)) || wait_ready_with_backoff(app_handle, info.port) {
            sync_host::ensure_database(info);
            // The frontend restarts its replication (store.ts), which may
            // otherwise sit in a retry wait of several minutes.
            let _ = app_handle.emit("sync-host-restarted", ());
            if !announced {
                start_pairing_and_discovery(app_handle, info);
                announced = true;
            }
        }
    }
}

struct NyxdbDataDir(std::path::PathBuf);

// reset_sync_data below wipes the local NyxDB data dir so a first-run
// state can be tested. It is gated on both sides -- the Rust command
// refuses outside a debug build, and the frontend only renders the
// button for a debug build -- so it can never be reachable in a real
// release. It terminates via the Job Object rather than killing the
// tracked Child directly, so the whole process tree goes down.
#[cfg(windows)]
unsafe extern "system" {
    fn TerminateJobObject(hjob: isize, uexitcode: u32) -> i32;
}

#[tauri::command]
fn reset_sync_data(app: tauri::AppHandle, job: tauri::State<win32job::Job>, data_dir: tauri::State<NyxdbDataDir>) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("reset_sync_data is only available in debug builds".to_string());
    }
    // win32job::Job has no terminate() of its own -- TerminateJobObject is
    // the raw Win32 call, taking the same job handle already used to
    // register the NyxDB process (sync_host::spawn_nyxdb()).
    NYXDB_STOPPING.store(true, Ordering::SeqCst);
    let ok = unsafe { TerminateJobObject(job.handle(), 0) };
    if ok == 0 {
        NYXDB_STOPPING.store(false, Ordering::SeqCst);
        return Err("TerminateJobObject failed".to_string());
    }
    let _ = std::fs::remove_dir_all(&data_dir.0);
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::process::Command::new(exe).spawn();
    }
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    // Debug only: setup() creates the main window itself with a separate
    // WebView2 data directory. Release builds keep Tauri's own creation.
    #[cfg(debug_assertions)]
    for w in context.config_mut().app.windows.iter_mut() {
        w.create = false;
    }
    let builder = tauri::Builder::default();
    // Must be registered FIRST (plugin docs) so a second launch is
    // rejected before it can start doing anything expensive.
    //
    // Load-bearing, not a nicety: the app is tray-resident and can be
    // running with no visible window, so relaunching from the taskbar
    // (or autostart-on-login plus one manual click) is expected. Without
    // this guard a second instance reads the same sync-host.json and
    // forks a second NyxDB sidecar onto the same port and data
    // directory, claims its own tray icon, advertises the same uuid
    // over mDNS, and replicates against the first. terminate_nyxdb()
    // can only kill the Job it owns, so quitting one instance leaves
    // the other's sidecar holding the data dir.
    //
    // Instead, a second launch surfaces the existing window and exits.
    // Release only: the lock is keyed on the identifier alone, which a
    // debug build shares, so a dev run would just surface the installed
    // app (and work against its data) instead of starting.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        bring_to_front(app);
    }));
    builder
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(window_state_flags()).build())
        // Backup/Export can't use a blob URL + `<a download>`: WebView2 has
        // no download manager to hand the file off to, so the download is
        // silently inert. These two give the frontend a real native
        // "Save As" dialog plus file write.
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // tauri.conf.json's `plugins.updater` block points at a signed
        // endpoint (GitHub Releases' "latest" URL) with a pubkey from
        // `cargo tauri signer generate`; check()/download()/install() hit
        // real infrastructure. The check/download/install state machine and
        // its UI live in offlog-app's updateChecker.ts + UpdateModal.svelte.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // The global shortcut handler only shows the window and emits an
        // event; navigation lives in the frontend (App.svelte), the same
        // split as send_task_notification's 'notification-action' event.
        // It lands on Dashboard rather than Quick Add -- Quick Add has its
        // own in-app shortcut (Ctrl+N) and the tray menu's "Quick Add" item,
        // which emits 'quick-capture'.
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                bring_to_front(app);
                let _ = app.emit("show-dashboard", ());
            }
        }).build())
        // Start-on-login toggle in the tray menu below. The entry carries
        // LAUNCH_HIDDEN_ARG so a login start stays in the tray.
        .plugin(tauri_plugin_autostart::Builder::new().arg(LAUNCH_HIDDEN_ARG).build())
        .setup(|app| {
            // Enabled in every build, not just debug -- an installed
            // release build with no log file is undiagnosable. Don't gate
            // this on `cfg!(debug_assertions)`. tauri-plugin-log's own
            // rotation handles file growth.
            //
            // Debug builds log to Offlog-dev.log so reset-dev-env.ps1 can
            // clear dev logs without touching the installed build's
            // Offlog.log in the same folder.
            let log_builder = tauri_plugin_log::Builder::default().level(log::LevelFilter::Info);
            #[cfg(debug_assertions)]
            let log_builder = log_builder.clear_targets().targets([
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: Some("Offlog-dev".into()) }),
            ]);
            app.handle().plugin(log_builder.build())?;

            // Debug builds get their own WebView2 profile. The default one
            // (app_local_data_dir()) is keyed only on the identifier and
            // both builds load the same tauri.localhost origin, so a dev
            // run would otherwise share the installed build's IndexedDB
            // (its PouchDB tasks) and localStorage (offlog_sync_url).
            // run() stops Tauri creating the config window in debug; it is
            // created here instead with the separate data directory.
            #[cfg(debug_assertions)]
            if let Some(cfg) = app.config().app.windows.iter().find(|w| w.label == "main").cloned() {
                tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?
                    .data_directory(app.path().app_local_data_dir()?.join("webview-dev"))
                    .build()?;
            }

            let app_data_dir = app.path().app_data_dir()?;
            // `app_data_dir()` depends only on the app identifier, not on
            // debug_assertions, so `cargo tauri dev` and an installed build
            // would otherwise share one sync-host.json (port/credentials)
            // while running against different NyxDB data -- a phone paired
            // against one build's identity would silently talk to the
            // other's database. Debug builds get their own config file so
            // the two identities can never collide.
            let config_filename = if cfg!(debug_assertions) { "sync-host.dev.json" } else { "sync-host.json" };
            let config_path = app_data_dir.join(config_filename);
            let info = sync_host::ensure_port_usable(sync_host::load_or_create_info(&config_path), &config_path);

            let resource_dir = app.path().resource_dir().ok();
            let nyxdb_binary = sync_host::nyxdb_binary_path(resource_dir);
            log::info!("sync_host: using NyxDB binary {}", nyxdb_binary.display());
            // Same debug/release split as config_filename above: a dev
            // run's database must never share a directory with an
            // installed build's.
            let data_dirname = if cfg!(debug_assertions) { "nyxdb-data-dev" } else { "nyxdb-data" };
            let data_dir = app_data_dir.join(data_dirname);
            app.manage(NyxdbDataDir(data_dir.clone()));
            app.manage(DetectedOtherHosts(Mutex::new(Vec::new())));
            app.manage(SyncDataSetAside(Mutex::new(None)));

            // info is managed immediately (below) so get_sync_info answers
            // right away with the sidecar's port -- config.ts's
            // initTauriSyncDefaults() only needs that to point PouchDB at
            // the right URL, and its `retry: true` live sync tolerates the
            // target not answering yet.
            //
            // Everything that actually needs NyxDB running (spawning it,
            // waiting for its port, creating the database, starting the
            // pairing server, mDNS advertising) must stay off setup()'s
            // thread: Tauri doesn't paint the window until setup() returns,
            // so doing it inline shows a blank window for the whole boot.
            // Keep it in this background task.
            let app_handle = app.handle().clone();
            let nyxdb_binary_bg = nyxdb_binary.clone();
            let data_dir_bg = data_dir.clone();
            let info_bg = info.clone();
            //
            // A plain OS thread, not an async task: the readiness retry
            // below can block for as long as NyxDB stays down, which would
            // pin one of the async runtime's few worker threads.
            std::thread::spawn(move || {
                match sync_host::spawn_nyxdb(&nyxdb_binary_bg, &data_dir_bg, &info_bg) {
                    Ok((child, job)) => {
                        // The Job must stay alive for the app's lifetime — its
                        // Drop impl closes the job handle, and closing it is
                        // exactly what triggers JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                        // which is what ties the NyxDB child to this process on
                        // every exit path including a crash or force-kill. Keep
                        // it in tauri's managed state (which lives until the
                        // process ends); never let it drop early.
                        app_handle.manage(job);
                        app_handle.manage(NyxdbProcess(Mutex::new(Some(child))));
                        let ready = sync_host::wait_ready(info_bg.port, Duration::from_secs(20));
                        log::info!("sync_host: NyxDB ready = {ready} on port {}", info_bg.port);
                        let announced = ready || wait_ready_with_backoff(&app_handle, info_bg.port);
                        if announced {
                            sync_host::ensure_database(&info_bg);
                            start_pairing_and_discovery(&app_handle, &info_bg);
                        }
                        supervise_nyxdb(&app_handle, &nyxdb_binary_bg, &data_dir_bg, &info_bg, announced);
                    }
                    Err(e) => {
                        log::error!("sync_host: failed to spawn NyxDB sidecar: {e}");
                        app_handle.manage(NyxdbProcess(Mutex::new(None)));
                    }
                }
            });

            app.manage(info);

            // Safety net for the hidden-until-ready window (tauri.conf.json's
            // `visible: false`, revealed by the frontend calling
            // show_main_window_at_start once its first render is painted):
            // if that call is ever late or never arrives (a frontend JS
            // error before `ready = true`, a slow first paint on a very
            // underpowered machine), the window must not stay invisible
            // forever with no way for the user to even see an error.
            // show() is idempotent, so this firing after the frontend
            // already revealed the window is a harmless no-op.
            let launched_hidden = std::env::args().any(|a| a == LAUNCH_HIDDEN_ARG);
            LAUNCHED_HIDDEN.store(launched_hidden, Ordering::SeqCst);
            let timeout_handle = app.handle().clone();
            if !launched_hidden {
                tauri::async_runtime::spawn(async move {
                    // std::thread::sleep, not an async sleep -- same pattern
                    // sync_host::wait_ready uses, and avoids taking tokio as a
                    // direct dependency for one sleep.
                    std::thread::sleep(Duration::from_secs(5));
                    if let Some(w) = timeout_handle.get_webview_window("main") {
                        let _ = w.show();
                    }
                });
            }

            // Rewrite an existing login entry on every start: one written
            // without LAUNCH_HIDDEN_ARG, or pointing at a folder Offlog has
            // since been reinstalled away from, gets the current flag and
            // path. Only when is_enabled() -- which also honours Windows
            // Settings' Startup apps switch -- because enable() switches that
            // back on, and must not override a user who turned it off there.
            // Release only: the entry's name is shared, so a debug build
            // would repoint the installed app's login entry at itself.
            #[cfg(not(debug_assertions))]
            if app.autolaunch().is_enabled().unwrap_or(false) {
                let autolaunch = app.autolaunch();
                if let Err(e) = autolaunch.enable() {
                    log::warn!("autostart: could not refresh the login entry: {e}");
                }
            }

            // Closing the window (the titlebar X) hides it instead of
            // quitting -- a tray-resident app stays running so the global
            // quick-capture shortcut and sync host keep working with the
            // window closed. The only real quit path is the tray menu's
            // "Quit" item below (or an OS-level process kill).
            if let Some(w) = app.get_webview_window("main") {
                let w_hide = w.clone();
                let state_handle = app.handle().clone();
                w.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = state_handle.save_window_state(window_state_flags());
                        let _ = w_hide.hide();
                    }
                });
            }

            let show_item = MenuItem::with_id(app, "show", "Show Offlog", true, None::<&str>)?;
            let quickadd_item = MenuItem::with_id(app, "quickadd", "Quick Add", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            // Read the real OS autostart-registration state at menu-build
            // time rather than an in-memory flag; the click handler below
            // keeps the CheckMenuItem in sync via set_checked(), holding it
            // through a cheap Rc-backed .clone().
            let autostart_checked = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart_item = CheckMenuItem::with_id(app, "autostart", "Start on login", !cfg!(debug_assertions), autostart_checked, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[
                &show_item,
                &quickadd_item,
                &settings_item,
                &PredefinedMenuItem::separator(app)?,
                &autostart_item,
                &PredefinedMenuItem::separator(app)?,
                &quit_item,
            ])?;
            let autostart_item_for_toggle = autostart_item.clone();
            let autostart_item_for_open = autostart_item.clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("Offlog")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => bring_to_front(app),
                    "quickadd" => {
                        bring_to_front(app);
                        let _ = app.emit("quick-capture", ());
                    }
                    "settings" => {
                        bring_to_front(app);
                        let _ = app.emit("open-settings", ());
                    }
                    "autostart" => {
                        let mgr = app.autolaunch();
                        let now_enabled = mgr.is_enabled().unwrap_or(false);
                        let toggled = if now_enabled { mgr.disable() } else { mgr.enable() };
                        if let Err(e) = toggled {
                            log::warn!("autostart: could not change the login entry: {e}");
                        }
                        // The menu flips the checkmark itself on click; set it
                        // from the registry so a failed write can't show a
                        // state that was never applied.
                        let _ = autostart_item_for_toggle.set_checked(mgr.is_enabled().unwrap_or(false));
                    }
                    "quit" => {
                        let _ = app.save_window_state(window_state_flags());
                        terminate_nyxdb(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                // Left click toggles show/hide rather than always showing,
                // so the tray icon can also tuck the window away again.
                .on_tray_icon_event(move |tray, event| {
                    // Re-read before the menu opens: Windows Settings' Startup
                    // apps switch can change the state while Offlog runs.
                    if let TrayIconEvent::Click { button: MouseButton::Right, button_state: MouseButtonState::Down, .. } = event {
                        let _ = autostart_item_for_open.set_checked(tray.app_handle().autolaunch().is_enabled().unwrap_or(false));
                    }
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        // A minimized window still counts as visible to
                        // Windows; it should come back, not be hidden.
                        let shown = app.get_webview_window("main")
                            .map(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
                            .unwrap_or(false);
                        if shown {
                            if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
                        } else {
                            bring_to_front(app);
                        }
                    }
                })
                .build(app)?;

            // Global "back to Offlog" shortcut -- works without Offlog
            // focused. Registered once at startup; the handler lives in the
            // plugin() call above.
            //
            // Deliberately NOT `?`. Ctrl+Alt+O may already be owned by
            // another running app, and Windows refuses the second
            // registration. Propagating that error out of setup() would
            // fail .build() and panic the whole app on startup -- tray,
            // window and sync all gone over one key combo. Registration
            // failure must stay non-fatal: log and carry on.
            if get_global_shortcut_enabled(app.handle().clone()) {
                if let Err(e) = app.global_shortcut().register(GLOBAL_SHORTCUT) {
                    log::warn!("global shortcut {GLOBAL_SHORTCUT} unavailable (already bound by another app?): {e}");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_sync_info, get_device_name,is_debug_build, generate_pairing_code, reset_sync_data, show_main_window, show_main_window_at_start, save_window_state, get_global_shortcut_enabled, set_global_shortcut_enabled, send_task_notification, check_desktop_notification_setting, open_web_link, get_detected_other_hosts, get_sync_data_set_aside, store_sync_secret, get_sync_secret])
        .build(context)
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // A graceful exit still needs the explicit Job-based
                // termination; relying on JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                // firing when the Job goes out of scope isn't reliably
                // timely on this path.
                terminate_nyxdb(app_handle);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::is_web_link;

    #[test]
    fn only_plain_web_addresses_pass() {
        assert!(is_web_link("https://offlog.io"));
        assert!(is_web_link("HTTP://example.com/a?b=c#d"));
        for bad in ["", "https://", "file:///C:/Windows/System32/calc.exe", r"C:\Windows\notepad.exe",
                    "javascript:alert(1)", "ms-settings:privacy", "https://a b", "https://a\"b", "https://a\nb", "mailto:x@y.z"] {
            assert!(!is_web_link(bad), "{bad:?} must be refused");
        }
        assert!(!is_web_link(&format!("https://{}", "a".repeat(2050))));
    }
}
