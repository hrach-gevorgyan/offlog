mod discovery;
mod pairing;
#[cfg(windows)]
mod secure_storage;
mod sync_host;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct NyxdbProcess(Mutex<Option<std::process::Child>>);

fn device_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Offlog PC".to_string())
}

#[tauri::command]
fn get_sync_info(info: tauri::State<sync_host::SyncHostInfo>) -> sync_host::SyncHostInfo {
    info.inner().clone()
}

// The sync password (a paired phone's credential, or one typed into
// Settings' manual-connection field) is encrypted at rest via Windows
// DPAPI and kept separately from sync-host.json, which holds only this
// install's own generated identity and is fine as plain JSON.
// See secure_storage.rs.
#[cfg(windows)]
fn sync_secret_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("sync-secret.enc"))
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

// tauri-plugin-notification's desktop backend wires up no click/action
// callback: show() fires the toast and emits nothing back on
// interaction. tauri-winrt-notification (its own dependency) does
// support it via Toast::on_activated, so reminders bypass the plugin
// and build the toast with that crate directly -- the only way to get a
// working click/action callback on desktop. Everything else the plugin
// handles fine (channel creation, visual appearance) still goes through
// the plugin.
#[tauri::command]
fn send_task_notification(app: tauri::AppHandle, title: String, body: String, task_id: String) -> Result<(), String> {
    use tauri_winrt_notification::Toast;
    let app_id = app.config().identifier.clone();
    let emit_id = task_id.clone();
    Toast::new(&app_id)
        .title(&title)
        .text1(&body)
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

// tauri-plugin-notification's isPermissionGranted()/requestPermission() are
// hardcoded to return granted on desktop (no real permission model behind
// them), so the frontend can't tell a genuinely-blocked toast from a
// working one through the plugin. This queries the real Windows per-app
// notification toggle directly via WinRT -- the same setting the user
// flips under Settings > Notifications. Any query failure (unregistered
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

// The main window starts hidden (tauri.conf.json's `visible: false`) so
// there's no blank-white-then-content-pops-in flash while the frontend's
// own onMount does its thing (theme, init(), view restore) -- App.svelte
// calls this once `ready = true` is actually painted, revealing a
// window that's already fully rendered instead of an empty shell.
// `show()` is idempotent, so the setup()-side timeout fallback below
// firing after this already ran is harmless.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
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
    let ok = unsafe { TerminateJobObject(job.handle(), 0) };
    if ok == 0 {
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
    tauri::Builder::default()
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
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            bring_to_front(app);
        }))
        // Desktop reminders must not use the plain Web Notification API:
        // Tauri's embedded WebView2 has no handler for the browser
        // permission prompt, so requestPermission() silently resolves to
        // "denied" and no OS prompt is ever shown. This plugin provides
        // real native Windows toast notifications instead.
        .plugin(tauri_plugin_notification::init())
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
        // Start-on-login toggle in the tray menu below.
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            // Enabled in every build, not just debug -- an installed
            // release build with no log file is undiagnosable. Don't gate
            // this on `cfg!(debug_assertions)`. tauri-plugin-log's own
            // rotation handles file growth.
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

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
            let info = sync_host::load_or_create_info(&config_path);

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
            tauri::async_runtime::spawn(async move {
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
                        if ready {
                            sync_host::ensure_database(&info_bg);
                            if let Some(uuid) = sync_host::fetch_uuid(info_bg.port) {
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
                                let pairing_state = Arc::new(pairing::PairingState::new(info_bg.clone()));
                                match pairing::spawn_server(pairing_state.clone(), uuid.clone()) {
                                    Ok(pairing_port) => {
                                        app_handle.manage(pairing_state);
                                        let name = device_name();
                                        if let Some(daemon) = discovery::advertise(info_bg.port, &uuid, &name, pairing_port) {
                                            app_handle.manage(daemon);
                                        }
                                    }
                                    Err(e) => log::error!("pairing: failed to start server: {e}"),
                                }
                            } else {
                                log::warn!("discovery: couldn't fetch NyxDB uuid, skipping mDNS advertise");
                            }
                        }
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
            // show_main_window once its first render is actually painted):
            // if that call is ever late or never arrives (a frontend JS
            // error before `ready = true`, a slow first paint on a very
            // underpowered machine), the window must not stay invisible
            // forever with no way for the user to even see an error.
            // show() is idempotent, so this firing after the frontend
            // already revealed the window is a harmless no-op.
            let timeout_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // std::thread::sleep, not an async sleep -- same pattern
                // sync_host::wait_ready uses, and avoids taking tokio as a
                // direct dependency for one sleep.
                std::thread::sleep(Duration::from_secs(5));
                if let Some(w) = timeout_handle.get_webview_window("main") {
                    let _ = w.show();
                }
            });

            // Closing the window (the titlebar X) hides it instead of
            // quitting -- a tray-resident app stays running so the global
            // quick-capture shortcut and sync host keep working with the
            // window closed. The only real quit path is the tray menu's
            // "Quit" item below (or an OS-level process kill).
            if let Some(w) = app.get_webview_window("main") {
                let w_hide = w.clone();
                w.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
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
            let autostart_item = CheckMenuItem::with_id(app, "autostart", "Start on login", true, autostart_checked, None::<&str>)?;
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
                        if toggled.is_ok() {
                            let _ = autostart_item_for_toggle.set_checked(!now_enabled);
                        }
                    }
                    "quit" => {
                        terminate_nyxdb(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                // Left click toggles show/hide rather than always showing,
                // so the tray icon can also tuck the window away again.
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        let visible = app.get_webview_window("main").and_then(|w| w.is_visible().ok()).unwrap_or(false);
                        if visible {
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
            if let Err(e) = app.global_shortcut().register("Ctrl+Alt+O") {
                log::warn!("global shortcut Ctrl+Alt+O unavailable (already bound by another app?): {e}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_sync_info, is_debug_build, generate_pairing_code, reset_sync_data, show_main_window, send_task_notification, check_desktop_notification_setting, get_detected_other_hosts, store_sync_secret, get_sync_secret])
        .build(tauri::generate_context!())
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
