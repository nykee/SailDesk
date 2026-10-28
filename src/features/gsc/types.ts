import type { DateRange } from './date-range';

/**
 * Shared GSC contracts used by the Worker boundary and the dashboard UI.
 * Keeping the API projection here prevents the visual layer from depending on
 * Google's transport-specific response shapes.
 */
export type SearchProperty = {
  siteUrl: string;
  permissionLevel: string;
};

export type SearchMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type MetricDelta = SearchMetrics;

export type TrendPoint = SearchMetrics & {
  date: string;
};

export type QueryRow = SearchMetrics & {
  query: string;
};

/** Both views share the same complete-period performance contract. */
export type SearchPerformance = {
  siteUrl: string;
  requestedRange: DateRange;
  startDate: string;
  endDate: string;
  metrics: SearchMetrics;
  previousMetrics: SearchMetrics;
  deltas: MetricDelta;
  trend: TrendPoint[];
  previousTrend: TrendPoint[];
};

export type SearchReport = SearchPerformance & {
  queries: QueryRow[];
};

/** A failed property is explicit and can never be included as a zero in totals. */
export type OverviewSite =
  | {
      status: 'ready';
      property: SearchProperty;
      performance: SearchPerformance;
    }
  | { status: 'error'; property: SearchProperty; error: string };

export type OverviewReport = {
  requestedRange: DateRange;
  range: DateRange;
  sites: OverviewSite[];
  excludedProperties: SearchProperty[];
  totals: SearchPerformance | null;
  fetchedAt: string;
};

export type ChartMetric = Extract<
  keyof SearchMetrics,
  'clicks' | 'impressions'
>;
