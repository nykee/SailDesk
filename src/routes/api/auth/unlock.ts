import { createFileRoute } from '@tanstack/react-router';
import {
  DashboardAuthError,
  unlockDashboard,
} from '@/server/dashboard-auth.server';

/** Creates a private dashboard session after a same-origin password submission. */
export const Route = createFileRoute('/api/auth/unlock')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOrigin(request))
          return Response.json({ error: '无效的请求来源。' }, { status: 403 });
        const body = (await request.json().catch(() => null)) as {
          password?: unknown;
        } | null;
        if (typeof body?.password !== 'string' || !body.password)
          return Response.json({ error: '请输入访问密码。' }, { status: 400 });
        try {
          return Response.json(
            { ok: true },
            {
              headers: {
                'set-cookie': await unlockDashboard(body.password),
                'cache-control': 'no-store',
              },
            }
          );
        } catch (error) {
          const status =
            error instanceof DashboardAuthError ? error.status : 500;
          return Response.json(
            {
              error: error instanceof Error ? error.message : '无法解锁看板。',
            },
            { status, headers: { 'cache-control': 'no-store' } }
          );
        }
      },
    },
  },
});

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}
