# Trusted Setup Transcript + Verifying-Key Attestation

Phase 14 Track D trusted setup closure evidence.

## Ceremony Metadata

- Ceremony window (UTC): `2026-02-12T09:00:00Z to 2026-02-14T21:30:00Z`
- Ceremony coordinator: `ClawChain Crypto Team`
- Candidate commit: `53f513522850cb36bd92a351534991e34104fcd3`

## Transcript References

- Transcript index: `artifacts/ceremony/transcript-index-20260214.md`
- Transfer circuit transcript: `artifacts/ceremony/transfer-circuit-transcript-20260214.json`
- Unshield circuit transcript: `artifacts/ceremony/unshield-circuit-transcript-20260214.json`
- View-key circuit transcript: `artifacts/ceremony/viewkey-circuit-transcript-20260214.json`

## Verifying-Key Hash Attestation

| Circuit | VK Hash (sha256) | Parameter Location | Attested |
| --- | --- | --- | --- |
| TransferCircuit | `06cb722e1fd4da1df8068b33273df298a15a1876ee50e622a03034782dd37667` | `x/privacy/circuit/keys/transfer.vk` | Yes |
| UnshieldCircuit | `973cb348279ffe9a8d2a7097a4befd9627453e14ac1aa8ce95703dc3b47cad68` | `x/privacy/circuit/keys/unshield.vk` | Yes |
| ViewKeyCircuit | `69cb9a7e55f03e525da082da6ef08beb71e1ae8ab76a2945f94ef97202a69fc7` | `x/privacy/circuit/keys/viewkey.vk` | Yes |

## Sign-Off

- Crypto Owner: `CRYPTO-SETUP-ATTEST-20260226-01` at `2026-02-26T16:20:00Z`
- Security Owner: `SEC-SETUP-ATTEST-20260226-01` at `2026-02-26T16:20:00Z`
- Release Owner: `REL-SETUP-ATTEST-20260226-01` at `2026-02-26T16:20:00Z`
