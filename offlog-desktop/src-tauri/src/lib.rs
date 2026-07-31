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

// C8 (ROADMAP.md): the sync password itself (a paired phone's real
// credential, or one typed into Settings' manual-connection field) is
// encrypted at rest via Windows DPAPI, stored separately from
// sync-host.json (which holds this install's own generated identity --
// not the same secret, and fine as plain JSON). See secure_storage.rs.
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

// S1 (DECISIONS.md's Open Questions section, 2026-07-20): surfaces whatever discovery::browse_for_others()
// found at startup so the frontend can warn about a second host on the
// LAN. Managed empty before the background scan runs, so this command
// never errors -- it just answers "nothing detected yet" if called
// before the scan (which takes a few seconds after NyxDB itself boots)
// finishes; the frontend already polls this a couple of times for
// exactly that reason (see config.ts's checkForOtherHosts()).
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

// Owner-reported, 2026-07-16: clicking a fired reminder notification
// didn't open the task. Root cause, confirmed by reading
// tauri-plugin-notification's own source: its desktop backend never
// wires up a click/action callback at all -- show()/notify() just fire
// the toast and return, with zero event emitted back to the frontend on
// interaction (grepped the entire crate for `emit`/`listen`/`on_action`:
// nothing). The underlying tauri-winrt-notification crate it depends on
// *does* support this (Toast::on_activated, a real WinRT callback) --
// the plugin just doesn't expose it. Bypassing the plugin's own
// sendNotification() for reminders specifically and building the toast
// directly with this crate (already a transitive dependency, now also a
// direct one) is the only way to get a working click/action callback on
// desktop. Not used for anything else the plugin already handles fine
// (channel creation, the notification's actual visual appearance).
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

// The main window starts hidden (tauri.conf.json's `visible: false`) so
// there's no blank-white-then-content-pops-in flash while the frontend's
// own onMount does its thing (theme, init(), view restore) -- App.svelte
// calls this once `ready = true` is actually painted, revealing a
// window that's already fully rendered instead of an empty shell
// (owner-reported, "can we make it super fast showup", 2026-07-15).
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
// just visible. Owner-reported, 2026-07-31: the global shortcut worked
// fine while the window was hidden, but did nothing when the window was
// already open in the background (behind other windows, unfocused) --
// Windows' foreground-lock timeout silently ignores SetForegroundWindow
// (what set_focus() calls under the hood) from a thread that isn't the
// current foreground app, which a global-shortcut callback never is.
// Toggling always-on-top is the standard workaround: Windows treats that
// as a legitimate reason to actually raise the window instead of just
// requesting focus, unlike a bare SetForegroundWindow call.
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
// both are real, deliberate quits (as opposed to closing the window to the
// tray, which never reaches either path), so both need the same NyxDB
// teardown. Safe to call twice in a row (e.g. Quit calls this then
// app.exit(), which may itself later fire ExitRequested) -- the Job/Child
// state is just gone the second time, and the `let _ =` swallows the
// resulting no-op error.
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

// Dev-only convenience for testing "what does a real first-run user see"
// without hand-killing processes and deleting folders each time (owner
// request, 2026-07-14 -- came up testing the Android pairing flow, where
// a freshly-reinstalled phone immediately synced down this PC's existing
// dev/test tasks instead of showing a genuinely empty first run). Gated
// on both sides -- the Rust command refuses outside a debug build, and
// the frontend only renders the button when the desktop app itself is a
// debug build -- so this can never end up reachable in a real release
// the same way `cfg!(debug_assertions)` already gates the log plugin
// above. Uses the Job Object (win32job) rather than killing the tracked
// Child directly, for the same reason the crash-cleanup fix does (see
// the exit handler below) -- consistent, reliable process teardown.
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
        // This became load-bearing the moment the window started closing to
        // the tray (2026-07-31): the app can now be running with no visible
        // window, so clicking the taskbar/Start shortcut again is the
        // *natural* thing to do -- and every one of those launches used to
        // start a whole second instance. Both instances read the same
        // sync-host.json, so both spawned NyxDB against the same port and
        // the same data directory, gave themselves a tray icon, advertised
        // the same uuid over mDNS, and replicated against each other. Worse,
        // terminate_nyxdb() can only kill the Job it owns, so quitting one
        // left the other's sidecar running and holding the data dir.
        // Autostart-on-login plus one manual click is the same collision
        // with nobody watching.
        //
        // Now a second launch just surfaces the window that already exists
        // and exits, which is also what the user actually wanted.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            bring_to_front(app);
        }))
        // Owner-reported, 2026-07-16: the desktop app fell through to the
        // plain Web Notification API (same code path as a browser) for
        // reminders -- Tauri's embedded WebView2 has no default handler
        // for the browser permission-prompt flow, so requestPermission()
        // silently resolved to "denied" with no real OS prompt ever
        // shown, unlike Android's already-native @capacitor/local-
        // notifications path. This plugin gives desktop the same real
        // native-OS notification mechanism (Windows toast notifications)
        // instead of fighting WebView2's broken permission model.
        .plugin(tauri_plugin_notification::init())
        // Owner-reported, 2026-07-16: Backup/Export used the same blob-URL
        // + <a download> trick that A34 already found broken in Android's
        // WebView (no download manager to hand off to) -- Tauri's WebView2
        // has the identical gap, just never extended to cover it. These
        // two give the frontend a real native "Save As" dialog + file
        // write, same fix category as A34's Filesystem+Share plugins.
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // E3 (done 2026-07-23): tauri.conf.json's `plugins.updater` block
        // points at a real signed endpoint (GitHub Releases' "latest"
        // download URL) with a real pubkey from `cargo tauri signer
        // generate` -- check()/download()/install() below hit real
        // infrastructure. The actual check/download/install state
        // machine + background-check/banner/modal UI lives in
        // offlog-app's updateChecker.ts + UpdateModal.svelte.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Roadmap "desktop tray-resident + global quick-capture shortcut" --
        // the handler here only needs to show the window and emit an event;
        // the actual navigation lives entirely in the frontend already
        // (App.svelte), same split as send_task_notification's
        // 'notification-action' event above. Owner feedback, 2026-07-31:
        // the shortcut should land on Dashboard, not open Quick Add directly
        // -- Quick Add already has its own in-app shortcut (Ctrl+N), and
        // this one's job is just "get me back into Offlog fast". Quick Add
        // is still reachable from the tray menu's own "Quick Add" item
        // (below), which reuses the 'quick-capture' event name.
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                bring_to_front(app);
                let _ = app.emit("show-dashboard", ());
            }
        }).build())
        // Start-on-login toggle in the tray menu below.
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            // Enabled in every build, not just debug -- the first NyxDB
            // trial gated this behind `cfg!(debug_assertions)`, which meant
            // a real installed release build never wrote a single log
            // line. That's the single thing that most slowed down
            // diagnosing real bugs during that trial (a stale debug-build
            // log file kept getting mistaken for fresh evidence). Info
            // level, same as before; tauri-plugin-log's own rotation
            // handles file growth.
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            let app_data_dir = app.path().app_data_dir()?;
            // Owner-reported, 2026-07-20: `app_data_dir()` only depends on
            // the app identifier (com.offlog.app), not debug_assertions --
            // so `cargo tauri dev` and a real installed build used to read
            // and write the exact same sync-host.json (port/credentials),
            // even though they normally run against different NyxDB
            // data. A phone paired against one build's identity would
            // silently start talking to the other build's (different)
            // database on next launch. Debug builds get their own config
            // file so the two identities can never collide.
            let config_filename = if cfg!(debug_assertions) { "sync-host.dev.json" } else { "sync-host.json" };
            let config_path = app_data_dir.join(config_filename);
            let info = sync_host::load_or_create_info(&config_path);

            let resource_dir = app.path().resource_dir().ok();
            let nyxdb_binary = sync_host::nyxdb_binary_path(resource_dir);
            log::info!("sync_host: using NyxDB binary {}", nyxdb_binary.display());
            // Same debug/release split as config_filename above, and for the
            // same reason -- a dev run's database must never share a
            // directory with a real installed build's.
            let data_dirname = if cfg!(debug_assertions) { "nyxdb-data-dev" } else { "nyxdb-data" };
            let data_dir = app_data_dir.join(data_dirname);
            app.manage(NyxdbDataDir(data_dir.clone()));
            app.manage(DetectedOtherHosts(Mutex::new(Vec::new())));

            // info is managed immediately (below) so get_sync_info answers
            // right away with the sidecar's port -- config.ts's
            // initTauriSyncDefaults() only needs that to point PouchDB at
            // the right URL, and its `retry: true` live sync already
            // tolerates the target not answering yet, same as any other
            // "Cannot reach sync server" moment. Everything below that
            // actually needs NyxDB running (spawning it, waiting for its
            // port to answer, creating the database, starting the pairing
            // server, mDNS advertising) used to block .setup() itself --
            // Tauri doesn't paint the window until setup() returns, so the
            // whole boot showed as a blank window on every launch
            // (owner-reported, first real-install dogfooding session,
            // 2026-07-15). Moved to a background task so the window shows
            // immediately and sync catches up a moment later, the same way
            // it already does after any transient "can't reach sync
            // server" moment.
            let app_handle = app.handle().clone();
            let nyxdb_binary_bg = nyxdb_binary.clone();
            let data_dir_bg = data_dir.clone();
            let info_bg = info.clone();
            tauri::async_runtime::spawn(async move {
                match sync_host::spawn_nyxdb(&nyxdb_binary_bg, &data_dir_bg, &info_bg) {
                    Ok((child, job)) => {
                        // The Job must stay alive for the app's lifetime — its
                        // Drop impl closes the job handle, and closing it is
                        // exactly what triggers JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE.
                        // tauri's managed state lives until the app process
                        // itself ends, so dropping early only happens on the
                        // crash/force-kill path this is meant to catch anyway.
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
                // sync_host::wait_ready already uses inside this same kind
                // of background task, and pulling in tokio directly as a
                // dependency just for one sleep isn't worth it.
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
            // Reflects the real OS autostart-registration state at menu-build
            // time (not just an in-memory flag) -- checked() below toggles
            // this same CheckMenuItem's visual state after each click via
            // its own set_checked(), kept alive in the on_menu_event closure
            // via .clone() (cheap, same Rc-backed handle pattern every other
            // menu item here already is).
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
                // Left click toggles show/hide (owner feedback, 2026-07-31)
                // rather than always-show -- lets the tray icon double as a
                // quick way to tuck the window away again without reaching
                // for the titlebar X.
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

            // Global "back to Offlog" shortcut -- works from anywhere, no
            // need to have Offlog focused (ROADMAP.md). Lands on Dashboard,
            // not Quick Add (owner feedback, 2026-07-31) -- Quick Add has
            // its own in-app shortcut (Ctrl+N) already. Registered once at
            // startup; the handler itself lives in the plugin() call above.
            //
            // Deliberately NOT `?` -- Ctrl+Alt+O is a plausible collision
            // with another already-running app's own global hotkey, and
            // Windows simply refuses the second registration. Propagating
            // that error out of setup() would fail .build() and panic the
            // whole app on startup over a convenience shortcut: the tray,
            // the window, and sync would all be gone because something
            // else happened to own one key combo. Log and carry on instead
            // -- everything else still works, only the hotkey is missing.
            if let Err(e) = app.global_shortcut().register("Ctrl+Alt+O") {
                log::warn!("global shortcut Ctrl+Alt+O unavailable (already bound by another app?): {e}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_sync_info, is_debug_build, generate_pairing_code, reset_sync_data, show_main_window, send_task_notification, get_detected_other_hosts, store_sync_secret, get_sync_secret])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // A *graceful* exit (closing the window normally, not a
                // crash/force-kill) still needs the Job-based termination
                // (same call reset_sync_data uses) rather than relying on
                // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE triggering from the
                // Job simply going out of scope, which isn't reliably
                // timely on this path.
                terminate_nyxdb(app_handle);
            }
        });
}
