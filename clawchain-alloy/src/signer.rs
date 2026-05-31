//! The [`ClawSigner`]: a secp256k1 key with the ClawChain (`claw`) bech32 prefix.
//!
//! This wraps `cosmrs::crypto::secp256k1::SigningKey` and pins the `claw` address
//! prefix so the rest of the write path never has to repeat it. Building a signer
//! from a 32-byte hex private key is **pure** (no network), which keeps the tx
//! build/sign tests fully offline.

use cosmrs::crypto::secp256k1::SigningKey;
use cosmrs::crypto::PublicKey;
use cosmrs::AccountId;

use crate::error::{ClawError, ClawResult};

/// The ClawChain bech32 account prefix (bond denom is `uclaw`).
pub const CLAW_PREFIX: &str = "claw";

/// A signer bound to the ClawChain (`claw`) address prefix.
///
/// Construct from a 32-byte secp256k1 private key in hex with
/// [`ClawSigner::from_hex`], then read [`ClawSigner::address`] /
/// [`ClawSigner::public_key`]. Signing the canonical sign-bytes is delegated to
/// the inner `cosmrs` [`SigningKey`] via [`ClawSigner::signing_key`].
pub struct ClawSigner {
    signing_key: SigningKey,
    account_id: AccountId,
}

impl std::fmt::Debug for ClawSigner {
    /// Never prints key material — only the public address.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClawSigner")
            .field("address", &self.account_id.to_string())
            .finish_non_exhaustive()
    }
}

impl ClawSigner {
    /// Build a signer from a 32-byte secp256k1 private key encoded as hex.
    ///
    /// The hex may optionally carry a `0x` prefix. The derived address uses the
    /// [`CLAW_PREFIX`] bech32 HRP. This performs no network I/O, so it is safe to
    /// use from offline tests with a fixed key.
    pub fn from_hex(priv_hex: &str) -> ClawResult<Self> {
        let cleaned = priv_hex.strip_prefix("0x").unwrap_or(priv_hex);
        let bytes =
            hex::decode(cleaned).map_err(|e| ClawError::Field(format!("private key hex: {e}")))?;
        if bytes.len() != 32 {
            return Err(ClawError::Field(format!(
                "private key must be 32 bytes, got {}",
                bytes.len()
            )));
        }
        let signing_key = SigningKey::from_slice(&bytes)
            .map_err(|e| ClawError::Field(format!("secp256k1 key: {e}")))?;
        let account_id = signing_key
            .public_key()
            .account_id(CLAW_PREFIX)
            .map_err(|e| ClawError::Field(format!("derive account id: {e}")))?;
        Ok(Self {
            signing_key,
            account_id,
        })
    }

    /// The bech32 `claw1...` address of this signer.
    pub fn address(&self) -> String {
        self.account_id.to_string()
    }

    /// The signer's account id (typed bech32 address with the `claw` prefix).
    pub fn account_id(&self) -> &AccountId {
        &self.account_id
    }

    /// The signer's secp256k1 public key (packed into the tx's signer info).
    pub fn public_key(&self) -> PublicKey {
        self.signing_key.public_key()
    }

    /// The inner `cosmrs` signing key, used to sign canonical `SignDoc` bytes.
    pub fn signing_key(&self) -> &SigningKey {
        &self.signing_key
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A fixed, well-known test private key (NOT a real account secret). All
    // assertions below are deterministic for this key, so the tests stay offline.
    const FIXED_KEY_HEX: &str = "0000000000000000000000000000000000000000000000000000000000000001";

    #[test]
    fn builds_signer_from_fixed_hex_and_derives_claw_address() {
        let signer = ClawSigner::from_hex(FIXED_KEY_HEX).unwrap();
        let addr = signer.address();
        assert!(
            addr.starts_with("claw1"),
            "expected claw-prefixed address, got {addr}"
        );
        // Address derivation is deterministic for a fixed key + prefix.
        assert_eq!(addr, ClawSigner::from_hex(FIXED_KEY_HEX).unwrap().address());
    }

    #[test]
    fn accepts_0x_prefixed_hex() {
        let with = ClawSigner::from_hex(&format!("0x{FIXED_KEY_HEX}")).unwrap();
        let without = ClawSigner::from_hex(FIXED_KEY_HEX).unwrap();
        assert_eq!(with.address(), without.address());
    }

    #[test]
    fn rejects_wrong_length_key() {
        let err = ClawSigner::from_hex("00ff").unwrap_err();
        assert!(matches!(err, ClawError::Field(_)));
    }

    #[test]
    fn rejects_non_hex_key() {
        let err = ClawSigner::from_hex("zz".repeat(32).as_str()).unwrap_err();
        assert!(matches!(err, ClawError::Field(_)));
    }

    #[test]
    fn public_key_account_id_matches_address() {
        let signer = ClawSigner::from_hex(FIXED_KEY_HEX).unwrap();
        let from_pk = signer.public_key().account_id(CLAW_PREFIX).unwrap();
        assert_eq!(from_pk.to_string(), signer.address());
    }
}
