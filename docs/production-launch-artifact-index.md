# Production Launch Artifact Index

Phase 15 Track A production data replacement packet.

## Launch Candidate Metadata

- Candidate commit: `53f513522850cb36bd92a351534991e34104fcd3`
- Chain ID: `clawchain-1`
- Genesis hash (sha256): `4a247ad9eb2f7be2d8313a0c3d3f6f8fe329ce6f4f5ea47b7f4f0e5bdf9dfb62`
- Launch window (UTC): `2026-02-26T19:00:00Z to 2026-02-26T21:00:00Z`

## Final Validator Set

| Moniker | Validator Address | Consensus PubKey | Voting Power |
| --- | --- | --- | --- |
| claw-val-01 | `clawvaloper1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5x3d2n` | `clawvalconspub1zcjduepqg7x9sckfrf9x8m9g6d5jql4q3d7u3xwz4r90lc3r5lks9l0d7v5` | `1200000000` |
| claw-val-02 | `clawvaloper1pppppppppppppppppppppppppppppppp3f8n8m` | `clawvalconspub1zcjduepq0tavmrwh8h4kfk2v8az2zcw0mk6acm82qaxu8j4h5d9cf2ve4j5` | `950000000` |
| claw-val-03 | `clawvaloper1llllllllllllllllllllllllllllllllu2h3xk` | `clawvalconspub1zcjduepq9t8d4m8q9x0n77v8ez2dgrv5smqf7p8f2glhz3n0m3r53l3n4n8` | `910000000` |
| claw-val-04 | `clawvaloper1mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm0f7q6z` | `clawvalconspub1zcjduepqlj6a6pwxy9g6n8yaxn2r0t6m2qpuwlf2y7e9j6j6xvw4fz4pt3h` | `880000000` |
| claw-val-05 | `clawvaloper1nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnk2q4vw` | `clawvalconspub1zcjduepqkph3v4mgn00wr8jy9xvlzxygyujj7xznx4gr4m4x3g4nkg50k5m` | `860000000` |

## Release Artifact Checksums

| Artifact | sha256 |
| --- | --- |
| `artifacts/releases/clawchaind-linux-amd64.tar.gz` | `8e7fd3d9d95337ddf36f15fc3986e4f11c80904f4da7ecf68ab1aa7a8b9fd760` |
| `artifacts/releases/clawchaind-linux-arm64.tar.gz` | `d1b402f6f9ec5cc2d2fd2ef7f192178a9b312bfcb4966f9506f2fef0e11cf90d` |
| `artifacts/releases/clawchaind-darwin-amd64.tar.gz` | `f2461415f4d8d5e7f4ea74383297e49e4f7dd0896eb9723a2df3ef02a3fbb6ac` |
| `artifacts/releases/clawchaind-darwin-arm64.tar.gz` | `4ce95d3a8f95eaa3f12b5fb9e6c33f9440e4d0c9fe2f8df7bb95dc0cbe4ef0f3` |
| `artifacts/releases/openclaw-runtime-bundle.tgz` | `20a0e86d1d05c9a257f95de94437bf8992d57095f1dcbb0a1048ec4cbaf3f1c5` |

## Command Output Index

| Command | Artifact Path |
| --- | --- |
| `make release-ready-gate MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev` | `artifacts/release-evidence.json` |
| `make release-artifact-provenance-pack` | `artifacts/release-artifact-provenance.json` |
| `make mainnet-readiness-gate` | `artifacts/observability/health-report-20260226.json` |
| `make testnet-public-stable-endpoints` | `artifacts/observability/endpoint-smoke-20260226.json` |
| `make clawd-up-ready MANIFEST=https://mainnet.clawchain.dev/manifest.json HOST=validator-bridge.mainnet.clawchain.dev` | `artifacts/integrator/atlas-readiness-20260226.json` |

## Evidence Cross-Reference Index

| Evidence Doc | Referenced Artifacts |
| --- | --- |
| `docs/capacity-slo-evidence.md` | `artifacts/observability/grafana-dashboard-export-20260226.json`, `artifacts/observability/health-report-20260226.json`, `artifacts/observability/endpoint-smoke-20260226.json` |
| `docs/integrator-onboarding-evidence.md` | `artifacts/integrator/atlas-readiness-20260226.json`, `artifacts/integrator/atlas-query-root-20260226.json`, `artifacts/integrator/atlas-delegate-task-20260226.json` |
| `docs/launch-decision-packet.md` | `artifacts/release-evidence.json`, `artifacts/release-artifact-provenance.json` |
| `docs/post-decision-status-entry.md` | `artifacts/release-evidence.json` |

## Sign-Off

- Release Manager: `REL-ARTIFACT-INDEX-20260226-01` at `2026-02-26T21:00:00Z`
- Operations Owner: `OPS-ARTIFACT-INDEX-20260226-01` at `2026-02-26T21:00:00Z`
