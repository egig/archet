import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Ratchet',
  description: 'RATher an arCHEType — general-purpose backend tools for TypeScript and Postgres: schema codegen, a REST API, auth, a console, and composable pipelines.',
  base: '/ratchet/',
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/ratchet/favicon.png' }],
  ],
  themeConfig: {
    logo: { light: '/logo.png', dark: '/logo-dark.png', alt: 'Ratchet' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'GitHub', link: 'https://github.com/egig/ratchet' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'CLI Reference', link: '/guide/cli' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Models & Fields', link: '/guide/models' },
          { text: 'Pipelines', link: '/guide/pipelines' },
          { text: 'Custom Operations', link: '/guide/custom-operations' },
        ],
      },
      {
        text: 'Server',
        items: [
          { text: 'REST API', link: '/guide/router' },
          { text: 'Auth', link: '/guide/auth' },
          { text: 'Console', link: '/guide/console' },
          { text: 'Deploying', link: '/guide/deploy' },
        ],
      },
      {
        text: 'Project',
        items: [{ text: 'Changelog', link: '/guide/changelog' }],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/egig/ratchet' }],
    search: { provider: 'local' },
  },
});
