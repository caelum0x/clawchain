export type BlockchainConfig = {
  /** Enable the blockchain subsystem. */
  enabled?: boolean;
  /** Tendermint/CometBFT RPC URL (default: "http://localhost:26657"). */
  rpcUrl?: string;
  /** Cosmos REST/LCD URL for query endpoints. */
  restUrl?: string;
  /** BIP-39 mnemonic for the agent keypair. Falls back to BLOCKCHAIN_MNEMONIC env or ~/.clawd/mnemonic.enc. */
  mnemonic?: string;
  /** Native token denomination (default: "uclaw"). */
  denom?: string;
  /** Bech32 address prefix (default: "claw"). */
  prefix?: string;
  /** Gas price string, e.g. "0.025uclaw". */
  gasPrice?: string;
  /** Path to the clawproof ZK proof binary. */
  proofBinaryPath?: string;
  /** Directory for storing key material. */
  keysDir?: string;
  /** Automatically register the agent on-chain at startup (default: true). */
  autoRegister?: boolean;
  /** Public endpoint for this agent's messaging server (e.g. "http://myhost:7777"). */
  messagingEndpoint?: string;
  /** Chain node process management options. */
  node?: {
    /** Spawn clawchaind automatically if no running node is detected (default: false). */
    autoStart?: boolean;
    /** Path to the clawchaind binary. Falls back to CLAWCHAIND_PATH env or "clawchaind" on PATH. */
    binaryPath?: string;
    /** --home directory for chain data (default: ~/.clawchain). */
    home?: string;
  };
  /** Token faucet options. */
  faucet?: {
    /** Enable the faucet server (default: false). */
    enabled?: boolean;
    /** Port for the faucet HTTP server (default: 8888). */
    port?: number;
    /** Amount to drip per request in base denomination (default: "10000000" = 10 CLAW). */
    dripAmount?: string;
    /** External faucet URL to use for requesting tokens (e.g. "http://seed-node:8888"). */
    url?: string;
  };
  /** Peer discovery options. */
  peers?: {
    /** Comma-separated seed addresses (format: "nodeID@IP:port,..."). */
    seeds?: string;
    /** Comma-separated persistent peer addresses. */
    persistentPeers?: string;
  };
  /** Agent heartbeat transaction options. */
  heartbeat?: {
    /** Enable periodic on-chain heartbeat actions (default: true). */
    enabled?: boolean;
    /** Heartbeat interval in seconds (default: 60, minimum: 15). */
    intervalSeconds?: number;
    /** Include node status snapshot in heartbeat payload (default: true). */
    includeNodeStatus?: boolean;
  };
  /** Autonomous agent loop options (discover, accept, execute, complete tasks). */
  autonomousLoop?: {
    /** Enable the autonomous agent loop (default: false). */
    enabled?: boolean;
    /** Whether to auto-accept pending tasks assigned to this agent (default: true). */
    autoAcceptTasks?: boolean;
    /** Maximum concurrent task executions (default: 3). */
    maxConcurrentTasks?: number;
    /** Poll interval in milliseconds (default: 30000). */
    pollIntervalMs?: number;
    /** Optional LLM endpoint for autonomous task execution. */
    llmEndpoint?: string;
  };
};
