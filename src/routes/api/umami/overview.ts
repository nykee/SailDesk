import { createFileRoute } from '@tanstack/react-router';
import { requireDashboardSession } from '@/server/dashboard-auth.server';
import {
  apiErrorResponse,
  privateJson,
  requestDateRange,
} from '@/server/http.server';
import { getUmamiOverview } from '@/server/umami.server';

/**
 * Portfolio-wide Umami traffic. It lives in its own endpoint because each site
 * costs two upstream calls, and sharing a request with Search Console would
 * exceed the Workers subrequest budget.
 */
export const Route = createFileRoute('/api/umami/overview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireDashboardSession(request);
          return privateJson(await getUmamiOverview(requestDateRange(request)));
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
    },
  },
});
