import type { DateRange } from '@/features/gsc/date-range';

/**
 * Shared Umami contracts for the Worker boundary and the dashboard UI.
 *
 * Umami returns integer counts directly, so unlike GA4 nothing here needs
 * decimal-string parsing. Every metric keeps its own unit: `bounces` is a
 * count, `totalTime` is accumulated seconds, and neither is derived from the
 * other after the fact.
 */
export type UmamiMetrics = {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totalTime: number;
};

/**
 * Umami's time series endpoint reports page views and sessions only. Visitors,
 * bounces, and time on site are not available per day, so the trend type stays
 * narrower than `UmamiMetrics` instead of filling the missing fields with zero
 * values that would read as real measurements.
 */
export type UmamiTrendPoint = {
  date: string;
  pageviews: number;
  visits: number;
};

export type UmamiPerformance = {
  siteUrl: string;
  websiteId: string;
  requestedRange: DateRange;
  startDate: string;
  endDate: string;
  metrics: UmamiMetrics;
  previousMetrics: UmamiMetrics;
  deltas: UmamiMetrics;
  trend: UmamiTrendPoint[];
  previousTrend: UmamiTrendPoint[];
};

/**
 * Umami's URL metric reports page views per path only. Visitor counts are not
 * available at this granularity, so the row deliberately omits that field
 * rather than shipping a fabricated zero.
 */
export type UmamiPageRow = {
  path: string;
  pageviews: number;
};

export type UmamiReferrerRow = {
  referrer: string;
  visitors: number;
};

export type UmamiEventRow = {
  name: string;
  count: number;
};

/** A website registered in the shared Umami instance. */
export type UmamiWebsite = {
  websiteId: string;
  name: string;
  domain: string;
};

/**
 * Coverage is explicit per site, mirroring GA4: a site without a resolvable
 * Umami website is "unmatched" and never contributes fabricated zeros to the
 * portfolio totals.
 */
export type UmamiOverviewSite =
  | { status: 'ready'; siteUrl: string; performance: UmamiPerformance }
  | { status: 'unmatched'; siteUrl: string }
  | { status: 'error'; siteUrl: string; error: string };

export type UmamiOverviewReport = {
  requestedRange: DateRange;
  range: DateRange;
  sites: UmamiOverviewSite[];
  websites: UmamiWebsite[];
  totals: UmamiPerformance | null;
  fetchedAt: string;
};

export type UmamiSiteReport = UmamiPerformance & {
  pages: UmamiPageRow[];
  referrers: UmamiReferrerRow[];
  events: UmamiEventRow[];
};
