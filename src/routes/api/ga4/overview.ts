import { createFileRoute } from '@tanstack/react-router';
import { requireDashboardSession } from '@/server/dashboard-auth.server';
import { getGa4Overview } from '@/server/ga4.server';
import {
  apiErrorResponse,
  privateJson,
  requestDateRange,
} from '@/server/http.server';

/** GA4 loads in its own request so both Google APIs stay inside subrequest caps. */
export const Route = createFileRoute('/api/ga4/overview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireDashboardSession(request);
          return privateJson(await getGa4Overview(requestDateRange(request)));
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
    },
  },
});
