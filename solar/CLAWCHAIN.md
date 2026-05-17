# ClawChain Integration

Solar is a Solidity compiler. ClawChain is a Cosmos SDK blockchain that
executes smart contracts through **CosmWasm** (WebAssembly), not the EVM.
Solar does not compile contracts *for* ClawChain directly -- instead it helps
Solidity developers **understand type mappings** and structural patterns when
porting EVM contracts to Rust/CosmWasm.

## Why this exists

Many DeFi and agent-economy contracts begin life in Solidity. When teams decide
to deploy on ClawChain they need to rewrite those contracts in Rust targeting
the CosmWasm runtime. Solar can:

1. **Parse the original Solidity source** to extract the ABI, storage layout,
   and type signatures.
2. **Provide a type-mapping reference** (`crates/clawchain/src/abi_compat.rs`)
   that documents how each Solidity type translates to its CosmWasm equivalent.
3. **Inspect compiled CosmWasm WASM binaries** (`crates/cosmwasm-inspector/`)
   to verify entry points, checksums, and size before deployment.

## Quick reference

| Solidity         | CosmWasm / Rust        | JSON schema | Notes                              |
|------------------|------------------------|-------------|------------------------------------|
| `uint256`        | `Uint256`              | `string`    | Decimal string in JSON             |
| `uint128`        | `Uint128`              | `string`    | Decimal string in JSON             |
| `address`        | `String`               | `string`    | Bech32 with prefix `claw`          |
| `bool`           | `bool`                 | `boolean`   | Direct mapping                     |
| `string`         | `String`               | `string`    | Direct mapping                     |
| `bytes` / `bytesN` | `Binary`             | `string`    | Base64-encoded                     |
| `T[]`            | `Vec<T>`               | `array`     | Dynamic array                      |
| `mapping(K=>V)`  | `Map<K,V>`             | n/a         | cw-storage-plus; storage only      |
| `msg.sender`     | `info.sender`          | --          | `Addr` (bech32)                    |
| `msg.value`      | `info.funds`           | --          | `Vec<Coin>`                        |
| `block.number`   | `env.block.height`     | --          | `u64`                              |
| `block.timestamp`| `env.block.time`       | --          | `Timestamp` (nanos)                |

See `crates/clawchain/src/abi_compat.rs` for the full table with notes.

## Crate layout

```
crates/clawchain/
  Cargo.toml            -- minimal deps: serde, serde_json
  src/
    lib.rs              -- crate root
    config.rs           -- network configs (local, testnet, mainnet)
    abi_compat.rs       -- Solidity-to-CosmWasm type mapping table
```

## ClawChain network endpoints

| Network   | Chain ID              | RPC                                 | REST                                 |
|-----------|-----------------------|-------------------------------------|--------------------------------------|
| Local     | `clawchain-local`     | `http://localhost:26657`            | `http://localhost:1317`              |
| Testnet   | `clawchain-testnet-1` | `https://rpc.testnet.clawchain.com` | `https://rest.testnet.clawchain.com` |
| Mainnet   | `clawchain-1`         | `https://rpc.clawchain.com`         | `https://rest.clawchain.com`         |

Bond denom: `uclaw` (micro-CLAW). Bech32 prefix: `claw`.

## Typical porting workflow

1. Run `solar --emit abi MyContract.sol` to extract the Solidity ABI.
2. For each function and event, use the type-mapping table to write the
   equivalent `ExecuteMsg` / `QueryMsg` variants in Rust.
3. Replace `mapping(...)` state with `cw_storage_plus::Map` items.
4. Replace `msg.sender` with `info.sender`, `msg.value` with `info.funds`.
5. Build with `cargo wasm`, optimize with `cosmwasm/optimizer`.
6. Use `cosmwasm-inspector` to verify the WASM binary before deploying.
7. Deploy to ClawChain with `clawchaind tx wasm store contract.wasm`.

## Related crates

- `crates/cosmwasm-inspector` -- WASM binary analysis and checksum verification
- `crates/clawchain` -- this integration crate (network config + type mappings)
