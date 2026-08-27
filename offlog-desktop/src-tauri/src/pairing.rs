// Pairing handshake — getting real credentials onto a phone safely, without
// ever putting them on the wire in the clear over mDNS (discovery.rs
// carries only the sync server's uuid — never credentials).
//
// Threat model: a same-Wi-Fi handshake between two devices one person
// owns. A short-lived, single-use, human-read code is the intended level
// of security here, not TLS/PKI.
//
// The code itself never crosses the network, and neither does the
// credential response in the clear: both are challenge-response'd through
// PBKDF2 key stretching keyed by the code, so a passive eavesdropper who
// captures the whole exchange still has to brute-force the 6-digit space
// (1M candidates) offline to get anywhere, rather than reading the sync
// password straight off the wire. That brute-force is still *feasible*
// for someone motivated with real compute — six digits is six digits, no
// KDF changes that — this raises the bar from "instant" to "costs an
// attacker real effort," matching the threat model above; it isn't a
// substitute for TLS if the real goal is defeating a resourced attacker.
use crate::sync_host::SyncHostInfo;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tiny_http::{Response, Server};

const CODE_TTL: Duration = Duration::from_secs(5 * 60);
// Failed guesses are capped per generated code. Without a cap, a LAN
// attacker could submit unlimited sequential guesses against the 6-digit
// (1M-value) space inside the TTL window. This bounds any *online* (live
// request-by-request) brute-force attempt to a handful of tries, with no
// rate-limiting machinery needed. It does not bound an *offline* attempt
// against a captured exchange — see the module comment.
const MAX_ATTEMPTS: u32 = 8;

// Deliberately below OWASP's storage-grade 600k -- this runs synchronously
// in the pairing request path (a human is watching a spinner), not a
// background job, so the cost has to stay imperceptible on the legitimate
// path while still meaningfully taxing an offline brute-force attempt
// that has to pay it once per candidate code.
const PBKDF2_ROUNDS: u32 = 210_000;

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

    /// Verifies `proof` against the pending code without ever seeing the
    /// client's copy of the code itself, and returns the still-pending
    /// code on success (needed by the caller to derive the response
    /// encryption key -- kept out of this function so the mutex isn't
    /// held across the AES-GCM work).
    fn try_consume(&self, nonce: &[u8], proof: &[u8]) -> Option<String> {
        let mut pending = self.pending.lock().unwrap();
        let Some(p) = pending.as_mut() else { return None };
        if p.expires_at <= Instant::now() {
            *pending = None;
            return None;
        }
        let expected = derive_key(&p.code, nonce, b"auth");
        // Constant-time compare -- a timing side-channel here would leak
        // how many leading bytes of a guess were right, cheapening the
        // exact brute-force this whole scheme exists to slow down.
        if ct_eq(&expected, proof) {
            let code = p.code.clone();
            *pending = None; // single-use
            return Some(code);
        }
        p.attempts += 1;
        if p.attempts >= MAX_ATTEMPTS {
            *pending = None; // brute-force lockout -- a fresh code must be generated
        }
        None
    }
}

// A tiny constant-time byte-equality check -- avoiding a full `subtle`
// crate dependency for one comparison. A length mismatch (which can't
// happen here -- both sides are fixed 32-byte PBKDF2 outputs) short-
// circuits before the constant-time loop, which is fine: length alone
// isn't secret.
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// PBKDF2-HMAC-SHA256(code, nonce||tag) -- `tag` domain-separates the
/// auth key from the encryption key so a leaked/observed auth proof can't
/// be reused to derive the encryption key, even though both come from the
/// same code+nonce pair.
fn derive_key(code: &str, nonce: &[u8], tag: &[u8]) -> [u8; 32] {
    let mut salt = Vec::with_capacity(nonce.len() + tag.len());
    salt.extend_from_slice(nonce);
    salt.extend_from_slice(tag);
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(code.as_bytes(), &salt, PBKDF2_ROUNDS, &mut key);
    key
}

#[derive(Deserialize)]
struct PairRequest {
    // Both base64-encoded. `nonce` is fresh per attempt (the client
    // generates it), `proof` is PBKDF2(code, nonce||"auth") -- the code
    // itself is never sent.
    nonce: String,
    proof: String,
}

#[derive(Serialize)]
struct PairResponse<'a> {
    port: u16,
    user: &'a str,
    password: &'a str,
    uuid: &'a str,
}

#[derive(Serialize)]
struct PairEnvelope {
    // AES-256-GCM, key = PBKDF2(code, nonce||"enc"). The client already
    // has `code` (typed by the user) and `nonce` (it generated the
    // request), so it can derive the same key without either travelling
    // on the wire.
    iv: String,
    ciphertext: String,
}

fn encrypt_response(code: &str, nonce: &[u8], payload: &PairResponse) -> Option<PairEnvelope> {
    let key_bytes = derive_key(code, nonce, b"enc");
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    // A fresh random IV per response -- reusing the encryption *key*
    // across pair attempts never happens anyway (each code, and so each
    // key, is single-use), but a random IV costs nothing and rules out
    // ever relying on that for GCM's nonce-reuse requirement.
    let mut iv_bytes = [0u8; 12];
    for b in iv_bytes.iter_mut() {
        *b = rand::random::<u8>();
    }
    let json = serde_json::to_vec(payload).ok()?;
    let ciphertext = cipher.encrypt(Nonce::from_slice(&iv_bytes), json.as_ref()).ok()?;
    Some(PairEnvelope { iv: BASE64.encode(iv_bytes), ciphertext: BASE64.encode(ciphertext) })
}

/// Runs the one-endpoint pairing HTTP server on its own thread for the
/// app's lifetime. `POST /pair` with a JSON `{nonce, proof}` body is the
/// only route -- anything else, or a wrong/expired/already-used proof,
/// gets a bare 403 with no distinguishing detail (don't leak whether a
/// proof was "close" or "expired" vs. "never existed").
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
    // code itself (via the proof), not origin-based access control.
    // OPTIONS is answered defensively in case a WebView/fetch combination
    // sends a preflight.
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
            let parsed: Option<PairRequest> = serde_json::from_str(&body).ok();
            let decoded = parsed.and_then(|p| {
                let nonce = BASE64.decode(&p.nonce).ok()?;
                let proof = BASE64.decode(&p.proof).ok()?;
                Some((nonce, proof))
            });
            let Some((nonce, proof)) = decoded else {
                let _ = request.respond(Response::empty(400).with_header(cors_header()));
                continue;
            };
            let Some(code) = state.try_consume(&nonce, &proof) else {
                let _ = request.respond(Response::empty(403).with_header(cors_header()));
                continue;
            };
            let payload = PairResponse {
                port: state.info.port,
                user: &state.info.user,
                password: &state.info.password,
                uuid: &uuid,
            };
            let Some(envelope) = encrypt_response(&code, &nonce, &payload) else {
                let _ = request.respond(Response::empty(500).with_header(cors_header()));
                continue;
            };
            let json = serde_json::to_string(&envelope).unwrap_or_default();
            let response = Response::from_string(json)
                .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
                .with_header(cors_header());
            let _ = request.respond(response);
        }
    });

    Ok(port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_key_is_deterministic_and_domain_separated() {
        let code = "482913";
        let nonce = [1u8; 16];
        assert_eq!(derive_key(code, &nonce, b"auth"), derive_key(code, &nonce, b"auth"));
        // The whole point of the "auth" vs "enc" tag: knowing one must not
        // hand over the other, even from the identical code+nonce.
        assert_ne!(derive_key(code, &nonce, b"auth"), derive_key(code, &nonce, b"enc"));
        // A different nonce (a replayed/observed proof from a previous
        // attempt) must not validate against a fresh one.
        assert_ne!(derive_key(code, &nonce, b"auth"), derive_key(code, &[2u8; 16], b"auth"));
        assert_ne!(derive_key(code, &nonce, b"auth"), derive_key("000000", &nonce, b"auth"));
    }

    #[test]
    fn ct_eq_matches_standard_equality_without_early_exit() {
        assert!(ct_eq(b"identical", b"identical"));
        assert!(!ct_eq(b"different", b"differfnt"));
        assert!(!ct_eq(b"short", b"longer than that"));
    }

    // encrypt_response()'s counterpart isn't exercised here via
    // spawn_server (no HTTP round-trip in a unit test) -- this proves the
    // primitive itself: the key the legitimate client derives (same
    // code+nonce, tag "enc") decrypts what the server encrypted, and a
    // key derived from any other code does not. This is exactly what
    // discovery.ts's deriveBits()+crypto.subtle.decrypt() do on the other
    // side of the wire; cross-language compatibility (this ciphertext
    // format decrypts correctly under WebCrypto's AES-GCM) was verified
    // manually against a Node script using a fixture generated the same
    // way, once, when this was built -- not re-run automatically since
    // there's no JS runtime available here.
    #[test]
    fn encrypt_response_round_trips_under_the_matching_key_only() {
        let code = "482913";
        let nonce = [1u8; 16];
        let payload = PairResponse { port: 25984, user: "offlog", password: "s3cr3t-pw", uuid: "test-uuid" };
        let envelope = encrypt_response(code, &nonce, &payload).unwrap();

        let key_bytes = derive_key(code, &nonce, b"enc");
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
        let iv = BASE64.decode(&envelope.iv).unwrap();
        let ciphertext = BASE64.decode(&envelope.ciphertext).unwrap();
        let plaintext = cipher.decrypt(Nonce::from_slice(&iv), ciphertext.as_ref()).unwrap();
        let decoded: serde_json::Value = serde_json::from_slice(&plaintext).unwrap();
        assert_eq!(decoded["port"], 25984);
        assert_eq!(decoded["user"], "offlog");
        assert_eq!(decoded["password"], "s3cr3t-pw");

        let wrong_key = derive_key("000000", &nonce, b"enc");
        let wrong_cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&wrong_key));
        assert!(wrong_cipher.decrypt(Nonce::from_slice(&iv), ciphertext.as_ref()).is_err());
    }

    #[test]
    fn try_consume_locks_out_after_max_attempts_and_is_single_use() {
        let state = PairingState::new(SyncHostInfo { port: 1, user: "u".into(), password: "p".into() });
        let code = state.generate_code();
        let nonce = [3u8; 16];
        let wrong_proof = derive_key("000000", &nonce, b"auth");

        for _ in 0..MAX_ATTEMPTS {
            assert!(state.try_consume(&nonce, &wrong_proof).is_none());
        }
        // The code is now locked out even though it was never actually
        // guessed correctly.
        let right_proof = derive_key(&code, &nonce, b"auth");
        assert!(state.try_consume(&nonce, &right_proof).is_none());

        // A fresh code is unlocked and works once...
        let code2 = state.generate_code();
        let right_proof2 = derive_key(&code2, &nonce, b"auth");
        assert_eq!(state.try_consume(&nonce, &right_proof2).as_deref(), Some(code2.as_str()));
        // ...and is consumed: the same correct proof doesn't work twice.
        assert!(state.try_consume(&nonce, &right_proof2).is_none());
    }
}
