// Types for the x/tokenfactory (osmosis fork) REST query surface.
// Field names mirror the JSON tags emitted by the gRPC-gateway (snake_case),
// sourced from the osmosis tokenfactory query proto / pb.go.
// REST base: /osmosis/tokenfactory/v1beta1

export interface Coin {
  denom: string;
  amount: string;
}

// Params defines the parameters for the tokenfactory module.
export interface TokenfactoryParams {
  denom_creation_fee: Coin[];
}

// DenomAuthorityMetadata specifies the admin for a token factory denom.
export interface DenomAuthorityMetadata {
  admin: string;
}

export interface ParamsResponse {
  params: TokenfactoryParams;
}

export interface DenomsFromCreatorResponse {
  denoms: string[];
}

export interface DenomAuthorityMetadataResponse {
  authority_metadata: DenomAuthorityMetadata;
}
