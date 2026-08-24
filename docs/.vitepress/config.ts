import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Ratchet',
  description: 'RATher arCHEType, you can build something out of. TypeScript models -> Postgres schema, codegen, and composable pipelines.',
  base: '/ratchet/',
  cleanUrls: true,
  themeConfig: {
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
        ],
      },
      {
        text: 'Server',
        items: [
          { text: 'REST API', link: '/guide/router' },
          { text: 'Auth', link: '/guide/auth' },
          { text: 'Admin Panel', link: '/guide/admin' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/egig/ratchet' }],
    search: { provider: 'local' },
  },
});
