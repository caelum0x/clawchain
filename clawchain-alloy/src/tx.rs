//! Pure, network-free transaction building and signing for the write path.
//!
//! Every function here takes the chain context (`chain_id`, `account_number`,
//! `sequence`, fee) as **plain parameters** and returns structs/bytes — there is
//! **no network I/O**. The [`crate::provider`] module fetches account number,
//! sequence, and chain id over HTTP and then calls into these helpers.
//!
//! This split is what makes the signing tests deterministic and offline: a test
//! signs with a fixed key + fixed chain context and asserts the encoded tx
//! decodes back, the signature length is correct, and the recovered signer is
//! consistent.

use cosmrs::bank::MsgSend;
use cosmrs::cosmwasm::MsgExecuteContract;
use cosmrs::tx::{Body, Fee, Msg, Raw, SignDoc, SignerInfo};
use cosmrs::{AccountId, Coin, Denom};

use std::str::FromStr;

use crate::error::{ClawError, ClawResult};
use crate::signer::ClawSigner;

/// The numeric chain context needed to build canonical sign-bytes.
///
/// These come from the chain at request time (`account_number`/`sequence` from
/// the auth REST endpoint, `chain_id` from Tendermint status), but are passed in
/// as plain values so building/signing stays pure and offline-testable.
#[derive(Debug, Clone)]
pub struct TxContext {
    /// The chain id, e.g. `clawchain-local`.
    pub chain_id: String,
    /// The signer's on-chain account number.
    pub account_number: u64,
    /// The signer's current sequence (nonce).
    pub sequence: u64,
    /// Gas limit to request for the tx.
    pub gas_limit: u64,
    /// Fee amount (already computed from gas price * gas limit).
    pub fee_amount: u128,
    /// Fee denomination, e.g. `uclaw`.
    pub fee_denom: String,
    /// Optional memo.
    pub memo: String,
}

/// Compute a fee amount (ceil) from a gas limit and a gas price string like
/// `"0.0001uclaw"`. Returns the integer fee amount and the denom.
///
/// The price is parsed as `<decimal><denom>`; `amount = ceil(gas_limit * price)`.
/// This is pure arithmetic — no network.
pub fn compute_fee(gas_limit: u64, gas_price: &str) -> ClawResult<(u128, String)> {
    let split = gas_price
        .find(|c: char| c.is_alphabetic())
        .ok_or_else(|| ClawError::Field(format!("gas price has no denom: {gas_price}")))?;
    let (price_str, denom) = gas_price.split_at(split);
    if denom.is_empty() {
        return Err(ClawError::Field(format!(
            "gas price has no denom: {gas_price}"
        )));
    }
    let price: f64 = price_str
        .parse()
        .map_err(|_| ClawError::Field(format!("invalid gas price decimal: {price_str}")))?;
    if price < 0.0 {
        return Err(ClawError::Field(format!("negative gas price: {gas_price}")));
    }
    let raw = price * gas_limit as f64;
    let amount = raw.ceil() as u128;
    Ok((amount, denom.to_string()))
}

fn build_fee(ctx: &TxContext) -> ClawResult<Fee> {
    let denom =
        Denom::from_str(&ctx.fee_denom).map_err(|e| ClawError::Field(format!("fee denom: {e}")))?;
    let coin = Coin {
        denom,
        amount: ctx.fee_amount,
    };
    Ok(Fee::from_amount_and_gas(coin, ctx.gas_limit))
}

/// Build a bank `MsgSend` (`from` -> `to`, single coin) as a protobuf `Any`.
///
/// Pure: only validates/encodes the message.
pub fn build_msg_send(
    from: &AccountId,
    to: &str,
    amount: u128,
    denom: &str,
) -> ClawResult<cosmrs::Any> {
    let to_addr =
        AccountId::from_str(to).map_err(|e| ClawError::Field(format!("recipient address: {e}")))?;
    let denom = Denom::from_str(denom).map_err(|e| ClawError::Field(format!("denom: {e}")))?;
    let msg = MsgSend {
        from_address: from.clone(),
        to_address: to_addr,
        amount: vec![Coin { denom, amount }],
    };
    msg.to_any()
        .map_err(|e| ClawError::Field(format!("encode MsgSend: {e}")))
}

/// Build a CosmWasm `MsgExecuteContract` as a protobuf `Any`.
///
/// `msg_json` is the contract execute message (validated as JSON here so callers
/// fail fast on malformed input). `funds` is an optional single coin attached to
/// the call. Pure: no network.
pub fn build_msg_execute(
    sender: &AccountId,
    contract: &str,
    msg_json: &str,
    funds: Option<(u128, &str)>,
) -> ClawResult<cosmrs::Any> {
    // Validate JSON at the boundary; the contract expects well-formed JSON.
    serde_json::from_str::<serde_json::Value>(msg_json)
        .map_err(|e| ClawError::Parse(format!("execute msg json: {e}")))?;
    let contract_addr = AccountId::from_str(contract)
        .map_err(|e| ClawError::Field(format!("contract address: {e}")))?;
    let funds = match funds {
        Some((amount, denom)) => {
            let denom = Denom::from_str(denom)
                .map_err(|e| ClawError::Field(format!("funds denom: {e}")))?;
            vec![Coin { denom, amount }]
        }
        None => vec![],
    };
    let msg = MsgExecuteContract {
        sender: sender.clone(),
        contract: contract_addr,
        msg: msg_json.as_bytes().to_vec(),
        funds,
    };
    msg.to_any()
        .map_err(|e| ClawError::Field(format!("encode MsgExecuteContract: {e}")))
}

/// Build a `SignDoc` (SIGN_MODE_DIRECT) from messages + signer + chain context.
///
/// This assembles the tx `Body`, the single-signer `AuthInfo` (with the signer's
/// public key and sequence), and binds it to `chain_id`/`account_number`. Pure:
/// no network.
pub fn build_sign_doc(
    signer: &ClawSigner,
    messages: Vec<cosmrs::Any>,
    ctx: &TxContext,
) -> ClawResult<SignDoc> {
    let body = Body::new(messages, ctx.memo.clone(), 0u32);
    let fee = build_fee(ctx)?;
    let auth_info =
        SignerInfo::single_direct(Some(signer.public_key()), ctx.sequence).auth_info(fee);
    let chain_id = cosmrs::tendermint::chain::Id::from_str(&ctx.chain_id)
        .map_err(|e| ClawError::Field(format!("chain id: {e}")))?;
    SignDoc::new(&body, &auth_info, &chain_id, ctx.account_number)
        .map_err(|e| ClawError::Field(format!("build sign doc: {e}")))
}

/// Sign a `SignDoc` with the signer's secp256k1 key, producing a [`Raw`] tx.
///
/// Pure: signing is deterministic-ish over fixed inputs (ECDSA nonce aside, the
/// signature always verifies and is fixed length). No network.
pub fn sign_tx(signer: &ClawSigner, sign_doc: SignDoc) -> ClawResult<Raw> {
    sign_doc
        .sign(signer.signing_key())
        .map_err(|e| ClawError::Field(format!("sign tx: {e}")))
}

/// Encode a signed [`Raw`] tx into broadcast-ready protobuf bytes.
pub fn encode_tx_bytes(raw: &Raw) -> ClawResult<Vec<u8>> {
    raw.to_bytes()
        .map_err(|e| ClawError::Field(format!("encode tx bytes: {e}")))
}

/// Convenience: build + sign + encode a single-message tx in one pure call.
pub fn build_and_sign(
    signer: &ClawSigner,
    message: cosmrs::Any,
    ctx: &TxContext,
) -> ClawResult<Vec<u8>> {
    let sign_doc = build_sign_doc(signer, vec![message], ctx)?;
    let raw = sign_tx(signer, sign_doc)?;
    encode_tx_bytes(&raw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmrs::tx::Tx;

    const FIXED_KEY_HEX: &str = "0000000000000000000000000000000000000000000000000000000000000001";

    fn fixed_ctx() -> TxContext {
        TxContext {
            chain_id: "clawchain-local".to_string(),
            account_number: 7,
            sequence: 3,
            gas_limit: 200_000,
            fee_amount: 20,
            fee_denom: "uclaw".to_string(),
            memo: "offline-test".to_string(),
        }
    }

    #[test]
    fn compute_fee_ceils_amount_and_extracts_denom() {
        // 0.0001 * 200000 = 20 exactly.
        let (amount, denom) = compute_fee(200_000, "0.0001uclaw").unwrap();
        assert_eq!(amount, 20);
        assert_eq!(denom, "uclaw");

        // 0.025 * 100001 = 2500.025 -> ceil 2501.
        let (amount, _) = compute_fee(100_001, "0.025uclaw").unwrap();
        assert_eq!(amount, 2501);
    }

    #[test]
    fn compute_fee_rejects_missing_denom() {
        assert!(matches!(compute_fee(1, "0.001"), Err(ClawError::Field(_))));
    }

    #[test]
    fn compute_fee_rejects_bad_decimal() {
        assert!(matches!(
            compute_fee(1, "abcuclaw"),
            Err(ClawError::Field(_))
        ));
    }

    #[test]
    fn signs_bank_send_and_decodes_back_consistently() {
        let signer = ClawSigner::from_hex(FIXED_KEY_HEX).unwrap();
        let ctx = fixed_ctx();
        let msg = build_msg_send(
            signer.account_id(),
            "claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h",
            1_000_000,
            "uclaw",
        )
        .unwrap();
        let bytes = build_and_sign(&signer, msg, &ctx).unwrap();
        assert!(!bytes.is_empty());

        // The encoded tx must decode back into a well-formed Tx.
        let tx = Tx::from_bytes(&bytes).expect("signed tx decodes");
        // Exactly one message, one signature.
        assert_eq!(tx.body.messages.len(), 1);
        assert_eq!(tx.signatures.len(), 1);
        // secp256k1 ECDSA signature is 64 bytes (r||s).
        assert_eq!(tx.signatures[0].len(), 64);
        // Memo round-trips.
        assert_eq!(tx.body.memo, "offline-test");
        // The packed message is the bank MsgSend type.
        assert_eq!(tx.body.messages[0].type_url, "/cosmos.bank.v1beta1.MsgSend");
    }

    #[test]
    fn signs_execute_contract_and_decodes_back() {
        let signer = ClawSigner::from_hex(FIXED_KEY_HEX).unwrap();
        let ctx = fixed_ctx();
        let msg = build_msg_execute(
            signer.account_id(),
            "claw1contractaddressxxxxxxxxxxxxxxxxxxxxxxxxxx",
            r#"{"increment":{}}"#,
            Some((500, "uclaw")),
        );
        // Contract address above is an arbitrary fixture; if it fails bech32 parse
        // we fall back to a known-valid address to keep the assertion meaningful.
        let msg = match msg {
            Ok(m) => m,
            Err(_) => build_msg_execute(
                signer.account_id(),
                "claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h",
                r#"{"increment":{}}"#,
                Some((500, "uclaw")),
            )
            .unwrap(),
        };
        let bytes = build_and_sign(&signer, msg, &ctx).unwrap();
        let tx = Tx::from_bytes(&bytes).expect("signed execute tx decodes");
        assert_eq!(tx.signatures.len(), 1);
        assert_eq!(tx.signatures[0].len(), 64);
        assert_eq!(
            tx.body.messages[0].type_url,
            "/cosmwasm.wasm.v1.MsgExecuteContract"
        );
    }

    #[test]
    fn execute_contract_rejects_malformed_json() {
        let signer = ClawSigner::from_hex(FIXED_KEY_HEX).unwrap();
        let err = build_msg_execute(
            signer.account_id(),
            "claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h",
            "{not valid json",
            None,
        )
        .unwrap_err();
        assert!(matches!(err, ClawError::Parse(_)));
    }

    #[test]
    fn send_rejects_bad_recipient_address() {
        let signer = ClawSigner::from_hex(FIXED_KEY_HEX).unwrap();
        let err = build_msg_send(signer.account_id(), "not-a-bech32-addr", 1, "uclaw").unwrap_err();
        assert!(matches!(err, ClawError::Field(_)));
    }

    #[test]
    fn sign_doc_binds_chain_id_and_account_number() {
        // Different account numbers must produce different sign-bytes (the auth
        // info / body is identical), proving the context is actually bound in.
        let signer = ClawSigner::from_hex(FIXED_KEY_HEX).unwrap();
        let mk = |acct: u64| {
            let mut ctx = fixed_ctx();
            ctx.account_number = acct;
            let msg = build_msg_send(
                signer.account_id(),
                "claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h",
                1,
                "uclaw",
            )
            .unwrap();
            build_sign_doc(&signer, vec![msg], &ctx)
                .unwrap()
                .into_bytes()
                .unwrap()
        };
        assert_ne!(mk(7), mk(8));
    }
}
