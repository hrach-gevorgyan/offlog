// Pairing handshake — getting real credentials onto a phone safely, without
// ever putting them on the wire in the clear over mDNS (discovery.rs
// carries only the sync server's uuid — never credentials).
//
// Threat model: a same-Wi-Fi handshake between two devices one person
// owns. A short-lived, single-use, human-read code is the intended level
// of security here, not TLS/PKI.

use crate::sync_host::SyncHostInfo;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tiny_http::{Response, Server};

const CODE_TTL: Duration = Duration::from_secs(5 * 60);
// Failed guesses are capped per generated code. Without a cap, a LAN
// attacker could submit unlimited sequential guesses against the 6-digit
// (1M-value) space inside the TTL window. This bounds any brute-force
// attempt to a handful of tries however fast the requests arrive, with
// no rate-limiting machinery needed.
const MAX_ATTEMPTS: u32 = 8;

struct PendingCode {
    code: String,
    expires_at: Instant,
    attempts: u32,
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
        *pending = Some(PendingCode { code: code.clone(), expires_at: Instant::now() + CODE_TTL, attempts: 0 });
        code
    }

    fn try_consume(&self, submitted: &str) -> bool {
        let mut pending = self.pending.lock().unwrap();
        let Some(p) = pending.as_mut() else { return false };
        if p.expires_at <= Instant::now() {
            *pending = None;
            return false;
        }
        if p.code == submitted {
            *pending = None; // single-use
            return true;
        }
        p.attempts += 1;
        if p.attempts >= MAX_ATTEMPTS {
            *pending = None; // brute-force lockout -- a fresh code must be generated
        }
        false
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

    // Every response must carry Access-Control-Allow-Origin, including the
    // error ones. A WebView's fetch() silently rejects a cross-origin
    // response with no CORS header, surfacing as a bare "Failed to fetch"
    // indistinguishable from the host being unreachable; curl doesn't
    // enforce CORS, so manual testing won't catch a missing header.
    //
    // `*` is deliberate and safe here: no credentials or cookies are
    // involved, and the secret protecting this endpoint is the pairing
    // code itself, not origin-based access control. OPTIONS is answered
    // defensively in case a WebView/fetch combination sends a preflight.
    fn cors_header() -> tiny_http::Header {
        tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap()
    }

    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            if request.method() == &tiny_http::Method::Options {
                let response = Response::empty(204)
                    .with_header(cors_header())
                    .with_header(tiny_http::Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"POST"[..]).unwrap())
                    .with_header(tiny_http::Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap());
                let _ = request.respond(response);
                continue;
            }
            if request.method() != &tiny_http::Method::Post || request.url() != "/pair" {
                let _ = request.respond(Response::empty(404).with_header(cors_header()));
                continue;
            }
            let mut body = String::new();
            if std::io::Read::read_to_string(request.as_reader(), &mut body).is_err() {
                let _ = request.respond(Response::empty(400).with_header(cors_header()));
                continue;
            }
            let submitted = body.trim();
            if !state.try_consume(submitted) {
                let _ = request.respond(Response::empty(403).with_header(cors_header()));
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
                .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
                .with_header(cors_header());
            let _ = request.respond(response);
        }
    });

    Ok(port)
}
