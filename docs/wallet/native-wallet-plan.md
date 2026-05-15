# Native Wallet Plan (Extension + Mobile)

## Decision

Web wallet is not the production path.
ClawChain wallet strategy is:

1. Browser extension wallet
2. Mobile wallet app
3. Web app only as explorer/dashboard (no key custody)

## Immediate repo changes

- `web/` wallet route becomes informational launcher only.
- No mnemonic custody in explorer website.
- New tracks: `wallet-extension/` and `wallet-mobile/`.
- Vendor integrations present under `vendor/keplr-wallet`, `vendor/keplr-chain-registry`, `vendor/phishing-block-list`.

## Integration requirements for forked wallets

- Chain ID: `clawchain`
- Bech32 prefix: `claw`
- Denom: `uclaw` (`CLAW` display)
- RPC/LCD configurable via env
- Support staking module queries and txs
- Support custom module tx types as needed (`agent`, `marketplace`, `privacy`, etc.)

## Fork acceptance checklist

- Vault encryption and lock behavior reviewed
- Tx signing flow tested on Claw testnet
- Send + delegate + undelegate + redelegate flows pass
- No plaintext mnemonic persistence
- Security review checklist passed before release
