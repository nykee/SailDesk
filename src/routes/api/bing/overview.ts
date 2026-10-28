import { createFileRoute } from '@tanstack/react-router';
import { getBingOverview } from '@/server/bing.server';
import { requireDashboardSession } from '@/server/dashboard-auth.server';
import { apiErrorResponse, privateJson } from '@/server/http.server';

/** Bing loads in its own request so it stays clear of the Google subrequest cap. */
export const Route = createFileRoute('/api/bing/overview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireDashboardSession(request);
          return privateJson(await getBingOverview());
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
    },
  },
});
