// Types for the x/oracle (Terra-fork) REST query responses.
// REST base path: /clawchain/oracle/v1beta1

// GET /clawchain/oracle/v1beta1/denoms/exchange_rates
// exchange_rates is a DecCoins array: { denom, amount }
export interface OracleDecCoin {
  denom: string;
  amount: string;
}

export interface ExchangeRatesResponse {
  exchange_rates: OracleDecCoin[];
}

// GET /clawchain/oracle/v1beta1/denoms/actives
export interface ActivesResponse {
  actives: string[];
}

// GET /clawchain/oracle/v1beta1/params
export interface OracleDenom {
  name: string;
  tobin_tax: string;
}

export interface OracleParams {
  vote_period: string;
  vote_threshold: string;
  reward_band: string;
  reward_distribution_window: string;
  whitelist: OracleDenom[];
  slash_fraction: string;
  slash_window: string;
  min_valid_per_window: string;
}

export interface ParamsResponse {
  params: OracleParams;
}
