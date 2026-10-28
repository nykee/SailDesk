export const websiteConfig = {
  name: 'SailDesk',
  description:
    'Self-hosted analytics desk for SaaS sites going global: Google Search Console, GA4 and Bing Webmaster in one view.',
  // Left null on purpose: seo.ts derives the canonical origin from the request,
  // so the committed config stays free of deployment-specific domains.
  url: null as string | null,
  repository: 'https://github.com/nykee/SailDesk',
  defaultTheme: 'dark' as const,
  themeStorageKey: 'saildesk-theme',
  colors: {
    background: '#0d0f12',
    theme: '#a6ff65',
  },
  manifest: {
    id: '/',
    startUrl: '/',
    scope: '/',
  },
  navigation: [
    { id: 'stack', labelKey: 'nav_stack' },
    { id: 'structure', labelKey: 'nav_structure' },
    { id: 'faq', labelKey: 'nav_faq' },
  ],
};
