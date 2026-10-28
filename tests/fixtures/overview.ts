import { aggregateGa4Metrics, ga4Deltas } from '../../src/features/ga4/metrics';
import type {
  Ga4OverviewReport,
  Ga4OverviewSite,
  Ga4Performance,
  Ga4SiteReport,
} from '../../src/features/ga4/types';
import {
  type DateRange,
  dateKeys,
  previousDateRange,
} from '../../src/features/gsc/date-range';
import {
  aggregateMetrics,
  aggregateTrend,
  subtractMetrics,
} from '../../src/features/gsc/metrics';
import type {
  OverviewReport,
  OverviewSite,
  SearchMetrics,
  SearchPerformance,
  SearchProperty,
} from '../../src/features/gsc/types';

/** Deterministic transport fixtures exercise every observed health state. */
const definitions = [
  { domain: 'alpha.example', current: [50, 500], previous: [100, 1000] },
  { domain: 'beta.example', current: [80, 800], previous: [20, 200] },
  { domain: 'gamma.example', current: [12, 60], previous: [10, 100] },
  { domain: 'new.example', current: [0, 0], previous: [0, 0] },
  { domain: 'stable.example', current: [5, 50], previous: [5, 50] },
];
export const fixtureProperties: SearchProperty[] = definitions.map(
  ({ domain }) => ({
    siteUrl: `sc-domain:${domain}`,
    permissionLevel: 'siteOwner',
  })
);
const metric = ([clicks, impressions]: number[]): SearchMetrics => ({
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position: impressions ? 8 : 0,
});

export function fixtureOverview(
  range: DateRange,
  withFailure = false
): OverviewReport {
  const previous = previousDateRange(range);
  const reports: SearchPerformance[] = definitions.map((definition) => {
    const metrics = metric(definition.current);
    const previousMetrics = metric(definition.previous);
    return {
      siteUrl: `sc-domain:${definition.domain}`,
      requestedRange: range,
      ...range,
      metrics,
      previousMetrics,
      deltas: subtractMetrics(metrics, previousMetrics),
      trend: dateKeys(range).map((date, index) => ({
        date,
        ...metric([
          index ? 0 : metrics.clicks,
          index ? 0 : metrics.impressions,
        ]),
      })),
      previousTrend: dateKeys(previous).map((date, index) => ({
        date,
        ...metric([
          index ? 0 : previousMetrics.clicks,
          index ? 0 : previousMetrics.impressions,
        ]),
      })),
    };
  });
  const metrics = aggregateMetrics(reports.map((report) => report.metrics));
  const previousMetrics = aggregateMetrics(
    reports.map((report) => report.previousMetrics)
  );
  const sites: OverviewSite[] = reports.map((performance, index) =>
    withFailure && index === 1
      ? {
          status: 'error',
          property: fixtureProperties[index],
          error: 'Google 权限不足。',
        }
      : { status: 'ready', property: fixtureProperties[index], performance }
  );
  return {
    requestedRange: range,
    range,
    sites,
    excludedProperties: [],
    fetchedAt: '2026-10-21T03:00:00Z',
    totals: withFailure
      ? null
      : {
          siteUrl: '',
          requestedRange: range,
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
            previous
          ),
        },
  };
}

/** GA4 fixtures mirror the site list: three linked, one explicitly unmatched. */
const ga4Metric = (sessions: number): Ga4Performance['metrics'] => ({
  sessions,
  users: Math.round(sessions * 0.8),
  pageviews: sessions * 2,
  engagementRate: 0.55,
  averageSessionDuration: 42,
  keyEvents: Math.round(sessions / 10),
});
const ga4Links = [
  { propertyId: '401', displayName: 'alpha.example' },
  { propertyId: '402', displayName: 'beta.example' },
  { propertyId: '403', displayName: 'gamma.example' },
];

function ga4Performance(
  siteUrl: string,
  range: DateRange,
  current: number,
  prior: number
): Ga4Performance {
  const metrics = ga4Metric(current);
  const previousMetrics = ga4Metric(prior);
  const trend = dateKeys(range).map((date, index) => ({
    date,
    ...(index ? ga4Metric(0) : metrics),
  }));
  return {
    siteUrl,
    requestedRange: range,
    ...range,
    metrics,
    previousMetrics,
    deltas: ga4Deltas(metrics, previousMetrics),
    trend,
    previousTrend: dateKeys(previousDateRange(range)).map((date, index) => ({
      date,
      ...(index ? ga4Metric(0) : previousMetrics),
    })),
  };
}

export function fixtureGa4Overview(
  range: DateRange,
  withFailure = false
): Ga4OverviewReport {
  const ga4Sites: Ga4OverviewSite[] = definitions.map((definition, index) => {
    if (index === 3)
      return { status: 'unmatched', siteUrl: `sc-domain:${definition.domain}` };
    if (withFailure && index === 1)
      return {
        status: 'error',
        siteUrl: `sc-domain:${definition.domain}`,
        error: 'Google Analytics 请求失败。',
      };
    return {
      status: 'ready',
      siteUrl: `sc-domain:${definition.domain}`,
      performance: ga4Performance(
        `sc-domain:${definition.domain}`,
        range,
        definition.current[0] * 4,
        definition.previous[0] * 4
      ),
    };
  });
  const ready = ga4Sites.flatMap((site) =>
    site.status === 'ready' ? [site.performance] : []
  );
  const totalsMetrics = aggregateGa4Metrics(ready.map((r) => r.metrics));
  const totalsPrevious = aggregateGa4Metrics(
    ready.map((r) => r.previousMetrics)
  );
  return {
    requestedRange: range,
    range,
    sites: ga4Sites,
    matchedProperties: ga4Links.map((link, index) => ({
      siteUrl: `sc-domain:${definitions[index].domain}`,
      ...link,
    })),
    unmatchedProperties: [{ propertyId: '409', displayName: 'New Property' }],
    totals:
      ready.length && !withFailure
        ? {
            siteUrl: '',
            requestedRange: range,
            ...range,
            metrics: totalsMetrics,
            previousMetrics: totalsPrevious,
            deltas: ga4Deltas(totalsMetrics, totalsPrevious),
            trend: dateKeys(range).map((date, index) => ({
              date,
              ...(index ? ga4Metric(0) : totalsMetrics),
            })),
            previousTrend: dateKeys(previousDateRange(range)).map(
              (date, index) => ({
                date,
                ...(index ? ga4Metric(0) : totalsPrevious),
              })
            ),
          }
        : null,
    fetchedAt: '2026-10-21T03:00:00Z',
  };
}

export function fixtureGa4Report(
  siteUrl: string,
  range: DateRange
): Ga4SiteReport | { error: string } {
  const definition = definitions.find(
    ({ domain }) => `sc-domain:${domain}` === siteUrl
  );
  if (!definition || definition.domain === 'new.example')
    return { error: '该站点没有匹配到 GA4 媒体资源。' };
  return {
    ...ga4Performance(
      siteUrl,
      range,
      definition.current[0] * 4,
      definition.previous[0] * 4
    ),
    link: ga4Links.find(
      ({ displayName }) => displayName === definition.domain
    ) ?? { propertyId: '400', displayName: definition.domain },
    channels: [
      { channel: 'Organic Search', sessions: 90, previousSessions: 60 },
      { channel: 'Direct', sessions: 40, previousSessions: 45 },
      { channel: 'Referral', sessions: 10, previousSessions: 0 },
    ],
    pages: [
      { pagePath: '/', sessions: 60, users: 48, pageviews: 120 },
      { pagePath: '/tools', sessions: 30, users: 24, pageviews: 61 },
    ],
  };
}
