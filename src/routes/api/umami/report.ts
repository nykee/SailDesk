import { createFileRoute } from '@tanstack/react-router';
import { requireDashboardSession } from '@/server/dashboard-auth.server';
import { GscError } from '@/server/gsc.server';
import {
  apiErrorResponse,
  privateJson,
  requestDateRange,
} from '@/server/http.server';
import { getUmamiReport } from '@/server/umami.server';

/** Single-site Umami details share the private session and date rules. */
export const Route = createFileRoute('/api/umami/report')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireDashboardSession(request);
          const siteUrl =
            new URL(request.url).searchParams.get('siteUrl') ?? '';
          if (!siteUrl) throw new GscError(400, '请提供 siteUrl 参数。');
          return privateJson(
            await getUmamiReport(siteUrl, requestDateRange(request))
          );
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
    },
  },
});
