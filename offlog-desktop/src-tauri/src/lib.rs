mod discovery;
mod pairing;
mod sync_host;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};

struct CouchdbProcess(Mutex<Option<std::process::Child>>);

fn device_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Offlog PC".to_string())
}

#[tauri::command]
fn get_sync_info(info: tauri::State<sync_host::SyncHostInfo>) -> sync_host::SyncHostInfo {
    info.inner().clone()
}

// S1 (docs/IDEAS.md, 2026-07-20): surfaces whatever discovery::browse_for_others()
// found at startup so the frontend can warn about a second host on the
// LAN. Managed empty before the background scan runs, so this command
// never errors -- it just answers "nothing detected yet" if called
// before the scan (which takes a few seconds after CouchDB itself boots)
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

#[tauri::command]
fn generate_pairing_code(state: tauri::State<Arc<pairing::PairingState>>) -> String {
    state.generate_code()
}

struct CouchdbDataDir(std::path::PathBuf);

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
// Child directly, for the same reason the crash-cleanup fix does: only
// the Job reliably takes down couchdb.cmd's actual erl.exe grandchild.
#[cfg(windows)]
unsafe extern "system" {
    fn TerminateJobObject(hjob: isize, uexitcode: u32) -> i32;
}

#[tauri::command]
fn reset_sync_data(app: tauri::AppHandle, job: tauri::State<win32job::Job>, data_dir: tauri::State<CouchdbDataDir>) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("reset_sync_data is only available in debug builds".to_string());
    }
    // win32job::Job has no terminate() of its own -- TerminateJobObject is
    // the raw Win32 call, taking the same job handle already used to
    // register the CouchDB process tree (sync_host::spawn()). Kills the
    // whole tree (couchdb.cmd + its erl.exe grandchild) the same reliable
    // way the crash-cleanup fix does, just triggered on demand instead of
    // on process exit.
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
        // Scaffolding only, added ahead of C1 (open-sourcing the repo)
        // at the owner's explicit request -- tauri.conf.json's
        // `plugins.updater` endpoint is a placeholder that will 404 until
        // real hosting exists (GitHub Releases, once public), and its
        // pubkey needs the owner's own signing keypair (generate with
        // `cargo tauri signer generate`, run by the owner directly since
        // it protects the private key with a password -- not something
        // this assistant should be choosing/holding). Checking for an
        // update against the placeholder endpoint fails gracefully (the
        // frontend's "Check for updates" button just shows an error, same
        // as any other unreachable-network case) -- harmless until C1.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app.path().app_data_dir()?;
            // Owner-reported, 2026-07-20: `app_data_dir()` only depends on
            // the app identifier (com.offlog.app), not debug_assertions --
            // so `cargo tauri dev` and a real installed build used to read
            // and write the exact same sync-host.json (port/credentials),
            // even though they normally run against different CouchDB
            // data (see couchdb_dir()'s own comment). A phone paired
            // against one build's identity would silently start talking
            // to the other build's (different) database on next launch.
            // Debug builds get their own config file so the two identities
            // can never collide.
            let config_filename = if cfg!(debug_assertions) { "sync-host.dev.json" } else { "sync-host.json" };
            let config_path = app_data_dir.join(config_filename);
            let info = sync_host::load_or_create_info(&config_path);

            let resource_dir = app.path().resource_dir().ok();
            let couchdb_dir = sync_host::couchdb_dir(resource_dir);
            log::info!("sync_host: using CouchDB dir {}", couchdb_dir.display());
            // Same debug/release split as config_filename above, and for the
            // same reason -- a dev run's database must never share a
            // directory with a real installed build's.
            let data_dirname = if cfg!(debug_assertions) { "couchdb-data-dev" } else { "couchdb-data" };
            let data_dir = app_data_dir.join(data_dirname);
            app.manage(CouchdbDataDir(data_dir.clone()));
            sync_host::write_couchdb_config(&couchdb_dir, &data_dir, &info);
            app.manage(DetectedOtherHosts(Mutex::new(Vec::new())));

            // info is managed immediately (below) so get_sync_info answers
            // right away with the sidecar's port -- config.ts's
            // initTauriSyncDefaults() only needs that to point PouchDB at
            // the right URL, and its `retry: true` live sync already
            // tolerates the target not answering yet, same as any other
            // "Cannot reach sync server" moment. Everything below that
            // actually needs CouchDB running (spawning it, waiting for its
            // port to answer, creating the database, starting the pairing
            // server, mDNS advertising) used to block .setup() itself --
            // Tauri doesn't paint the window until setup() returns, so the
            // whole ~3-8s CouchDB/Erlang boot showed as a blank window on
            // every launch (owner-reported, first real-install dogfooding
            // session, 2026-07-15). Moved to a background task so the
            // window shows immediately and sync catches up a few seconds
            // later, the same way it already does after any transient
            // "can't reach sync server" moment.
            let app_handle = app.handle().clone();
            let couchdb_dir_bg = couchdb_dir.clone();
            let info_bg = info.clone();
            tauri::async_runtime::spawn(async move {
                match sync_host::spawn(&couchdb_dir_bg) {
                    Ok((child, job)) => {
                        // The Job must stay alive for the app's lifetime — its
                        // Drop impl closes the job handle, and closing it is
                        // exactly what triggers JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE.
                        // tauri's managed state lives until the app process
                        // itself ends, so dropping early only happens on the
                        // crash/force-kill path this is meant to catch anyway.
                        app_handle.manage(job);
                        app_handle.manage(CouchdbProcess(Mutex::new(Some(child))));
                        let ready = sync_host::wait_ready(info_bg.port, Duration::from_secs(20));
                        log::info!("sync_host: CouchDB ready = {ready} on port {}", info_bg.port);
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
                                log::warn!("discovery: couldn't fetch CouchDB uuid, skipping mDNS advertise");
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("sync_host: failed to spawn CouchDB sidecar: {e}");
                        app_handle.manage(CouchdbProcess(Mutex::new(None)));
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_sync_info, is_debug_build, generate_pairing_code, reset_sync_data, show_main_window, send_task_notification, get_detected_other_hosts])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Real gap found live: a *graceful* exit (closing the
                // window normally, not a crash/force-kill) went through
                // this handler and only killed the tracked Child directly
                // -- which is couchdb.cmd's cmd.exe wrapper, not the
                // erl.exe grandchild actually holding CouchDB's port, so
                // erl.exe/epmd.exe were still left running after a normal
                // app close. The Job-based termination (same call
                // reset_sync_data uses) is the one path proven to
                // reliably take down the whole tree -- use it here too
                // instead of relying on JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                // triggering from the Job simply going out of scope,
                // which this same graceful-exit case already showed
                // doesn't reliably happen in time.
                if let Some(job) = app_handle.try_state::<win32job::Job>() {
                    let _ = unsafe { TerminateJobObject(job.handle(), 0) };
                }
                if let Some(state) = app_handle.try_state::<CouchdbProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
