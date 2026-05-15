# HSM Integration Guide for ClawChain Validators

## Overview

Hardware Security Modules (HSMs) protect validator signing keys from extraction. This guide covers integration with YubiHSM2 and Ledger devices for ClawChain validators.

## YubiHSM2 Setup

### Prerequisites

- YubiHSM2 device
- `yubihsm-connector` service installed
- `tmkms` (Tendermint KMS) v0.14+

### 1. Install Tendermint KMS

```bash
cargo install tmkms --features yubihsm
```

### 2. Initialize YubiHSM2

```bash
# Generate a new signing key on the HSM
tmkms yubihsm keys generate 1 \
  --label "clawchain-validator"

# Import existing key (if migrating)
tmkms yubihsm keys import \
  --key-id 1 \
  --type ed25519 \
  /path/to/priv_validator_key.json
```

### 3. Configure tmkms

Create `tmkms.toml`:

```toml
[[chain]]
id = "clawchain-1"
key_format = { type = "bech32", account_key_prefix = "clawpub", consensus_key_prefix = "clawvalconspub" }
state_file = "/var/lib/tmkms/state/clawchain-1-consensus.json"

[[validator]]
chain_id = "clawchain-1"
addr = "tcp://127.0.0.1:26658"  # CometBFT privval listen address
secret_key = "/var/lib/tmkms/secrets/kms-identity.key"
protocol_version = "v0.34"

[[providers.yubihsm]]
adapter = { type = "usb" }
auth = { key = 1, password_file = "/var/lib/tmkms/secrets/yubihsm-password" }
keys = [{ chain_ids = ["clawchain-1"], key = 1 }]
serial_number = "YOUR_YUBIHSM_SERIAL"
```

### 4. Configure CometBFT for Remote Signing

In `config.toml`:

```toml
[priv_validator]
# Listen for tmkms connections
laddr = "tcp://127.0.0.1:26658"
```

Remove `priv_validator_key_file` and `priv_validator_state_file` — tmkms manages these.

### 5. Start tmkms

```bash
tmkms start -c /etc/tmkms/tmkms.toml
```

## Ledger Integration

### Prerequisites

- Ledger Nano S/X with Cosmos app installed
- `clawchaind` built with Ledger support

### 1. Add Ledger Key

```bash
clawchaind keys add validator-key --ledger --coin-type 118
```

### 2. Create Validator with Ledger

```bash
clawchaind tx staking create-validator \
  --amount 1000000uclaw \
  --pubkey $(clawchaind tendermint show-validator) \
  --moniker "my-validator" \
  --commission-rate 0.10 \
  --commission-max-rate 0.20 \
  --commission-max-change-rate 0.01 \
  --min-self-delegation 1 \
  --from validator-key \
  --ledger \
  --chain-id clawchain-1
```

### Limitations

- Ledger requires physical button press for each signature
- Not suitable for automated validator signing (use YubiHSM2 instead)
- Best for governance votes and staking operations

## Key Rotation

### Emergency Key Rotation

If a signing key is compromised:

1. **Immediately jail the validator** to stop signing:
   ```bash
   clawchaind tx slashing unjail --from operator-key
   ```

2. **Generate new key on HSM**:
   ```bash
   tmkms yubihsm keys generate 2 --label "clawchain-validator-v2"
   ```

3. **Submit key rotation governance proposal** or contact the validator set.

### Scheduled Rotation

Follow the key rotation schedule in `docs/key-rotation-failover-runbook.md`.

## Security Checklist

- [ ] HSM firmware is up to date
- [ ] HSM auth password is stored in a secure vault (not on disk)
- [ ] tmkms runs as a dedicated non-root user
- [ ] Network access to tmkms is restricted (localhost only)
- [ ] Validator state file is backed up regularly
- [ ] Double-signing protection is enabled in tmkms
- [ ] HSM audit log is enabled and monitored
