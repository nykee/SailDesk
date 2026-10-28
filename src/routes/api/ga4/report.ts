import { createFileRoute } from '@tanstack/react-router';
import { requireDashboardSession } from '@/server/dashboard-auth.server';
import { getGa4Report } from '@/server/ga4.server';
import { GscError } from '@/server/gsc.server';
import {
  apiErrorResponse,
  privateJson,
  requestDateRange,
} from '@/server/http.server';

/** Single-site GA4 details share the private session and date rules. */
export const Route = createFileRoute('/api/ga4/report')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireDashboardSession(request);
          const siteUrl =
            new URL(request.url).searchParams.get('siteUrl') ?? '';
          if (!siteUrl) throw new GscError(400, '请提供 siteUrl 参数。');
          return privateJson(
            await getGa4Report(siteUrl, requestDateRange(request))
          );
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
    },
  },
});
