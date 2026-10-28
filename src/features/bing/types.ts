import type { DateRange } from '@/features/gsc/date-range';

/**
 * Bing Webmaster contracts. Bing exposes weekly buckets of the last ~5-6 weeks
 * (not daily data), so this layer keeps the buckets as the primary axis and
 * derives honest aggregates instead of pretending at daily granularity.
 */
export type BingWeekPoint = {
  weekStart: string;
  clicks: number;
  impressions: number;
  /** Impression-weighted average rank for the bucket. */
  position: number;
};

export type BingMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/** Aggregates over the last four complete buckets, a ~28-day window. */
export type BingPerformance = {
  siteUrl: string;
  bingSiteUrl: string;
  weeks: BingWeekPoint[];
  metrics: BingMetrics;
  /** Sum of whatever buckets precede the 28-day window, if any. */
  previousMetrics: BingMetrics | null;
  weekCount: number;
  /** Query rows hit Bing's row cap, so long-tail totals are approximate. */
  truncated: boolean;
};

export type BingOverviewSite =
  | { status: 'ready'; siteUrl: string; performance: BingPerformance }
  | { status: 'missing'; siteUrl: string }
  | { status: 'error'; siteUrl: string; error: string };

export type BingOverviewReport = {
  configured: boolean;
  /**
   * Whether cached Bing data is present. Bing throttles Cloudflare's shared
   * egress IP, so the dashboard reads from a KV cache seeded from a clean IP.
   * When false the section shows a "not synced yet" notice instead of numbers.
   */
  available: boolean;
  /** Portfolio performance over the trailing ~28-day window (null if no site matched). */
  totals: BingPerformance | null;
  sites: BingOverviewSite[];
  /** GSC sites with no matching Bing Webmaster site. */
  missingFromBing: string[];
  /** Bing sites that do not map to any GSC property. */
  unmatchedBingSites: string[];
  fetchedAt: string;
};

export type BingQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type BingPageRow = {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type BingSiteReport = BingPerformance & {
  queries: BingQueryRow[];
  pages: BingPageRow[];
};
