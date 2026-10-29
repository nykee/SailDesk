import { env } from 'cloudflare:workers';
import { type DateRange, previousDateRange } from '@/features/gsc/date-range';
import { overviewProperties } from '@/features/gsc/property';
import type { SearchProperty } from '@/features/gsc/types';
import {
  umamiDeltas,
  umamiPortfolioPerformance,
} from '@/features/umami/metrics';
import type {
  UmamiEventRow,
  UmamiMetrics,
  UmamiOverviewReport,
  UmamiOverviewSite,
  UmamiPerformance,
  UmamiSiteReport,
  UmamiTrendPoint,
  UmamiWebsite,
} from '@/features/umami/types';
import {
  GscError,
  getGoogleAccessToken,
  propertiesWithToken,
} from './gsc.server';

/**
 * Umami Cloud and a self-hosted instance expose the same REST surface; only the
 * base path differs. Cloud uses `/v1`, a self-hosted server uses `/api`.
 */
const DEFAULT_BASE_URL = 'https://api.umami.is/v1';

declare global {
  namespace Cloudflare {
    interface Env {
      UMAMI_BASE_URL?: string;
      UMAMI_API_KEY?: string;
    }
  }
}

type UmamiWebsitePayload = {
  id: string;
  name: string;
  domain?: string;
};

type UmamiStatsPayload = {
  pageviews?: number;
  visitors?: number;
  visits?: number;
  bounces?: number;
  totaltime?: number;
};

type UmamiSeriesPayload = {
  pageviews?: Array<{ x?: string; y?: number }>;
  sessions?: Array<{ x?: string; y?: number }>;
};

type UmamiMetricPayload = Array<{ x?: string; y?: number }>;

type UmamiEventPayload = Array<{ eventName?: string; count?: number }>;

/**
 * A missing credential is an operator problem, not a user error, so it surfaces
 * as 503 with the exact variable name instead of an empty dashboard.
 */
function umamiConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = (env.UMAMI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey = env.UMAMI_API_KEY;
  if (!apiKey)
    throw new GscError(503, '缺少 UMAMI_API_KEY Cloudflare Secret。');
  return { baseUrl, apiKey };
}

async function umamiFetch<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const { baseUrl, apiKey } = umamiConfig();
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'x-umami-api-key': apiKey },
  });
  if (!response.ok)
    throw new GscError(
      502,
      `Umami 请求失败（HTTP ${response.status}），请检查实例地址与 API Key。`
    );
  return (await response.json()) as T;
}

/** Umami accepts millisecond bounds, inclusive on both ends. */
function rangeBounds(range: DateRange): { startAt: number; endAt: number } {
  return {
    startAt: Date.parse(`${range.startDate}T00:00:00.000Z`),
    endAt: Date.parse(`${range.endDate}T23:59:59.999Z`),
  };
}

/** Reduce a configured website domain to a comparable hostname. */
function normalizeHost(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const url = new URL(
      trimmed.includes('://') ? trimmed : `https://${trimmed}`
    );
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** GSC scopes carry either a hostname or an `sc-domain:` prefix. */
function siteHostname(siteUrl: string): string {
  const value = siteUrl.startsWith('sc-domain:') ? siteUrl.slice(10) : siteUrl;
  return normalizeHost(value);
}

/**
 * Match a GSC property to exactly one Umami website by hostname. A domain
 * property also accepts a subdomain website, because the property genuinely
 * covers it; the reverse is not true.
 */
function matchWebsite(
  siteUrl: string,
  websites: readonly UmamiWebsite[]
): UmamiWebsite | undefined {
  const host = siteHostname(siteUrl);
  if (!host) return undefined;
  const exact = websites.find(
    (website) => normalizeHost(website.domain) === host
  );
  if (exact) return exact;
  if (!siteUrl.startsWith('sc-domain:')) return undefined;
  return websites.find((website) => {
    const candidate = normalizeHost(website.domain);
    return candidate !== '' && candidate.endsWith(`.${host}`);
  });
}

export async function listUmamiWebsites(): Promise<UmamiWebsite[]> {
  const payload = await umamiFetch<UmamiWebsitePayload[]>('/websites');
  return payload.map((website) => ({
    websiteId: website.id,
    name: website.name,
    domain: website.domain ?? '',
  }));
}

async function umamiStats(
  websiteId: string,
  range: DateRange
): Promise<UmamiMetrics> {
  const payload = await umamiFetch<UmamiStatsPayload>(
    `/websites/${encodeURIComponent(websiteId)}/stats`,
    rangeBounds(range)
  );
  return {
    pageviews: payload.pageviews ?? 0,
    visitors: payload.visitors ?? 0,
    visits: payload.visits ?? 0,
    bounces: payload.bounces ?? 0,
    totalTime: payload.totaltime ?? 0,
  };
}

async function umamiTrend(
  websiteId: string,
  range: DateRange
): Promise<UmamiTrendPoint[]> {
  const payload = await umamiFetch<UmamiSeriesPayload>(
    `/websites/${encodeURIComponent(websiteId)}/pageviews`,
    { ...rangeBounds(range), unit: 'day' }
  );
  const visits = new Map(
    (payload.sessions ?? []).map((point) => [point.x ?? '', point.y ?? 0])
  );
  return (payload.pageviews ?? []).map((point) => ({
    date: point.x ?? '',
    pageviews: point.y ?? 0,
    visits: visits.get(point.x ?? '') ?? 0,
  }));
}

async function umamiPerformance(
  siteUrl: string,
  websiteId: string,
  range: DateRange,
  requestedRange: DateRange
): Promise<UmamiPerformance> {
  const previousRange = previousDateRange(range);
  const [metrics, previousMetrics, trend, previousTrend] = await Promise.all([
    umamiStats(websiteId, range),
    umamiStats(websiteId, previousRange),
    umamiTrend(websiteId, range),
    umamiTrend(websiteId, previousRange),
  ]);
  return {
    siteUrl,
    websiteId,
    requestedRange,
    startDate: range.startDate,
    endDate: range.endDate,
    metrics,
    previousMetrics,
    deltas: umamiDeltas(metrics, previousMetrics),
    trend,
    previousTrend,
  };
}

/** One safe sentence per failure; the raw error never reaches the browser. */
function publicUmamiError(error: unknown): string {
  return error instanceof GscError
    ? error.message
    : 'Umami 数据读取失败，请稍后重试。';
}

/**
 * Bound concurrency so a large portfolio cannot burst past the instance's rate
 * limit while still finishing far faster than a serial loop.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await run(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

async function dashboardProperties(): Promise<SearchProperty[]> {
  const token = await getGoogleAccessToken();
  const properties = await propertiesWithToken(token);
  return overviewProperties(properties).included;
}

/**
 * Portfolio view. Each site costs two stats calls, so this endpoint stays far
 * below the Workers subrequest budget at the current property count. Trends are
 * intentionally omitted here: the per-site report owns them.
 */
export async function getUmamiOverview(
  requestedRange: DateRange
): Promise<UmamiOverviewReport> {
  const range = requestedRange;
  const [sites, websites] = await Promise.all([
    dashboardProperties(),
    listUmamiWebsites(),
  ]);

  const overviewSites = await mapWithConcurrency(
    sites,
    5,
    async (property): Promise<UmamiOverviewSite> => {
      const website = matchWebsite(property.siteUrl, websites);
      if (!website) return { status: 'unmatched', siteUrl: property.siteUrl };
      try {
        const previousRange = previousDateRange(range);
        const [metrics, previousMetrics] = await Promise.all([
          umamiStats(website.websiteId, range),
          umamiStats(website.websiteId, previousRange),
        ]);
        return {
          status: 'ready',
          siteUrl: property.siteUrl,
          performance: {
            siteUrl: property.siteUrl,
            websiteId: website.websiteId,
            requestedRange,
            startDate: range.startDate,
            endDate: range.endDate,
            metrics,
            previousMetrics,
            deltas: umamiDeltas(metrics, previousMetrics),
            trend: [],
            previousTrend: [],
          },
        };
      } catch (error) {
        return {
          status: 'error',
          siteUrl: property.siteUrl,
          error: publicUmamiError(error),
        };
      }
    }
  );

  const ready = overviewSites.flatMap((site) =>
    site.status === 'ready' ? [site.performance] : []
  );
  const failed = overviewSites.filter((site) => site.status === 'error').length;
  return {
    requestedRange,
    range,
    sites: overviewSites,
    websites,
    totals:
      ready.length > 0 && failed === 0
        ? umamiPortfolioPerformance(ready, range, requestedRange)
        : null,
    fetchedAt: new Date().toISOString(),
  };
}

/** One website per request: five data calls stay far under the budget. */
export async function getUmamiReport(
  siteUrl: string,
  requestedRange: DateRange
): Promise<UmamiSiteReport> {
  const range = requestedRange;
  const websites = await listUmamiWebsites();
  const website = matchWebsite(siteUrl, websites);
  if (!website)
    throw new GscError(
      404,
      '该站点没有匹配到 Umami 网站。可在 Umami 后台把网站域名设为该站域名（如 visualiquid.com）后自动关联。'
    );

  const performance = await umamiPerformance(
    siteUrl,
    website.websiteId,
    range,
    requestedRange
  );
  const [pages, referrers, events] = await Promise.all([
    umamiMetricsRows(website.websiteId, range, 'url'),
    umamiMetricsRows(website.websiteId, range, 'referrer'),
    umamiEventRows(website.websiteId, range),
  ]);

  return {
    ...performance,
    pages: pages.map((row) => ({
      path: row.label,
      pageviews: row.count,
    })),
    referrers: referrers.map((row) => ({
      referrer: row.label,
      visitors: row.count,
    })),
    events,
  };
}

async function umamiMetricsRows(
  websiteId: string,
  range: DateRange,
  type: 'url' | 'referrer'
): Promise<Array<{ label: string; count: number }>> {
  const payload = await umamiFetch<UmamiMetricPayload>(
    `/websites/${encodeURIComponent(websiteId)}/metrics`,
    { ...rangeBounds(range), type }
  );
  return payload
    .map((row) => ({ label: row.x ?? '', count: row.y ?? 0 }))
    .filter((row) => row.label !== '');
}

/**
 * Event rows are optional: older self-hosted versions do not expose the
 * endpoint, so a failure degrades to an empty list instead of failing a report
 * whose page and referrer data is still valid.
 */
async function umamiEventRows(
  websiteId: string,
  range: DateRange
): Promise<UmamiEventRow[]> {
  try {
    const payload = await umamiFetch<UmamiEventPayload>(
      `/websites/${encodeURIComponent(websiteId)}/events`,
      rangeBounds(range)
    );
    return payload
      .map((row) => ({ name: row.eventName ?? '', count: row.count ?? 0 }))
      .filter((row) => row.name !== '');
  } catch {
    return [];
  }
}
