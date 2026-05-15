# ClawChain Security Audit Scope

## Overview

This document defines the scope for an external security audit of ClawChain prior to mainnet launch.

## In-Scope Components

### Critical Priority (Must Audit)

1. **ZK Privacy Module** (`x/privacy/`)
   - Circuit constraints (`circuit/circuit.go`)
   - MPC trusted setup (`circuit/mpc_setup.go`, `circuit/setup.go`)
   - Shield/unshield/transfer message handlers
   - Merkle tree implementation (`merkle/`)
   - Nullifier double-spend prevention
   - Rate limiting implementation
   - Blinding factor validation

2. **Token Economics & Escrow** (`x/marketplace/`)
   - Payment escrow in `msg_server_compute.go`
   - Lease payment calculation and escrow
   - Compute job payment settlement
   - Skill purchase payment flow
   - Overflow/underflow in amount calculations

3. **Governance Module** (`x/governance/`)
   - Stake-weighted voting mechanism
   - Proposal execution logic
   - Deposit handling
   - Quorum and threshold calculations

### High Priority

4. **Agent Module** (`x/agent/`)
   - Agent registration and deregistration
   - Task delegation and completion
   - Reward distribution (`keeper/endblock.go`)
   - Intent submission and finalization
   - Negotiation state machine

5. **Reputation Module** (`x/reputation/`)
   - Score calculation
   - Sybil resistance mechanisms
   - Endorsement validation

6. **IBC Integration** (`x/agent/ibc/`, `x/privacy/ibc/`)
   - Cross-chain message handling
   - IBC shield transfer validation
   - Remote agent discovery

### Medium Priority

7. **Model Registry** (`x/modelregistry/`)
   - Access control for paid models
   - Inference job payment flow
   - Provider heartbeat and timeout logic

8. **Messaging Module** (`x/messaging/`)
   - Message encryption verification
   - Access control

9. **GPU Provider Daemon** (`cmd/claw-gpu-provider/`)
   - Chain client authentication
   - Job execution sandboxing
   - Input validation

### Low Priority

10. **Web Dashboard** (`web/`)
    - Transaction signing flow
    - Wallet integration

11. **SDK** (`sdk/`)
    - Client-side proof generation
    - Key management

## Out of Scope

- Cosmos SDK core modules (already audited upstream)
- CometBFT consensus engine (already audited upstream)
- IBC-go protocol (already audited upstream)
- Third-party dependencies (covered by `govulncheck`)
- Frontend styling and UX

## Audit Focus Areas

### 1. Cryptographic Correctness
- ZK circuit soundness (can invalid proofs pass verification?)
- MPC ceremony transcript verifiability
- Blinding factor entropy
- Nullifier derivation uniqueness

### 2. Economic Attacks
- Flash loan / MEV attacks on escrow
- Griefing attacks on governance (deposit drain)
- Privacy pool drainage via malformed proofs
- Inference job payment manipulation

### 3. State Machine Safety
- Consensus-breaking non-determinism
- Panics in message handlers (chain halt vectors)
- Integer overflow/underflow in token amounts
- State inconsistency during IBC packet handling

### 4. Access Control
- Authority checks on all message handlers
- Module account permissions
- Cross-module call authorization

### 5. Denial of Service
- Unbounded iteration in keepers
- Large input handling (oversized proofs, long strings)
- Rate limit bypass vectors

## Deliverables Expected

1. **Findings report** with severity ratings (Critical/High/Medium/Low/Info)
2. **Proof of concepts** for any Critical/High findings
3. **Remediation guidance** for each finding
4. **Re-test** of Critical/High findings after fixes
5. **Final attestation** suitable for publication

## Timeline

- Audit start: After Phase 3 completion (test coverage >60%)
- Duration: 4-6 weeks
- Re-test: 1-2 weeks after fixes
- Final report: Before mainnet genesis

## Contact

- Repository: Private access granted to audit firm
- Technical lead: [TBD]
- Communication: Dedicated Slack channel + encrypted email
