mod discovery;
mod pairing;
mod sync_host;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

struct CouchdbProcess(Mutex<Option<std::process::Child>>);

fn device_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Offlog PC".to_string())
}

#[tauri::command]
fn get_sync_info(info: tauri::State<sync_host::SyncHostInfo>) -> sync_host::SyncHostInfo {
    info.inner().clone()
}

// Lets the frontend gate dev-only UI (the "Reset test data" button) on
// whether this is actually a debug build -- the frontend has no other
// way to know, since it's the same web bundle either way.
#[tauri::command]
fn is_debug_build() -> bool {
    cfg!(debug_assertions)
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

            match sync_host::spawn(&couchdb_dir) {
                Ok((child, job)) => {
                    // The Job must stay alive for the app's lifetime — its
                    // Drop impl closes the job handle, and closing it is
                    // exactly what triggers JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE.
                    // tauri's managed state lives until the app process
                    // itself ends, so dropping early only happens on the
                    // crash/force-kill path this is meant to catch anyway.
                    app.manage(job);
                    app.manage(CouchdbProcess(Mutex::new(Some(child))));
                    let ready = sync_host::wait_ready(info.port, Duration::from_secs(20));
                    log::info!("sync_host: CouchDB ready = {ready} on port {}", info.port);
                    if ready {
                        sync_host::ensure_database(&info);
                        if let Some(uuid) = sync_host::fetch_uuid(info.port) {
                            let pairing_state = Arc::new(pairing::PairingState::new(info.clone()));
                            match pairing::spawn_server(pairing_state.clone(), uuid.clone()) {
                                Ok(pairing_port) => {
                                    app.manage(pairing_state);
                                    let name = device_name();
                                    if let Some(daemon) = discovery::advertise(info.port, &uuid, &name, pairing_port) {
                                        app.manage(daemon);
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
                    app.manage(CouchdbProcess(Mutex::new(None)));
                }
            }

            app.manage(info);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_sync_info, is_debug_build, generate_pairing_code, reset_sync_data])
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
