import { createFileRoute } from '@tanstack/react-router';
import { requireDashboardSession } from '@/server/dashboard-auth.server';
import { getOverview } from '@/server/gsc.server';
import {
  apiErrorResponse,
  privateJson,
  requestDateRange,
} from '@/server/http.server';

/** Portfolio access uses the same private session as individual reports. */
export const Route = createFileRoute('/api/overview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireDashboardSession(request);
          return privateJson(await getOverview(requestDateRange(request)));
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
    },
  },
});
