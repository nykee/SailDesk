import { createFileRoute } from '@tanstack/react-router';
import { clearDashboardSession } from '@/server/dashboard-auth.server';

/** Logout is a same-origin POST so a third party cannot clear a private session. */
export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get('origin');
        if (!origin || origin !== new URL(request.url).origin)
          return Response.json({ error: '无效的请求来源。' }, { status: 403 });
        const headers = new Headers({ 'cache-control': 'no-store' });
        headers.append('set-cookie', clearDashboardSession());
        return new Response(null, { status: 204, headers });
      },
    },
  },
});
