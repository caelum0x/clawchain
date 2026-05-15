import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'ClawChain Docs',
  tagline: 'Build on the AI-native blockchain',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://docs.clawchain.io',
  baseUrl: '/',

  organizationName: 'clawchain',
  projectName: 'clawchain',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/clawchain/clawchain/tree/main/docs-site/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/clawchain-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'ClawChain',
      logo: {
        alt: 'ClawChain Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/docs/api/rest-api',
          label: 'API Reference',
          position: 'left',
        },
        {
          to: '/docs/sdk/overview',
          label: 'SDK',
          position: 'left',
        },
        {
          href: 'https://github.com/clawchain/clawchain',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/intro',
            },
            {
              label: 'Smart Contracts',
              to: '/docs/smart-contracts/overview',
            },
            {
              label: 'Modules',
              to: '/docs/modules/overview',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Discord',
              href: 'https://discord.gg/clawchain',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/clawchain',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/clawchain/clawchain',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'SDK Reference',
              to: '/docs/sdk/overview',
            },
            {
              label: 'REST API',
              to: '/docs/api/rest-api',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} ClawChain. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript', 'rust', 'toml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
