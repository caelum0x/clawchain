
# Paradigm Data Portal

The Paradigm Data Portal is a collection of open source crypto datasets for researchers and tool builders

## Datasets

### ClawChain

ClawChain is a Cosmos SDK blockchain with AI agent orchestration, privacy pools, and an on-chain oracle. The following datasets are collected directly from ClawChain node endpoints:

- [`clawchain_blocks`](datasets/clawchain_blocks): block-level data (height, time, hash, proposer, tx_count, gas_used)
- [`clawchain_transactions`](datasets/clawchain_transactions): transaction-level data (height, hash, code, gas, messages)
- [`clawchain_agents`](datasets/clawchain_agents): registered agents (address, name, status, reputation)
- [`clawchain_prices`](datasets/clawchain_prices): oracle price feeds (denom_pair, price, timestamp)
- [`clawchain_privacy`](datasets/clawchain_privacy): privacy pool statistics (shielded amounts, commitment count)

Configure endpoints via environment variables:
```bash
export CLAWCHAIN_RPC_URL=http://localhost:26657   # CometBFT RPC
export CLAWCHAIN_REST_URL=http://localhost:1317    # Cosmos REST / LCD
```

Collect ClawChain data:
```bash
pdp collect clawchain_blocks --blocks 1:1000
pdp collect clawchain_agents
```

Or use the Python API directly:
```python
from pdp.datasets.clawchain import collect_blocks, ClawchainClient

client = ClawchainClient(rpc_url="https://rpc.clawchain.io")
blocks = collect_blocks(start_height=1, end_height=100, client=client)
```

### Ethereum

- [`ethereum_contracts`](https://github.com/paradigmxyz/paradigm-data-portal/tree/main/datasets/ethereum_contracts): all historical contract deployments
- [`ethereum_native_transfers`](https://github.com/paradigmxyz/paradigm-data-portal/tree/main/datasets/ethereum_native_transfers): all native transfers in similar format to ERC20 Transfers (excluding tx fees)
- [`ethereum_slots`](https://github.com/paradigmxyz/paradigm-data-portal/tree/main/datasets/ethereum_slots): all slots of each contract, including historical usage metadata

All datasets are released under a [CC0](https://creativecommons.org/share-your-work/public-domain/cc0/) license into the public domain unless otherwise noted.

## `pdp`

`pdp` is a CLI tool that can be used to obtain and manage PDP datasets

To install: `pip install paradigm-data-portal`


#### Example Usage

- List available datasets `pdp ls`
- List dataset files `pdp ls <dataset_name>`
- Download a dataset `pdp download <dataset_name>`
- Collect ClawChain blocks `pdp collect clawchain_blocks`
- Collect ClawChain agents `pdp collect clawchain_agents`

Each command has multiple options, view help with `pdp <command> -h`


## Dataset Versioning

Every dataset has a version in `<major>.<minor>.<patch>` format, e.g. `1.2.8`
- when a schema is updated, the major version is increased
- when rows are added, removed, or modified, the minor version is increased
- when rows are added due to new blocks, the patch is increased

Updates will be documented in dataset changelogs

