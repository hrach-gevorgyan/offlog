// Encrypts the stored sync password at rest via Windows DPAPI
// (CryptProtectData/CryptUnprotectData), rather than the plain-JSON
// `sync-host.json` used for the port/username, which aren't secrets on
// their own. DPAPI ties the ciphertext to the current Windows user
// account: transparent, no prompt, and useless if copied to another
// machine or user account.
//
// Deliberately not a cross-platform abstraction (no keyring crate).
// Android uses the Android Keystore via the biometric plugin (see
// config.ts), and the plain web build has no OS-level secure-storage
// primitive at all.

use std::ffi::c_void;
use windows::Win32::Foundation::LocalFree;
use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB};

fn encrypt(plaintext: &[u8]) -> std::io::Result<Vec<u8>> {
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: plaintext.len() as u32,
            pbData: plaintext.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        CryptProtectData(&input, None, None, None, None, 0, &mut output)
            .map_err(|e| std::io::Error::other(format!("CryptProtectData failed: {e}")))?;
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(output.pbData as *mut c_void)));
        Ok(bytes)
    }
}

fn decrypt(ciphertext: &[u8]) -> std::io::Result<Vec<u8>> {
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: ciphertext.len() as u32,
            pbData: ciphertext.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        CryptUnprotectData(&input, None, None, None, None, 0, &mut output)
            .map_err(|e| std::io::Error::other(format!("CryptUnprotectData failed: {e}")))?;
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(output.pbData as *mut c_void)));
        Ok(bytes)
    }
}

/// Encrypts `{user, pass}` as JSON via DPAPI and writes it to `path`.
pub fn store_secret(path: &std::path::Path, user: &str, pass: &str) -> std::io::Result<()> {
    let json = serde_json::to_vec(&serde_json::json!({ "user": user, "pass": pass }))
        .map_err(std::io::Error::other)?;
    let encrypted = encrypt(&json)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, encrypted)
}

/// Reads and decrypts `{user, pass}` from `path`. Returns `Ok(None)` if
/// the file doesn't exist yet (first run, nothing stored) rather than
/// erroring -- mirrors `sync_host.rs`'s own not-found handling style.
/// A decrypt failure (corrupt file, or DPAPI blob from a different user
/// account) is also treated as "nothing usable" rather than a hard
/// error, since the caller's fallback (re-pair) is the only sane
/// recovery either way.
pub fn load_secret(path: &std::path::Path) -> Option<(String, String)> {
    let encrypted = std::fs::read(path).ok()?;
    let decrypted = decrypt(&encrypted).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&decrypted).ok()?;
    let user = value.get("user")?.as_str()?.to_string();
    let pass = value.get("pass")?.as_str()?.to_string();
    Some((user, pass))
}
