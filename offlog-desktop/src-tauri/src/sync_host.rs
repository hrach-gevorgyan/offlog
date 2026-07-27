// Embedded sync host — Track E (ROADMAP.md E1). Manages a bundled NyxDB
// instance (github.com/hrach-gevorgyan/nyxdb, a from-scratch Rust
// reimplementation of CouchDB's replication protocol) as a child process
// so a non-technical user never installs or configures a sync server
// themselves: this module generates its own random port/credentials on
// first launch, persists them, and starts/stops the process alongside
// the app's own lifecycle.
//
// NyxDB replaced a real bundled CouchDB here (2026-07-27, after a
// same-day trial on the now-deleted `nyxdb-sync-backend` branch proved
// the protocol/size win real — see docs/DECISIONS.md's writeup). Unlike
// CouchDB, NyxDB needs no config file at all: port/data-dir/credentials/
// CORS origins are plain env vars, and it's a single process (no
// batch-launcher/grandchild problem to work around).
//
// `nyxdb_binary_path()` resolves via `app.path().resource_dir()` for a
// real installed build (bundled as a Tauri resource, `tauri.conf.json`'s
// `bundle.resources`); `cargo tauri dev` gets its own isolated working
// copy instead of ever running NyxDB live out of the shared
// `vendor/nyxdb-win` source dir — see that function's own comment.

use rand::RngExt;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Serialize, Deserialize, Clone)]
pub struct SyncHostInfo {
    pub port: u16,
    pub user: String,
    pub password: String,
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
/// reused on every subsequent launch — regenerating the port/password
/// on every start would break anything (e.g. a paired phone) that
/// already has last run's URL/credentials saved.
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
    };
    if let Some(parent) = config_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(config_path, serde_json::to_vec_pretty(&info).unwrap());
    info
}

/// `cargo build`/`cargo run` (no bundling step) has no resource dir to
/// resolve, so this falls back to the same `vendor/nyxdb-win` path the
/// fetch script populates, resolved via CARGO_MANIFEST_DIR. A packaged
/// build (`cargo tauri build`/`cargo tauri dev`) bundles that same
/// directory as a Tauri resource (`tauri.conf.json`'s `bundle.resources`)
/// under `nyxdb/`, resolved here via `resource_dir()` instead.
///
/// Both paths are read directly rather than copied to a separate
/// writable location first — this only works because the NSIS
/// installer's default `installMode` is per-user (installs under a
/// location the user's own account already owns, no elevation). If that
/// ever changes to a per-machine install, this needs to split into a
/// read-only resource dir (the binary) and a writable data dir under
/// `app_data_dir()` instead — already the case here, since NyxDB's own
/// data lives under `app_data_dir()`, never next to the binary.
pub fn nyxdb_binary_path(resource_dir: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = resource_dir {
        let candidate = dir.join("nyxdb").join("nyxdb.exe");
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("vendor")
        .join("nyxdb-win")
        .join("nyxdb.exe")
}

/// Same hardening a bundled sidecar binary always needs regardless of
/// which server it is: `CREATE_NO_WINDOW` (a spawned exe otherwise flashes
/// a console on launch) and a Windows Job Object with
/// `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` so the OS guarantees this process
/// dies the instant this app's own process handle closes, for any reason
/// (normal exit, crash, or an external force-kill) — no app-side cleanup
/// code required on that path. NyxDB is a single process (unlike
/// CouchDB's `couchdb.cmd` → `erl.exe` grandchild), so there's no
/// nested-child console-flash workaround needed here.
#[cfg(windows)]
pub fn spawn_nyxdb(binary_path: &Path, data_dir: &Path, info: &SyncHostInfo) -> std::io::Result<(Child, win32job::Job)> {
    use std::os::windows::io::AsRawHandle;
    use std::os::windows::process::CommandExt;
    use win32job::{ExtendedLimitInfo, Job};

    let _ = fs::create_dir_all(data_dir);
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // `.current_dir()` is required, not cosmetic: the first NyxDB trial
    // omitted this and the app-spawned process bound a different port
    // than the one requested via NYXDB_ADDR (a manual `cd vendor/nyxdb-win
    // && ./nyxdb.exe` test with the same env vars worked correctly,
    // isolating the difference to the missing current_dir). Matches the
    // real-CouchDB `spawn()` this replaced, which already set it.
    let working_dir = binary_path.parent().unwrap_or(binary_path);

    let child = Command::new(binary_path)
        .current_dir(working_dir)
        .env("NYXDB_ADDR", format!("0.0.0.0:{}", info.port))
        .env("NYXDB_DATA", data_dir)
        .env("NYXDB_USER", &info.user)
        .env("NYXDB_PASSWORD", &info.password)
        // Real bug found in the first trial: allowlisting only the
        // desktop app's own WebView origin meant every sync request from
        // a *phone* was silently CORS-rejected (pairing, a separate
        // non-browser handshake, still succeeded, masking this until
        // actual sync traffic ran) -- capacitor.config.ts's
        // androidScheme:'https' with the default hostname means the
        // Android app's real origin is https://localhost, not
        // http://tauri.localhost. NyxDB requires an explicit allowlist
        // (no wildcard support, unlike real CouchDB's origins = *), so
        // both known client origins are listed.
        .env("NYXDB_CORS_ORIGINS", "http://tauri.localhost,https://localhost")
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    let mut limits = ExtendedLimitInfo::new();
    limits.limit_kill_on_job_close();
    let job = Job::create_with_limit_info(&mut limits)
        .map_err(|e| std::io::Error::other(format!("failed to create job object: {e}")))?;
    job.assign_process(child.as_raw_handle() as _)
        .map_err(|e| std::io::Error::other(format!("failed to assign process to job: {e}")))?;

    Ok((child, job))
}

/// Polls the port instead of the HTTP welcome response — cheaper, and
/// sufficient: NyxDB doesn't open the listening socket until it's
/// actually ready, so a successful TCP connect is already a good signal.
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
/// Confirmed unchanged against NyxDB in the first trial: it implements
/// the same PUT-to-create-db + 412-on-exists semantics as real CouchDB.
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

/// NyxDB's `GET /` welcome response includes a permanent per-server
/// `uuid` (confirmed compatible with real CouchDB's shape in the first
/// trial: `{"couchdb":"Welcome","uuid":"...","version":"..."}`) — reused
/// as this install's stable identity for mDNS advertising instead of
/// inventing a separate identity scheme.
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
