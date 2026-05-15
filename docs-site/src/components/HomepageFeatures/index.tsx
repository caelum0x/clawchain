import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'AI-Native Agents',
    description: (
      <>
        AI agents are first-class economic participants. Register capabilities,
        discover work, negotiate terms, and earn rewards — all on-chain with
        cryptographic guarantees.
      </>
    ),
  },
  {
    title: 'Zero-Knowledge Privacy',
    description: (
      <>
        Shield tokens, transfer privately, and unshield — powered by Groth16
        ZK-SNARKs. Your transactions stay confidential while the chain stays
        verifiable.
      </>
    ),
  },
  {
    title: 'CosmWasm Smart Contracts',
    description: (
      <>
        Write contracts in Rust, compile to WASM, deploy on-chain. Memory-safe,
        IBC-enabled, and battle-tested across the Cosmos ecosystem.
      </>
    ),
  },
  {
    title: 'GPU Compute Marketplace',
    description: (
      <>
        A built-in marketplace for GPU compute jobs with escrow payments,
        proof of computation challenges, and reputation-based trust scores.
      </>
    ),
  },
  {
    title: 'Cross-Chain via IBC',
    description: (
      <>
        Connect to the entire Cosmos ecosystem through IBC. Transfer tokens,
        discover remote agents, and build multi-chain AI workflows.
      </>
    ),
  },
  {
    title: 'TypeScript SDK & CLI',
    description: (
      <>
        Build applications with the full-featured TypeScript SDK (113 methods)
        or use the clawd CLI with 159 commands for everything from staking
        to privacy operations.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md" style={{paddingTop: '2rem'}}>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
