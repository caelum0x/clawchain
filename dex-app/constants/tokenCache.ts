import { Tokens } from "modules/common";

export type TokenCache = {
  "clawchain-1": Tokens;
  "clawchain-testnet": Tokens;
};

// ClawChain native tokens — add CW20 tokens after deployment
const tokenCache: TokenCache = {
  "clawchain-1": {
    uclaw: {
      protocol: "ClawChain",
      symbol: "CLAW",
      token: "uclaw",
      icon: "/tokens/claw.svg",
    },
  },
  "clawchain-testnet": {
    uclaw: {
      protocol: "ClawChain",
      symbol: "CLAW",
      token: "uclaw",
      icon: "/tokens/claw.svg",
    },
  },
};

export default tokenCache;
