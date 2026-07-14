// Pairing handshake — getting real credentials onto a phone safely, without
// ever putting them on the wire in the clear over mDNS (discovery.rs
// carries only the CouchDB uuid). Threat model: this is a same-Wi-Fi
// handshake between two devices one person owns (GOAL.md: "private, not
// public, secure enough on its own" — same posture DECISIONS.md already
// applied when declining mesh sync's much larger security investment for
// a single-user project). A short-lived, single-use, human-read code is
// the right amount of security here, not TLS/PKI.

use crate::sync_host::SyncHostInfo;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tiny_http::{Response, Server};

const CODE_TTL: Duration = Duration::from_secs(5 * 60);

struct PendingCode {
    code: String,
    expires_at: Instant,
}

pub struct PairingState {
    pending: Mutex<Option<PendingCode>>,
    info: SyncHostInfo,
}

impl PairingState {
    pub fn new(info: SyncHostInfo) -> Self {
        Self { pending: Mutex::new(None), info }
    }

    /// Generates a new 6-digit code, replacing (invalidating) any
    /// previous one. Single-use: consumed by the first successful
    /// /pair request, same as an expired one, so a stale code left
    /// showing on screen can't be reused after someone's already
    /// paired with it.
    pub fn generate_code(&self) -> String {
        let code = format!("{:06}", rand::random::<u32>() % 1_000_000);
        let mut pending = self.pending.lock().unwrap();
        *pending = Some(PendingCode { code: code.clone(), expires_at: Instant::now() + CODE_TTL });
        code
    }

    fn try_consume(&self, submitted: &str) -> bool {
        let mut pending = self.pending.lock().unwrap();
        match pending.as_ref() {
            Some(p) if p.expires_at > Instant::now() && p.code == submitted => {
                *pending = None; // single-use
                true
            }
            _ => false,
        }
    }
}

#[derive(Serialize)]
struct PairResponse<'a> {
    port: u16,
    user: &'a str,
    password: &'a str,
    uuid: &'a str,
}

/// Runs the one-endpoint pairing HTTP server on its own thread for the
/// app's lifetime. `POST /pair` with a plain-text 6-digit body is the
/// only route -- anything else, or a wrong/expired/already-used code,
/// gets a bare 403 with no distinguishing detail (don't leak whether a
/// code was "close" or "expired" vs. "never existed").
pub fn spawn_server(state: Arc<PairingState>, uuid: String) -> std::io::Result<u16> {
    let server = Server::http("0.0.0.0:0")
        .map_err(|e| std::io::Error::other(format!("failed to bind pairing server: {e}")))?;
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);

    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            if request.method() != &tiny_http::Method::Post || request.url() != "/pair" {
                let _ = request.respond(Response::empty(404));
                continue;
            }
            let mut body = String::new();
            if std::io::Read::read_to_string(request.as_reader(), &mut body).is_err() {
                let _ = request.respond(Response::empty(400));
                continue;
            }
            let submitted = body.trim();
            if !state.try_consume(submitted) {
                let _ = request.respond(Response::empty(403));
                continue;
            }
            let payload = PairResponse {
                port: state.info.port,
                user: &state.info.user,
                password: &state.info.password,
                uuid: &uuid,
            };
            let json = serde_json::to_string(&payload).unwrap_or_default();
            let response = Response::from_string(json)
                .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
            let _ = request.respond(response);
        }
    });

    Ok(port)
}
