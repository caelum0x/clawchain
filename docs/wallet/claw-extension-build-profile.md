# Claw Extension Build Profile

This profile builds a branded unpacked browser extension from the vendored Keplr fork.

## Build command

```bash
bash scripts/wallet/build-claw-extension.sh
```

For history/explorer features during local testing, run:

```bash
bash scripts/wallet/run-claw-tx-history.sh
```

Manual equivalent:

```bash
cd vendor/keplr-wallet/apps/extension
yarn build:claw
```

Optional build-time overrides:

```bash
CLAW_TX_HISTORY_BASE_URL=http://127.0.0.1:17171 \
CLAW_CONFIG_SERVER=http://127.0.0.1:17171 \
yarn build:claw
```

## Output directories

- Manifest v3 (Chrome/Edge): `vendor/keplr-wallet/apps/extension/build/claw/manifest-v3`
- Manifest v2 (legacy/Firefox packaging base): `vendor/keplr-wallet/apps/extension/build/claw/manifest-v2`

## Load unpacked (Chrome)

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select: `vendor/keplr-wallet/apps/extension/build/claw/manifest-v3`

## Branding included in this profile

- Extension display name: `Claw Wallet`
- Manifest title/description set to Claw Wallet
- Firefox extension id switched to `claw-wallet-extension@clawchain.dev`
- EIP-6963 provider metadata name set to `Claw Wallet`
