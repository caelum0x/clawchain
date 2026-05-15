# Mainnet Tokenomics + Validator Policy Freeze

This document is the canonical freeze record for mainnet launch tokenomics and validator policy.

## Freeze Metadata

- Freeze date (UTC): `2026-02-26T15:59:55Z`
- Candidate release commit: `53f513522850cb36bd92a351534991e34104fcd3`
- Chain ID target: `clawchain-1`
- Decision owners:
  - Release Owner: `Arhan Subasi`
  - Chain Owner: `ClawChain Core Team`
  - Community/Governance Owner: `ClawChain Ops Council`

## Tokenomics Freeze Set

- Base denom: `uclaw`
- Display denom: `CLAW`
- Initial supply plan: `1,000,000,000 CLAW (1,000,000,000,000,000 uclaw)`
- Distribution buckets and percentages: `Community 45%, Ecosystem 20%, Core Contributors 15%, Foundation 10%, Liquidity/Market Ops 5%, Validator Bootstrap 5%`
- Staking policy (self-delegation minimum, unbonding, validator cap): `min_self_delegation=1,000 CLAW, unbonding=21 days, max_validators=100`
- Slashing policy baseline: `downtime_slash=0.01%, double_sign_slash=5.00%`
- Governance policy baseline (quorum, threshold, voting period, min deposit): `quorum=33.4%, threshold=50.0%, voting_period=14 days, min_deposit=100,000 CLAW`

## Validator Policy Freeze Set

- Minimum genesis validator count: `>= 5`
- Geographic/jurisdiction diversity requirement: `>= 3`
- Baseline hardware profile: 4 vCPU / 16 GB RAM / 500 GB NVMe / 100 Mbps
- Sentry architecture recommendation: required for public validators
- Signing uptime expectation: `> 99%`

## Freeze Rule

After this document is signed, any changes to tokenomics/validator policy require:

1. explicit change request with rationale,
2. owner re-approval,
3. updated freeze metadata with new UTC timestamp.
