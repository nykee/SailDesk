import { createFileRoute } from '@tanstack/react-router';
import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { websiteConfig } from '@/config/website';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: websiteConfig.name },
      {
        name: 'description',
        content:
          'Search Console, GA4 and Bing Webmaster performance for every verified property, in one dashboard.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: DashboardPage,
});
