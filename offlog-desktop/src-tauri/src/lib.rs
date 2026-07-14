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

#[tauri::command]
fn generate_pairing_code(state: tauri::State<Arc<pairing::PairingState>>) -> String {
    state.generate_code()
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
            let config_path = app_data_dir.join("sync-host.json");
            let info = sync_host::load_or_create_info(&config_path);

            let resource_dir = app.path().resource_dir().ok();
            let couchdb_dir = sync_host::couchdb_dir(resource_dir);
            log::info!("sync_host: using CouchDB dir {}", couchdb_dir.display());
            sync_host::write_couchdb_config(&couchdb_dir, &info);

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
        .invoke_handler(tauri::generate_handler![get_sync_info, generate_pairing_code])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
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
