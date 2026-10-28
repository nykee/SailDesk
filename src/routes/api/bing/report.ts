import { createFileRoute } from '@tanstack/react-router';
import { getBingReport } from '@/server/bing.server';
import { requireDashboardSession } from '@/server/dashboard-auth.server';
import { GscError } from '@/server/gsc.server';
import { apiErrorResponse, privateJson } from '@/server/http.server';

/** Single-site Bing details share the private session rules. */
export const Route = createFileRoute('/api/bing/report')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireDashboardSession(request);
          const siteUrl =
            new URL(request.url).searchParams.get('siteUrl') ?? '';
          if (!siteUrl) throw new GscError(400, '请提供 siteUrl 参数。');
          return privateJson(await getBingReport(siteUrl));
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
    },
  },
});
