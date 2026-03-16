import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Tutorials',
      items: [
        'tutorials/getting-started',
        'tutorials/deploy-contract',
        'tutorials/create-dex-pool',
        'tutorials/build-agent-skill',
      ],
    },
    {
      type: 'category',
      label: 'Smart Contracts',
      items: [
        'smart-contracts/overview',
        'smart-contracts/cw20-token',
      ],
    },
    {
      type: 'category',
      label: 'Chain Modules',
      items: [
        'modules/overview',
        'modules/agent',
        'modules/privacy',
        'modules/marketplace',
        'modules/modelregistry',
        'modules/reputation',
        'modules/messaging',
        'modules/governance',
        'modules/oracle',
        'modules/ibc',
      ],
    },
    {
      type: 'category',
      label: 'Operations',
      items: [
        'modules/cli-reference',
        'modules/operator-guide',
      ],
    },
    {
      type: 'category',
      label: 'TypeScript SDK',
      items: [
        'sdk/overview',
        'sdk/agent',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/rest-api',
        'api/agent-api',
        'api/privacy-api',
        'api/marketplace-api',
        'api/modelregistry-api',
        'api/reputation-api',
        'api/messaging-api',
        'api/governance-api',
        'api/oracle-api',
        'api/dex-api',
      ],
    },
  ],
};

export default sidebars;
