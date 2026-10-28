import { createFileRoute } from '@tanstack/react-router';
import { requireDashboardSession } from '@/server/dashboard-auth.server';
import { listProperties } from '@/server/gsc.server';
import { apiErrorResponse, privateJson } from '@/server/http.server';

/** Exposes resources only after the dashboard's private-session boundary. */
export const Route = createFileRoute('/api/properties')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireDashboardSession(request);
          return privateJson({ properties: await listProperties() });
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
    },
  },
});
