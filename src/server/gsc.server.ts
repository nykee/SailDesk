import { env } from 'cloudflare:workers';
import {
  completedDateRange,
  type DateRange,
  isValidDateRange,
  isWithinRetention,
  previousDateRange,
} from '@/features/gsc/date-range';
import {
  aggregateMetrics,
  aggregateTrend,
  subtractMetrics,
} from '@/features/gsc/metrics';
import { overviewProperties } from '@/features/gsc/property';
import type {
  OverviewReport,
  OverviewSite,
  SearchMetrics,
  SearchPerformance,
  SearchProperty,
  SearchReport,
  TrendPoint,
} from '@/features/gsc/types';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SITES_URL = 'https://www.googleapis.com/webmasters/v3/sites';
const PROPERTY_CONCURRENCY = 4;

type GscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};
type GscResponse = {
  rows?: GscRow[];
  metadata?: { firstIncompleteDate?: string };
};
type Probe =
  | { status: 'ready'; property: SearchProperty; firstIncompleteDate?: string }
  | { status: 'error'; property: SearchProperty; error: string };

/** Lists precisely the resources authorized for the configured Google account. */
export async function listProperties(): Promise<SearchProperty[]> {
  return propertiesWithToken(await getGoogleAccessToken());
}

/**
 * One refresh per HTTP request, with a bounded number of properties in flight.
 * Google's completion metadata defines equal-length finalized windows for every
 * site. A failed site is visible and invalidates totals; it is never zero traffic.
 */
export async function getOverview(
  requestedRange: DateRange
): Promise<OverviewReport> {
  validateRange(requestedRange);
  const token = await getGoogleAccessToken();
  const { included, excluded } = overviewProperties(
    await propertiesWithToken(token)
  );
  const probes = await mapProperties(
    included,
    async (property): Promise<Probe> => {
      try {
        const result = await searchAnalytics(
          token,
          property.siteUrl,
          requestedRange,
          ['date'],
          'all'
        );
        return {
          status: 'ready',
          property,
          firstIncompleteDate: result.metadata?.firstIncompleteDate,
        };
      } catch (error) {
        return { status: 'error', property, error: publicGoogleError(error) };
      }
    }
  );
  const range = completedDateRange(
    requestedRange,
    probes.flatMap((probe) =>
      probe.status === 'ready' && probe.firstIncompleteDate
        ? [probe.firstIncompleteDate]
        : []
    )
  );
  // Validate the common aligned window once, before any per-property requests.
  validateRange(range);
  const sites = await mapProperties(
    probes,
    async (probe): Promise<OverviewSite> => {
      if (probe.status === 'error') return probe;
      try {
        return {
          status: 'ready',
          property: probe.property,
          performance: await propertyPerformance(
            token,
            probe.property.siteUrl,
            range,
            requestedRange
          ),
        };
      } catch (error) {
        return {
          status: 'error',
          property: probe.property,
          error: publicGoogleError(error),
        };
      }
    }
  );
  const performances = sites.flatMap((site) =>
    site.status === 'ready' ? [site.performance] : []
  );
  const totals =
    sites.length > 0 && performances.length === sites.length
      ? portfolioPerformance(performances, range, requestedRange)
      : null;
  return {
    requestedRange,
    range,
    sites,
    excludedProperties: excluded,
    totals,
    fetchedAt: new Date().toISOString(),
  };
}

/** Single-property details use the same period alignment and metric rules. */
export async function getReport(
  siteUrl: string,
  requestedRange: DateRange
): Promise<SearchReport> {
  validateRange(requestedRange);
  const token = await getGoogleAccessToken();
  const probe = await searchAnalytics(
    token,
    siteUrl,
    requestedRange,
    ['date'],
    'all'
  );
  const range = completedDateRange(
    requestedRange,
    probe.metadata?.firstIncompleteDate
      ? [probe.metadata.firstIncompleteDate]
      : []
  );
  validateRange(range);
  const [performance, queries, pages] = await Promise.all([
    propertyPerformance(token, siteUrl, range, requestedRange),
    searchAnalytics(token, siteUrl, range, ['query'], 'final', 25),
    searchAnalytics(token, siteUrl, range, ['page'], 'final', 25),
  ]);
  return {
    ...performance,
    queries: (queries.rows ?? []).map((row) => ({
      query: row.keys?.[0] ?? '(未命名查询)',
      ...metricsFromRow(row),
    })),
    pages: (pages.rows ?? []).map((row) => ({
      page: row.keys?.[0] ?? '(未知页面)',
      ...metricsFromRow(row),
    })),
  };
}

/** Lists precisely the resources authorized for the configured Google account. */
export async function propertiesWithToken(
  token: string
): Promise<SearchProperty[]> {
  const response = await googleFetch(token, SITES_URL);
  const payload = (await response.json()) as { siteEntry?: SearchProperty[] };
  return (payload.siteEntry ?? []).sort((a, b) =>
    a.siteUrl.localeCompare(b.siteUrl)
  );
}

/**
 * Date is an exhaustive partition of each property (unlike privacy-filtered
 * keywords). Fetch both windows in one request, then sum clicks/impressions and
 * weight position by impressions. This is the exact aggregate of disjoint daily
 * groups, not an average of averages. With 19 sites the whole overview uses 40
 * Google requests, within the Workers free-plan subrequest limit of 50.
 */
async function propertyPerformance(
  token: string,
  siteUrl: string,
  range: DateRange,
  requestedRange: DateRange
): Promise<SearchPerformance> {
  const previous = previousDateRange(range);
  const dates = await searchAnalytics(
    token,
    siteUrl,
    { startDate: previous.startDate, endDate: range.endDate },
    ['date']
  );
  const points = toTrend(dates.rows ?? []);
  const current = points.filter(
    (point) => point.date >= range.startDate && point.date <= range.endDate
  );
  const prior = points.filter(
    (point) =>
      point.date >= previous.startDate && point.date <= previous.endDate
  );
  const metrics = aggregateMetrics(current);
  const previousMetrics = aggregateMetrics(prior);
  return {
    siteUrl,
    requestedRange,
    ...range,
    metrics,
    previousMetrics,
    deltas: subtractMetrics(metrics, previousMetrics),
    trend: aggregateTrend([current], range),
    previousTrend: aggregateTrend([prior], previous),
  };
}

/** Portfolio position is explicitly impression-weighted across disjoint scopes. */
function portfolioPerformance(
  reports: SearchPerformance[],
  range: DateRange,
  requestedRange: DateRange
): SearchPerformance {
  const metrics = aggregateMetrics(reports.map((report) => report.metrics));
  const previousMetrics = aggregateMetrics(
    reports.map((report) => report.previousMetrics)
  );
  return {
    siteUrl: '',
    requestedRange,
    ...range,
    metrics,
    previousMetrics,
    deltas: subtractMetrics(metrics, previousMetrics),
    trend: aggregateTrend(
      reports.map((report) => report.trend),
      range
    ),
    previousTrend: aggregateTrend(
      reports.map((report) => report.previousTrend),
      previousDateRange(range)
    ),
  };
}

async function searchAnalytics(
  token: string,
  siteUrl: string,
  range: DateRange,
  dimensions: Array<'date' | 'query' | 'page'>,
  dataState: 'final' | 'all' = 'final',
  rowLimit = 1_000
): Promise<GscResponse> {
  const response = await googleFetch(
    token,
    `${SITES_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...range,
        dimensions,
        rowLimit,
        dataState,
        type: 'web',
      }),
    }
  );
  return response.json();
}

/** Keep refresh credentials server-side and reuse only this request's token. */
export async function getGoogleAccessToken(): Promise<string> {
  const response = await googleRequest(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
      refresh_token: requiredEnv('GSC_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    console.error('[gsc] token refresh failed', {
      status: response.status,
      error: payload,
      clientIdSuffix: requiredEnv('GOOGLE_OAUTH_CLIENT_ID').slice(-24),
      refreshTokenLength: requiredEnv('GSC_REFRESH_TOKEN').length,
    });
    throw new GscError(
      502,
      payload.error_description ??
        'Google 授权刷新失败，请重新生成 refresh token。'
    );
  }
  return payload.access_token;
}

/** Google auth failure must not be confused with dashboard-session 401. */
export async function googleFetch(
  token: string,
  input: string,
  init?: RequestInit,
  apiLabel = 'Google Search Console'
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${token}`);
  const response = await googleRequest(input, { ...init, headers });
  if (!response.ok) {
    const body = (await response.json()) as { error?: { message?: string } };
    if (response.status === 401)
      console.error('[google] unauthorized', {
        url: input,
        tokenLength: token.length,
        tokenPrefix: token.slice(0, 12),
        body,
      });
    throw new GscError(
      response.status === 401 ? 502 : response.status,
      body.error?.message ?? `${apiLabel} 请求失败。`
    );
  }
  return response;
}

/** Bound upstream latency and report network failures at the API boundary. */
async function googleRequest(
  input: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    )
      throw new GscError(504, 'Google 请求超时，请检查网络连接后重试。');
    throw new GscError(
      502,
      '无法连接 Google API。若在本地开发，请检查代理的 TUN 模式。'
    );
  }
}

/** Deterministic batches limit Google concurrency without retries or partial zeroes. */
async function mapProperties<T, R>(
  items: T[],
  map: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += PROPERTY_CONCURRENCY)
    results.push(
      ...(await Promise.all(
        items.slice(start, start + PROPERTY_CONCURRENCY).map(map)
      ))
    );
  return results;
}

function toTrend(rows: GscRow[]): TrendPoint[] {
  return rows.flatMap((row) =>
    row.keys?.[0] ? [{ date: row.keys[0], ...metricsFromRow(row) }] : []
  );
}

/** GSC omits zero-valued metrics and rows with no search activity. */
function metricsFromRow(row?: GscRow): SearchMetrics {
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

function validateRange(range: DateRange): void {
  if (!isValidDateRange(range)) throw new GscError(400, '日期范围无效。');
  if (!isWithinRetention(range))
    throw new GscError(
      400,
      '当前与上一周期必须完整落在 Search Console 最近 16 个月的数据范围内，请缩短日期范围。'
    );
}

function requiredEnv(name: keyof Cloudflare.Env): string {
  const value = env[name];
  if (typeof value !== 'string' || !value)
    throw new GscError(503, `缺少 ${name} Cloudflare Secret。`);
  return value;
}

function publicGoogleError(error: unknown): string {
  return error instanceof GscError
    ? error.message
    : 'Google 返回了无法解析的数据，请重试。';
}

/** Only these expected errors are safe to return to the dashboard. */
export class GscError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
