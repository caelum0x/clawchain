//! Live end-to-end example for the clawchain-alloy write path.
//!
//! Reads chain id / height / balance, then signs and broadcasts a bank send
//! (to self) via SIGN_MODE_DIRECT against a running ClawChain node.
//!
//! Run against e.g. scripts/testnet/local-multinode.sh:
//!   PRIV_HEX=<64-hex secp256k1 key> RPC_URL=http://localhost:26657 \
//!     REST_URL=http://localhost:1317 cargo run -p clawchain-alloy --example live_send
//!
//! Exits non-zero on any failure.

use clawchain_alloy::{ClawProvider, ClawSigner};

fn main() {
    let rpc = std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:26657".into());
    let rest = std::env::var("REST_URL").unwrap_or_else(|_| "http://localhost:1317".into());
    let priv_hex = std::env::var("PRIV_HEX").expect("PRIV_HEX (64-char hex key) required");

    let provider = ClawProvider::new(rpc, rest);
    let signer = ClawSigner::from_hex(&priv_hex).expect("valid secp256k1 hex key");
    let addr = signer.address();

    let chain_id = provider.chain_id().expect("chain_id");
    let height = provider.block_number().expect("block_number");
    let balance = provider.get_balance(&addr, "uclaw").expect("balance");
    println!("chainId={chain_id} height={height} account={addr} balance={balance}uclaw");

    let hash = provider
        .send(&signer, &addr, 1000, "uclaw", 200_000, "0.0001uclaw")
        .expect("bank send");
    println!("bank send broadcast: tx={hash}");
    println!("LIVE ALLOY WRITE PATH OK");
}
