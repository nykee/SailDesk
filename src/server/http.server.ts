import { type DateRange, isValidDateRange } from '@/features/gsc/date-range';
import { DashboardAuthError } from './dashboard-auth.server';
import { GscError } from './gsc.server';

/** Shared validation prevents overview and single-site query rules from drifting. */
export function requestDateRange(request: Request): DateRange {
  const params = new URL(request.url).searchParams;
  const range = {
    startDate: params.get('startDate') ?? '',
    endDate: params.get('endDate') ?? '',
  };
  if (!isValidDateRange(range))
    throw new GscError(400, '请提供有效的 startDate 和 endDate。');
  return range;
}

/** Private responses must never be stored by browsers, CDNs or shared caches. */
export function privateJson(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'private, no-store');
  return Response.json(value, { ...init, headers });
}

/** Unexpected runtime messages stay on the server, rather than leaking internals. */
export function apiErrorResponse(error: unknown): Response {
  if (error instanceof GscError || error instanceof DashboardAuthError)
    return privateJson({ error: error.message }, { status: error.status });
  console.error('Dashboard API failed', error);
  return privateJson({ error: '数据请求失败，请重试。' }, { status: 500 });
}
