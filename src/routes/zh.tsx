import { createFileRoute } from '@tanstack/react-router';
import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { websiteConfig } from '@/config/website';

export const Route = createFileRoute('/zh')({
  head: () => ({
    meta: [
      { title: websiteConfig.name },
      {
        name: 'description',
        content: '在一个工作台查看全部站点的搜索表现、GA4 流量与 Bing 数据。',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: DashboardPage,
});
