import type {
  BingMetrics,
  BingPageRow,
  BingPerformance,
  BingQueryRow,
  BingWeekPoint,
} from './types';

/** .NET JSON dates are "/Date(<epoch-ms>[<±offset>])/". */
export function parseBingDate(value: string): string | null {
  const match = /\/Date\((\d+)([+-]\d{4})?\)\//.exec(value);
  if (!match) return null;
  const ms = Number(match[1]);
  const offset = match[2];
  if (!offset) return new Date(ms).toISOString().slice(0, 10);
  const sign = offset[0] === '-' ? -1 : 1;
  const minutes = Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5));
  return new Date(ms + sign * minutes * 60_000).toISOString().slice(0, 10);
}

type BingStatsRow = {
  Query?: string;
  Page?: string;
  Clicks?: number;
  Impressions?: number;
  AvgClickPosition?: number;
  AvgImpressionPosition?: number;
  Date?: string;
};

export type { BingStatsRow, BingWeekPoint };

/**
 * Bing reports weekly buckets per query/page. Rows are folded into one bucket
 * per week; positions are impression-weighted and the -1 "no clicks" marker is
 * excluded rather than averaged in.
 */
export function aggregateBingWeeks(rows: BingStatsRow[]): BingWeekPoint[] {
  const buckets = new Map<
    string,
    { clicks: number; impressions: number; weighted: number }
  >();
  for (const row of rows) {
    const weekStart = row.Date ? parseBingDate(row.Date) : null;
    if (!weekStart) continue;
    const bucket = buckets.get(weekStart) ?? {
      clicks: 0,
      impressions: 0,
      weighted: 0,
    };
    bucket.clicks += row.Clicks ?? 0;
    const impressions = row.Impressions ?? 0;
    bucket.impressions += impressions;
    const position = row.AvgImpressionPosition ?? -1;
    if (impressions > 0 && position >= 0)
      bucket.weighted += impressions * position;
    buckets.set(weekStart, bucket);
  }
  return [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, bucket]) => ({
      weekStart,
      clicks: bucket.clicks,
      impressions: bucket.impressions,
      position: bucket.impressions ? bucket.weighted / bucket.impressions : 0,
    }));
}

/** Impression-weighted positions and ratio-of-sums CTR, mirroring the GSC rule. */
export function bingMetricsFromWeeks(weeks: BingWeekPoint[]): BingMetrics {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const week of weeks) {
    clicks += week.clicks;
    impressions += week.impressions;
    if (week.impressions > 0 && week.position >= 0)
      weighted += week.impressions * week.position;
  }
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weighted / impressions : 0,
  };
}

/**
 * The most recent four complete weekly buckets form the current ~28-day window;
 * any earlier buckets become the previous window. Fewer than five buckets means
 * there is no comparable prior period.
 */
export function buildBingPerformance(
  siteUrl: string,
  bingSiteUrl: string,
  weeks: BingWeekPoint[],
  truncated: boolean
): BingPerformance {
  const current = weeks.slice(-4);
  const previous = weeks.slice(0, -4);
  return {
    siteUrl,
    bingSiteUrl,
    weeks,
    metrics: bingMetricsFromWeeks(current),
    previousMetrics: previous.length ? bingMetricsFromWeeks(previous) : null,
    weekCount: weeks.length,
    truncated,
  };
}

/** Impression-weighted merge keeps portfolio position honest across sites. */
export function mergeBingMetrics(
  current: BingMetrics,
  previous: BingMetrics
): BingMetrics {
  const impressions = current.impressions + previous.impressions;
  const clicks = current.clicks + previous.clicks;
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions
      ? (current.position * current.impressions +
          previous.position * previous.impressions) /
        impressions
      : 0,
  };
}

/** Portfolio totals sum each site's already-computed current window. */
export function mergeBingMetricsList(metrics: BingMetrics[]): BingMetrics {
  return metrics.reduce((acc, item) => mergeBingMetrics(acc, item), {
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
  });
}

/**
 * Weekly buckets from different sites rarely share every date, so weeks are
 * summed by start and impression-weighted position is recomputed per bucket.
 */
export function aggregateBingPortfolioWeeks(
  sites: BingPerformance[]
): BingWeekPoint[] {
  const buckets = new Map<
    string,
    { clicks: number; impressions: number; weighted: number }
  >();
  for (const site of sites) {
    for (const week of site.weeks) {
      const bucket = buckets.get(week.weekStart) ?? {
        clicks: 0,
        impressions: 0,
        weighted: 0,
      };
      bucket.clicks += week.clicks;
      const impressions = week.impressions;
      bucket.impressions += impressions;
      if (impressions > 0 && week.position >= 0)
        bucket.weighted += impressions * week.position;
      buckets.set(week.weekStart, bucket);
    }
  }
  return [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, bucket]) => ({
      weekStart,
      clicks: bucket.clicks,
      impressions: bucket.impressions,
      position: bucket.impressions ? bucket.weighted / bucket.impressions : 0,
    }));
}

/** Query rows collapse their weekly buckets into one row per query. */
export function bingTopQueries(
  rows: BingStatsRow[],
  limit = 20
): BingQueryRow[] {
  const byQuery = new Map<
    string,
    { clicks: number; impressions: number; weighted: number }
  >();
  for (const row of rows) {
    const query = row.Query;
    if (!query) continue;
    const existing = byQuery.get(query) ?? {
      clicks: 0,
      impressions: 0,
      weighted: 0,
    };
    const impressions = row.Impressions ?? 0;
    existing.clicks += row.Clicks ?? 0;
    existing.impressions += impressions;
    const position = row.AvgImpressionPosition ?? -1;
    if (impressions > 0 && position >= 0)
      existing.weighted += impressions * position;
    byQuery.set(query, existing);
  }
  return [...byQuery.entries()]
    .map(([query, value]) => ({
      query,
      clicks: value.clicks,
      impressions: value.impressions,
      position: value.impressions ? value.weighted / value.impressions : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

/**
 * Page rows collapse their weekly buckets into one row per page path.
 * Bing's GetPageStats reuses the QueryStats shape, so the page URL actually
 * lives in the `Query` field rather than a `Page` field.
 */
export function bingTopPages(rows: BingStatsRow[], limit = 20): BingPageRow[] {
  const byPage = new Map<
    string,
    { clicks: number; impressions: number; weighted: number }
  >();
  for (const row of rows) {
    const page = row.Page ?? row.Query;
    if (!page) continue;
    const existing = byPage.get(page) ?? {
      clicks: 0,
      impressions: 0,
      weighted: 0,
    };
    const impressions = row.Impressions ?? 0;
    existing.clicks += row.Clicks ?? 0;
    existing.impressions += impressions;
    const position = row.AvgImpressionPosition ?? -1;
    if (impressions > 0 && position >= 0)
      existing.weighted += impressions * position;
    byPage.set(page, existing);
  }
  return [...byPage.entries()]
    .map(([page, value]) => ({
      page,
      clicks: value.clicks,
      impressions: value.impressions,
      position: value.impressions ? value.weighted / value.impressions : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}
