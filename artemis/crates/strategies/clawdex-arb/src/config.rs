//! Configuration for the ClawDEX arbitrage strategy.
//!
//! All tunables live here so operators can adjust behaviour without touching
//! strategy logic.  The [`ClawDexConfig`] struct is `Serialize + Deserialize`
//! so it can be loaded from a TOML/JSON file or built programmatically.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

/// Default ClawChain LCD (REST) endpoint.
pub const DEFAULT_REST_URL: &str = "http://localhost:1317";

/// Default ClawChain RPC (CometBFT) endpoint.
pub const DEFAULT_RPC_URL: &str = "http://localhost:26657";

/// Default swap fee for ClawDEX XYK pools (0.3%).
pub const DEFAULT_FEE_RATE: f64 = 0.003;

/// Default minimum profit threshold in uclaw.
pub const DEFAULT_MIN_PROFIT_UCLAW: u64 = 1_000;

/// Default maximum single-trade size in uclaw.
pub const DEFAULT_MAX_TRADE_UCLAW: u64 = 1_000_000_000;

/// Default gas price in uclaw per gas unit.
pub const DEFAULT_GAS_PRICE_UCLAW: f64 = 0.025;

/// Default gas budget for a two-leg swap transaction.
pub const DEFAULT_GAS_LIMIT_TWO_LEG: u64 = 400_000;

/// Default gas budget for a three-leg swap transaction.
pub const DEFAULT_GAS_LIMIT_THREE_LEG: u64 = 600_000;

/// Default slippage tolerance (1%).
pub const DEFAULT_MAX_SLIPPAGE: f64 = 0.01;

/// Default poll interval in milliseconds.
pub const DEFAULT_POLL_INTERVAL_MS: u64 = 1_000;

/// Bond denomination on ClawChain.
pub const BOND_DENOM: &str = "uclaw";

// ---------------------------------------------------------------------------
// Config struct
// ---------------------------------------------------------------------------

/// Full configuration for the ClawDEX arbitrage strategy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClawDexConfig {
    // -- Endpoints ----------------------------------------------------------

    /// ClawChain REST (LCD) endpoint.
    pub rest_url: String,

    /// ClawChain RPC endpoint.
    pub rpc_url: String,

    // -- Contract addresses -------------------------------------------------

    /// Address of the ClawDEX factory contract (used for pool discovery).
    pub factory_address: String,

    /// Address of the ClawDEX router contract (used for multi-hop swaps).
    pub router_address: String,

    /// Explicit pool contract addresses to monitor.
    /// When empty the strategy discovers pools from the factory.
    pub pool_addresses: Vec<String>,

    // -- Account ------------------------------------------------------------

    /// Sender (signer) bech32 address.
    pub sender_address: String,

    // -- Economics ----------------------------------------------------------

    /// Minimum profit threshold in uclaw (after gas).
    pub min_profit_uclaw: u64,

    /// Maximum single-trade size in uclaw.
    pub max_trade_uclaw: u64,

    /// Gas price used for profit calculations (uclaw per gas unit).
    pub gas_price: f64,

    /// Gas limit for a two-leg arb transaction.
    pub gas_limit_two_leg: u64,

    /// Gas limit for a three-leg arb transaction.
    pub gas_limit_three_leg: u64,

    /// Maximum slippage tolerance (fraction, e.g. 0.01 = 1%).
    pub max_slippage: f64,

    /// Default swap fee rate (fraction, e.g. 0.003 = 0.3%).
    pub fee_rate: f64,

    // -- Behaviour ----------------------------------------------------------

    /// Poll interval in milliseconds.
    pub poll_interval_ms: u64,

    /// When true, compute opportunities but skip broadcast.
    pub dry_run: bool,

    /// Enable three-leg (triangular) arbitrage scanning.
    pub enable_three_leg: bool,
}

impl Default for ClawDexConfig {
    fn default() -> Self {
        Self {
            rest_url: DEFAULT_REST_URL.to_string(),
            rpc_url: DEFAULT_RPC_URL.to_string(),
            factory_address: String::new(),
            router_address: String::new(),
            pool_addresses: vec![],
            sender_address: String::new(),
            min_profit_uclaw: DEFAULT_MIN_PROFIT_UCLAW,
            max_trade_uclaw: DEFAULT_MAX_TRADE_UCLAW,
            gas_price: DEFAULT_GAS_PRICE_UCLAW,
            gas_limit_two_leg: DEFAULT_GAS_LIMIT_TWO_LEG,
            gas_limit_three_leg: DEFAULT_GAS_LIMIT_THREE_LEG,
            max_slippage: DEFAULT_MAX_SLIPPAGE,
            fee_rate: DEFAULT_FEE_RATE,
            poll_interval_ms: DEFAULT_POLL_INTERVAL_MS,
            dry_run: true,
            enable_three_leg: false,
        }
    }
}

impl ClawDexConfig {
    /// Estimate the gas cost in uclaw for a given gas limit.
    pub fn gas_cost(&self, gas_limit: u64) -> u64 {
        (self.gas_price * gas_limit as f64).ceil() as u64
    }

    /// Gas cost for a two-leg arb.
    pub fn two_leg_gas_cost(&self) -> u64 {
        self.gas_cost(self.gas_limit_two_leg)
    }

    /// Gas cost for a three-leg arb.
    pub fn three_leg_gas_cost(&self) -> u64 {
        self.gas_cost(self.gas_limit_three_leg)
    }

    /// Validate that required fields are set.
    pub fn validate(&self) -> Result<(), String> {
        if self.rest_url.is_empty() {
            return Err("rest_url is required".to_string());
        }
        if self.sender_address.is_empty() && !self.dry_run {
            return Err("sender_address is required when dry_run is false".to_string());
        }
        if self.factory_address.is_empty() && self.pool_addresses.is_empty() {
            return Err(
                "either factory_address or pool_addresses must be set".to_string(),
            );
        }
        if self.fee_rate < 0.0 || self.fee_rate >= 1.0 {
            return Err("fee_rate must be in [0, 1)".to_string());
        }
        if self.max_slippage < 0.0 || self.max_slippage >= 1.0 {
            return Err("max_slippage must be in [0, 1)".to_string());
        }
        Ok(())
    }
}
