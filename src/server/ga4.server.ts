import {
  assignGa4Properties,
  type Ga4PropertySummary,
} from '@/features/ga4/mapping';
import {
  aggregateGa4Metrics,
  aggregateGa4Trend,
  GA4_METRIC_API_NAMES,
  ga4BreakdownRows,
  ga4ChannelRows,
  ga4Deltas,
  ga4MetricsFromValues,
  normalizeGa4Date,
} from '@/features/ga4/metrics';
import type {
  Ga4BreakdownRow,
  Ga4Breakdowns,
  Ga4ChannelRow,
  Ga4Link,
  Ga4Metrics,
  Ga4OverviewReport,
  Ga4OverviewSite,
  Ga4PageRow,
  Ga4Performance,
  Ga4SiteReport,
  Ga4TrendPoint,
} from '@/features/ga4/types';
import {
  type DateRange,
  defaultDateRange,
  isValidDateRange,
  previousDateRange,
  shiftDate,
} from '@/features/gsc/date-range';
import { overviewProperties } from '@/features/gsc/property';
import type { SearchProperty } from '@/features/gsc/types';
import {
  GscError,
  getGoogleAccessToken,
  googleFetch,
  propertiesWithToken,
} from './gsc.server';

const DATA_API_URL = 'https://analyticsdata.googleapis.com/v1beta';
const ADMIN_API_URL = 'https://analyticsadmin.googleapis.com/v1beta';

type Ga4Row = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

type Ga4RunReportResponse = { rows?: Ga4Row[] };

/**
 * GA4 runs on the same OAuth client and refresh token as Search Console, so the
 * only setup step is a re-consent that includes analytics.readonly. Everything
 * lives in its own endpoints: Workers cap subrequests per invocation, and the
 * overview already uses 40 of the free plan's 50 for Search Console.
 */
export async function getGa4Overview(
  requestedRange: DateRange
): Promise<Ga4OverviewReport> {
  const range = validateRange(requestedRange);
  const token = await getGoogleAccessToken();
  const { included: sites } = overviewProperties(
    await propertiesWithToken(token)
  );
  const summaries = await listGa4Properties(token);
  const assignments = await resolveAssignments(token, sites, summaries);
  const ga4Sites = await mapProperties(
    sites,
    async (property): Promise<Ga4OverviewSite> => {
      const link = assignments.get(property.siteUrl);
      if (!link) return { status: 'unmatched', siteUrl: property.siteUrl };
      try {
        return {
          status: 'ready',
          siteUrl: property.siteUrl,
          performance: await ga4Performance(
            token,
            link,
            property.siteUrl,
            range
          ),
        };
      } catch (error) {
        return {
          status: 'error',
          siteUrl: property.siteUrl,
          error: publicGoogleError(error),
        };
      }
    }
  );
  const ready = ga4Sites.flatMap((site) =>
    site.status === 'ready' ? [site.performance] : []
  );
  const failed = ga4Sites.filter((site) => site.status === 'error').length;
  const totals =
    ready.length > 0 && failed === 0
      ? ga4PortfolioPerformance(ready, range, requestedRange)
      : null;
  return {
    requestedRange,
    range,
    sites: ga4Sites,
    matchedProperties: [...assignments].map(([siteUrl, link]) => ({
      siteUrl,
      ...link,
    })),
    unmatchedProperties: summaries.filter(
      (summary) =>
        ![...assignments.values()].some(
          (link) => link.propertyId === summary.propertyId
        )
    ),
    totals,
    fetchedAt: new Date().toISOString(),
  };
}

/** One property per request: 1 matching + 3 data calls stays far under limits. */
export async function getGa4Report(
  siteUrl: string,
  requestedRange: DateRange
): Promise<Ga4SiteReport> {
  const range = validateRange(requestedRange);
  const token = await getGoogleAccessToken();
  const summaries = await listGa4Properties(token);
  const assignments = await resolveAssignments(
    token,
    [{ siteUrl, permissionLevel: 'siteFullUser' }],
    summaries
  );
  const link = assignments.get(siteUrl);
  if (!link)
    throw new GscError(
      404,
      '该站点没有匹配到 GA4 媒体资源。可在 GA4 后台把属性名称改为站点域名（如 example.com）后自动关联。'
    );
  const [performance, channels, pages, breakdowns] = await Promise.all([
    ga4Performance(token, link, siteUrl, range),
    ga4Channels(token, link.propertyId, range),
    ga4TopPages(token, link.propertyId, range),
    ga4Breakdowns(token, link.propertyId, range),
  ]);
  return { ...performance, link, channels, pages, breakdowns };
}

/**
 * Channel groups are too coarse to act on, so the detail view also asks for the
 * dimensions an operator actually changes: which source, which landing page,
 * which device, which country, which event. Five extra runReport calls still
 * leave this endpoint far below the Workers subrequest ceiling.
 */
async function ga4Breakdowns(
  token: string,
  propertyId: string,
  range: DateRange
): Promise<Ga4Breakdowns> {
  const [sources, landingPages, devices, countries, events] = await Promise.all(
    [
      ga4Breakdown(token, propertyId, range, 'sessionSourceMedium', 10),
      ga4Breakdown(token, propertyId, range, 'landingPage', 10),
      ga4Breakdown(token, propertyId, range, 'deviceCategory', 5),
      ga4Breakdown(token, propertyId, range, 'country', 10),
      ga4Breakdown(token, propertyId, range, 'eventName', 15),
    ]
  );
  return { sources, landingPages, devices, countries, events };
}

async function ga4Breakdown(
  token: string,
  propertyId: string,
  range: DateRange,
  dimension: string,
  limit: number
): Promise<Ga4BreakdownRow[]> {
  const payload = await runReport(token, propertyId, {
    dateRanges: [range, previousDateRange(range)],
    dimensions: [{ name: dimension }],
    metrics: Object.values(GA4_METRIC_API_NAMES).map((name) => ({ name })),
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit,
  });
  const { current, prior } = splitDimensionRows(payload.rows ?? [], 1);
  const label = (key: string) =>
    dimension === 'sessionSourceMedium'
      ? sourceMediumLabel(key)
      : dimension === 'deviceCategory'
        ? deviceLabel(key)
        : key;
  return ga4BreakdownRows(
    current.map(({ key, metrics }) => ({ label: label(key), metrics })),
    prior.map(({ key, metrics }) => ({ label: label(key), metrics }))
  );
}

/** GA4 reports source/medium as `google / organic`; keep it readable but exact. */
function sourceMediumLabel(key: string): string {
  return key === '(not set)' ? '未标记来源' : key;
}

function deviceLabel(key: string): string {
  const labels: Record<string, string> = {
    desktop: '桌面端',
    mobile: '移动端',
    tablet: '平板',
    'smart tv': '电视',
    console: '游戏主机',
  };
  return labels[key] ?? key;
}

async function listGa4Properties(token: string): Promise<Ga4PropertySummary[]> {
  const summaries: Ga4PropertySummary[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${ADMIN_API_URL}/accountSummaries`);
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetchAdmin(token, url.toString());
    const payload = (await response.json()) as {
      accountSummaries?: Array<{
        propertySummaries?: Array<{
          property?: string;
          displayName?: string;
        }>;
      }>;
      nextPageToken?: string;
    };
    for (const account of payload.accountSummaries ?? [])
      for (const property of account.propertySummaries ?? [])
        if (property.property && property.displayName)
          summaries.push({
            propertyId: property.property.replace(/^properties\//, ''),
            displayName: property.displayName,
          });
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return summaries;
}

/**
 * Only a missing analytics scope is reworded; other 403 bodies (a disabled API,
 * for instance) already carry Google's actionable message and pass through.
 */
async function fetchAdmin(token: string, url: string): Promise<Response> {
  try {
    return await googleFetch(token, url, undefined, 'Google Analytics');
  } catch (error) {
    if (
      error instanceof GscError &&
      error.status === 403 &&
      /insufficient authentication scopes/i.test(error.message)
    )
      throw new GscError(
        502,
        'GA4 数据未授权：请重新运行授权脚本（scope 需包含 analytics.readonly），并把新的 refresh token 更新到 Cloudflare。'
      );
    throw error;
  }
}

async function runReport(
  token: string,
  propertyId: string,
  body: Record<string, unknown>
): Promise<Ga4RunReportResponse> {
  const response = await googleFetch(
    token,
    `${DATA_API_URL}/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    'Google Analytics'
  );
  return response.json();
}

/**
 * Hostname probing is the zero-config fallback for properties whose display
 * name is not the domain: one runReport per still-free property returns the
 * hostnames it actually receives data for.
 */
async function resolveAssignments(
  token: string,
  sites: SearchProperty[],
  summaries: Ga4PropertySummary[]
): Promise<Map<string, Ga4Link>> {
  const assignments = assignGa4Properties(sites, summaries, new Map());
  const unmatched = sites.filter((site) => !assignments.has(site.siteUrl));
  const taken = new Set(
    [...assignments.values()].map((link) => link.propertyId)
  );
  const free = summaries.filter((summary) => !taken.has(summary.propertyId));
  if (unmatched.length > 0 && free.length > 0) {
    const hosts: Array<[string, string[]]> = await mapProperties(
      free,
      async (summary) => [
        summary.propertyId,
        await probeHostnames(token, summary.propertyId),
      ]
    );
    for (const [siteUrl, link] of assignGa4Properties(
      unmatched,
      free,
      new Map(hosts)
    ))
      assignments.set(siteUrl, link);
  }
  return new Map(
    [...assignments].map(([siteUrl, summary]) => [
      siteUrl,
      { propertyId: summary.propertyId, displayName: summary.displayName },
    ])
  );
}

async function probeHostnames(
  token: string,
  propertyId: string
): Promise<string[]> {
  const payload = await runReport(token, propertyId, {
    dateRanges: [
      {
        startDate: shiftDate(defaultDateRange().endDate, -89),
        endDate: defaultDateRange().endDate,
      },
    ],
    dimensions: [{ name: 'hostName' }],
    metrics: [{ name: 'sessions' }],
    limit: 20,
  });
  return (payload.rows ?? []).flatMap((row) => {
    const host = row.dimensionValues?.[0]?.value;
    return host && host !== '(not set)' ? [host] : [];
  });
}

async function ga4Performance(
  token: string,
  link: Ga4Link,
  siteUrl: string,
  range: DateRange
): Promise<Ga4Performance> {
  const previous = previousDateRange(range);
  const payload = await runReport(token, link.propertyId, {
    dateRanges: [range, previous],
    dimensions: [{ name: 'date' }],
    metrics: Object.values(GA4_METRIC_API_NAMES).map((name) => ({ name })),
    limit: 2_000,
  });
  const { current, prior } = splitTrendRows(payload.rows ?? []);
  const metrics = aggregateGa4Metrics(current);
  const previousMetrics = aggregateGa4Metrics(prior);
  return {
    siteUrl,
    requestedRange: range,
    ...range,
    metrics,
    previousMetrics,
    deltas: ga4Deltas(metrics, previousMetrics),
    trend: aggregateGa4Trend([current], range),
    previousTrend: aggregateGa4Trend([prior], previous),
  };
}

async function ga4Channels(
  token: string,
  propertyId: string,
  range: DateRange
): Promise<Ga4ChannelRow[]> {
  const payload = await runReport(token, propertyId, {
    dateRanges: [range, previousDateRange(range)],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    limit: 100,
  });
  const { current, prior } = splitDimensionRows(payload.rows ?? [], 1);
  return ga4ChannelRows(
    current.map(({ key, metrics }) => ({
      channel: channelLabel(key),
      metrics,
    })),
    prior.map(({ key, metrics }) => ({ channel: channelLabel(key), metrics }))
  );
}

async function ga4TopPages(
  token: string,
  propertyId: string,
  range: DateRange
): Promise<Ga4PageRow[]> {
  const payload = await runReport(token, propertyId, {
    dateRanges: [range],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  });
  return (payload.rows ?? []).flatMap((row) => {
    const path = row.dimensionValues?.[0]?.value;
    if (!path) return [];
    const [sessions, users, pageviews] = (row.metricValues ?? []).map((value) =>
      Number.parseFloat(value.value ?? '0')
    );
    return [
      {
        pagePath: path,
        sessions: sessions ?? 0,
        users: users ?? 0,
        pageviews: pageviews ?? 0,
      },
    ];
  });
}

/**
 * With two dateRanges the API appends date_range_0/1 as the final dimension;
 * rows are partitioned on it so both windows come from a single request.
 */
function splitTrendRows(rows: Ga4Row[]): {
  current: Ga4TrendPoint[];
  prior: Ga4TrendPoint[];
} {
  const current: Ga4TrendPoint[] = [];
  const prior: Ga4TrendPoint[] = [];
  for (const row of rows) {
    const raw = row.dimensionValues?.[0]?.value;
    const date = raw ? normalizeGa4Date(raw) : undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const metrics = ga4MetricsFromValues(
      row.metricValues?.map((v) => v.value) ?? []
    );
    (row.dimensionValues?.[1]?.value === 'date_range_1' ? prior : current).push(
      {
        date,
        ...metrics,
      }
    );
  }
  return { current, prior };
}

function splitDimensionRows(
  rows: Ga4Row[],
  dimensionCount: number
): {
  current: Array<{ key: string; metrics: Ga4Metrics }>;
  prior: Array<{ key: string; metrics: Ga4Metrics }>;
} {
  const current: Array<{ key: string; metrics: Ga4Metrics }> = [];
  const prior: Array<{ key: string; metrics: Ga4Metrics }> = [];
  for (const row of rows) {
    const dimensions = row.dimensionValues ?? [];
    const key = dimensions[dimensionCount - 1]?.value;
    if (!key) continue;
    const metrics = ga4MetricsFromValues(
      row.metricValues?.map((v) => v.value) ?? []
    );
    (dimensions[dimensionCount]?.value === 'date_range_1'
      ? prior
      : current
    ).push({
      key,
      metrics,
    });
  }
  return { current, prior };
}

/** GA4 sends canonical channel keys; labels stay close to the GA4 UI wording. */
function channelLabel(key: string): string {
  const labels: Record<string, string> = {
    Organic: '自然搜索',
    'Organic Search': '自然搜索',
    Direct: '直接访问',
    Referral: '引荐流量',
    'Paid Search': '付费搜索',
    'Paid Shopping': '付费购物',
    'Paid Social': '付费社交',
    'Organic Social': '社交流量',
    Email: '邮件',
    Display: '展示广告',
    Video: '视频广告',
    Affiliate: '联盟推广',
    Audio: '音频',
    SMS: '短信',
    Unassigned: '未分配',
  };
  return labels[key] ?? key;
}

function ga4PortfolioPerformance(
  reports: Ga4Performance[],
  range: DateRange,
  requestedRange: DateRange
): Ga4Performance {
  const metrics = aggregateGa4Metrics(reports.map((report) => report.metrics));
  const previousMetrics = aggregateGa4Metrics(
    reports.map((report) => report.previousMetrics)
  );
  return {
    siteUrl: '',
    requestedRange,
    ...range,
    metrics,
    previousMetrics,
    deltas: ga4Deltas(metrics, previousMetrics),
    trend: aggregateGa4Trend(
      reports.map((report) => report.trend),
      range
    ),
    previousTrend: aggregateGa4Trend(
      reports.map((report) => report.previousTrend),
      previousDateRange(range)
    ),
  };
}

/** Deterministic batches bound Google concurrency without retries. */
async function mapProperties<T, R>(
  items: T[],
  map: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += 4)
    results.push(
      ...(await Promise.all(items.slice(start, start + 4).map(map)))
    );
  return results;
}

/**
 * GA4 reports today's partial data, so the window is clamped to the last
 * completed UTC day to stay comparable with the Search Console view.
 */
function validateRange(range: DateRange): DateRange {
  if (!isValidDateRange(range)) throw new GscError(400, '日期范围无效。');
  const yesterday = defaultDateRange().endDate;
  if (range.endDate > yesterday) {
    const clamped = { ...range, endDate: yesterday };
    if (clamped.startDate > clamped.endDate)
      throw new GscError(400, '日期范围尚未开始，请选择已结束的日期。');
    return clamped;
  }
  return range;
}

function publicGoogleError(error: unknown): string {
  return error instanceof GscError
    ? error.message
    : 'Google Analytics 返回了无法解析的数据，请重试。';
}
