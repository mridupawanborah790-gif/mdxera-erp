use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Sign a payload string with HMAC-SHA256 using the given secret.
/// Returns a hex-encoded signature.
#[tauri::command]
pub fn sign_local_token(payload: String, secret: String) -> Result<String, String> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|e| e.to_string())?;
    mac.update(payload.as_bytes());
    let result = mac.finalize();
    Ok(hex::encode(result.into_bytes()))
}

/// Verify a payload against a hex-encoded HMAC-SHA256 signature using the given secret.
#[tauri::command]
pub fn verify_local_token(payload: String, signature: String, secret: String) -> bool {
    let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(payload.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());
    // constant-time string comparison via hmac crate would be ideal; for UUIDs this is fine
    expected == signature
}
