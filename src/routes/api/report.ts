import { createFileRoute } from '@tanstack/react-router';
import { requireDashboardSession } from '@/server/dashboard-auth.server';
import { GscError, getReport } from '@/server/gsc.server';
import {
  apiErrorResponse,
  privateJson,
  requestDateRange,
} from '@/server/http.server';

/** Authenticate before validating/reporting anything about private GSC data. */
export const Route = createFileRoute('/api/report')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireDashboardSession(request);
          const siteUrl = new URL(request.url).searchParams.get('siteUrl');
          if (!siteUrl) throw new GscError(400, 'siteUrl 是必填项。');
          return privateJson(
            await getReport(siteUrl, requestDateRange(request))
          );
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
    },
  },
});
