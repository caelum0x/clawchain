// Types for the Token Factory explorer tab.
//
// The chain's x/tokenfactory module exposes NO query server (no Params/DenomsFromCreator/
// DenomAuthorityMetadata gRPC queries — see docs/known-issues/tokenfactory-no-query-server.md).
// Factory denoms are minted into bank, so the tab enumerates them from the standard,
// implemented bank supply endpoint instead: GET /cosmos/bank/v1beta1/supply.

export interface Coin {
  denom: string;
  amount: string;
}

export interface SupplyResponse {
  supply: Coin[];
  pagination?: { next_key: string | null; total: string };
}

// A bank-supply coin whose denom is a tokenfactory denom (factory/<creator>/<subdenom>),
// parsed into its parts for display.
export interface FactoryDenom {
  denom: string;
  creator: string;
  subdenom: string;
  amount: string;
}
