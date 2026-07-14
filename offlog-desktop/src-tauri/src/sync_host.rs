// Embedded sync host — Track E (ROADMAP.md E1). Manages a bundled CouchDB
// instance as a child process so a non-technical user never installs or
// configures CouchDB themselves: this module generates its own random
// port/credentials on first launch, persists them, and starts/stops the
// process alongside the app's own lifecycle.
//
// Dev-mode prototype note: `couchdb_dir()` resolves via CARGO_MANIFEST_DIR,
// which only works for `cargo run`/`cargo tauri dev` builds run from this
// source tree. A real installer needs to bundle the CouchDB binaries as a
// Tauri resource (`tauri.conf.json`'s `bundle.resources`) and resolve via
// `app.path().resource_dir()` instead — deferred along with the rest of
// installer packaging, per the current scoping pass.

use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

#[derive(Serialize, Deserialize, Clone)]
pub struct SyncHostInfo {
    pub port: u16,
    pub user: String,
    pub password: String,
    pub node_name: String,
    pub cookie: String,
}

impl SyncHostInfo {
    /// Not called yet -- for the frontend's config.ts integration, still
    /// pending (ROADMAP.md E1's "explicitly not done" list).
    #[allow(dead_code)]
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/offlog", self.port)
    }
}

fn random_string(len: usize) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::rng();
    (0..len)
        .map(|_| CHARS[rng.random_range(0..CHARS.len())] as char)
        .collect()
}

fn pick_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(25984)
}

/// Every generated value here is created exactly once per install and
/// reused on every subsequent launch — regenerating the admin password on
/// every start would fight CouchDB's own first-run password hashing in
/// local.ini, and regenerating the port would break anything (e.g. a
/// paired phone) that already has last run's URL saved.
pub fn load_or_create_info(config_path: &Path) -> SyncHostInfo {
    if let Ok(bytes) = fs::read(config_path) {
        if let Ok(info) = serde_json::from_slice::<SyncHostInfo>(&bytes) {
            return info;
        }
    }
    let info = SyncHostInfo {
        port: pick_free_port(),
        user: "offlog".to_string(),
        password: random_string(24),
        node_name: format!("offlog{}", random_string(8).to_lowercase()),
        cookie: random_string(24),
    };
    if let Some(parent) = config_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(config_path, serde_json::to_vec_pretty(&info).unwrap());
    info
}

/// Rewrites the bundled CouchDB's local.ini/vm.args to this install's
/// generated port/credentials/node identity. `bind_address = 0.0.0.0` is
/// intentional (not a mistake mirroring A35's loopback fix) — this is the
/// LAN-facing sync host other devices connect to, unlike the desktop-web
/// loopback default. The node name + cookie are randomized per install so
/// this instance's Erlang distribution never collides with a user's own
/// separately-installed CouchDB (see the couchdb@127.0.0.1 collision hit
/// during prototyping this).
pub fn write_couchdb_config(couchdb_dir: &Path, info: &SyncHostInfo) {
    // `data`/`var` are runtime state, deliberately excluded from both the
    // fetch script's copy and the bundled resource (nothing to ship) --
    // create them on whichever first run finds them missing, dev or
    // packaged, instead of relying on a manual mkdir like early
    // prototyping did.
    let _ = fs::create_dir_all(couchdb_dir.join("data"));
    let _ = fs::create_dir_all(couchdb_dir.join("var").join("log"));
    let _ = fs::create_dir_all(couchdb_dir.join("var").join("run"));

    let local_ini = format!(
        r#"[chttpd]
port = {port}
bind_address = 0.0.0.0

[cors]
origins = *
credentials = true
methods = GET, PUT, POST, HEAD, DELETE
headers = accept, authorization, content-type, origin, referer

[httpd]
enable_cors = true
"#,
        port = info.port,
    );
    let _ = fs::write(couchdb_dir.join("etc").join("local.ini"), local_ini);

    // CouchDB's own admin-password hashing rewrites [admins] into
    // etc/local.d/10-admins.ini (loaded after local.ini, so it wins) rather
    // than back into local.ini itself — discovered live when a stale hash
    // left over in this file from an earlier prototype run silently beat a
    // freshly-regenerated local.ini password, a 401 that took a manual
    // auth test to catch. Writing the admin section directly here, and
    // nowhere else, keeps this file the single source of truth for it.
    let admins_ini = format!("[admins]\n{user} = {password}\n", user = info.user, password = info.password);
    let _ = fs::write(couchdb_dir.join("etc").join("local.d").join("10-admins.ini"), admins_ini);

    // vendor/couchdb-win is populated by administrative MSI extraction
    // (msiexec /a), which unpacks raw files but skips the installer's
    // custom actions -- one of which normally copies vm.args.dist to
    // vm.args on a real install. Do that ourselves the first time so a
    // freshly-fetched vendor copy isn't missing the file erl.exe requires.
    let vm_args_path = couchdb_dir.join("etc").join("vm.args");
    if !vm_args_path.exists() {
        let dist_path = couchdb_dir.join("etc").join("vm.args.dist");
        let _ = fs::copy(&dist_path, &vm_args_path);
    }
    if let Ok(existing) = fs::read_to_string(&vm_args_path) {
        let mut out = String::new();
        for line in existing.lines() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("-name ") {
                out.push_str(&format!("-name {}@127.0.0.1\n", info.node_name));
            } else if trimmed.starts_with("-setcookie ") {
                out.push_str(&format!("-setcookie {}\n", info.cookie));
            } else {
                out.push_str(line);
                out.push('\n');
            }
        }
        let _ = fs::write(&vm_args_path, out);
    }
}

/// `cargo build`/`cargo run` (no bundling step) has no resource dir to
/// resolve, so this falls back to the same `vendor/couchdb-win` path the
/// fetch script populates, resolved via CARGO_MANIFEST_DIR. A packaged
/// build (`cargo tauri build`/`cargo tauri dev`) bundles that same
/// directory as a Tauri resource (`tauri.conf.json`'s `bundle.resources`)
/// under `couchdb/`, resolved here via `resource_dir()` instead.
///
/// Both paths are written to directly (config rewritten, `data`/`var`
/// grown) rather than copied to a separate writable location first --
/// this only works because the NSIS installer's default `installMode` is
/// per-user (installs under a location the user's own account already
/// owns, no elevation). If that ever changes to a per-machine install,
/// this needs to split into a read-only resource dir (binaries only) and
/// a writable copy of etc/data/var under `app_data_dir()` instead -- not
/// needed yet, but don't assume the resource dir is always writable if
/// that assumption changes.
pub fn couchdb_dir(resource_dir: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = resource_dir {
        let candidate = dir.join("couchdb");
        if candidate.join("bin").join("couchdb.cmd").exists() {
            return candidate;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("vendor")
        .join("couchdb-win")
}

/// Prototyping this sidecar found a real gap: `couchdb.cmd` is a launcher
/// that execs `erl.exe` as its own child, so the process this returns
/// isn't the one actually holding the CouchDB port. Killing *this* handle
/// alone (e.g. from an app-exit event handler) does nothing to `erl.exe` —
/// confirmed live, twice, as orphaned `erl.exe`/`epmd.exe` processes still
/// bound to their old ports after the app was closed or force-killed.
/// A Windows Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` fixes
/// this at the OS level instead of relying on our own cleanup code
/// running at all: assigning `couchdb.cmd` to the job auto-assigns every
/// process it spawns (cmd.exe -> erl.exe) to the same job too, unless a
/// child explicitly opts out — and the OS kills the entire job the moment
/// this app's own process handle closes, for *any* reason (normal exit,
/// crash, or an external force-kill), with zero app-side cleanup code
/// needed on that path.
#[cfg(windows)]
pub fn spawn(couchdb_dir: &Path) -> std::io::Result<(Child, win32job::Job)> {
    use std::os::windows::io::AsRawHandle;
    use win32job::{ExtendedLimitInfo, Job};

    let child = Command::new(couchdb_dir.join("bin").join("couchdb.cmd"))
        .current_dir(couchdb_dir)
        .spawn()?;

    let mut info = ExtendedLimitInfo::new();
    info.limit_kill_on_job_close();
    let job = Job::create_with_limit_info(&mut info)
        .map_err(|e| std::io::Error::other(format!("failed to create job object: {e}")))?;
    job.assign_process(child.as_raw_handle() as _)
        .map_err(|e| std::io::Error::other(format!("failed to assign process to job: {e}")))?;

    Ok((child, job))
}

/// Polls the port instead of the HTTP welcome response — cheaper, and
/// sufficient: CouchDB doesn't open the listening socket until chttpd has
/// actually started, so a successful TCP connect is already a good signal.
pub fn wait_ready(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

/// Creates the `offlog` database the app's PouchDB sync target expects —
/// idempotent (a 412 "already exists" is treated the same as 201 created).
pub fn ensure_database(info: &SyncHostInfo) {
    let url = format!("http://127.0.0.1:{}/offlog", info.port);
    let result = ureq::put(&url)
        .header(
            "Authorization",
            &format!(
                "Basic {}",
                base64_encode(&format!("{}:{}", info.user, info.password))
            ),
        )
        .send_empty();
    match result {
        Ok(_) => log::info!("sync_host: offlog database ready"),
        Err(ureq::Error::StatusCode(412)) => log::info!("sync_host: offlog database already exists"),
        Err(e) => log::warn!("sync_host: failed to create offlog database: {e}"),
    }
}

/// CouchDB's `GET /` welcome response includes a permanent per-server
/// `uuid` — reused as this install's stable identity for mDNS advertising
/// instead of inventing a separate identity scheme.
pub fn fetch_uuid(port: u16) -> Option<String> {
    let url = format!("http://127.0.0.1:{port}/");
    let mut resp = ureq::get(&url).call().ok()?;
    let text = resp.body_mut().read_to_string().ok()?;
    let body: serde_json::Value = serde_json::from_str(&text).ok()?;
    body.get("uuid")?.as_str().map(|s| s.to_string())
}

fn base64_encode(input: &str) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = input.as_bytes();
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[((n >> 6) & 0x3F) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(n & 0x3F) as usize] as char } else { '=' });
    }
    out
}
