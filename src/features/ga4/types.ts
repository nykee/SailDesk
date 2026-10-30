import type { DateRange } from '@/features/gsc/date-range';

/**
 * Shared GA4 contracts for the Worker boundary and the dashboard UI. GA4 metric
 * values arrive as decimal strings from the Data API and are parsed into numbers
 * before they reach this layer.
 */
export type Ga4Metrics = {
  sessions: number;
  users: number;
  pageviews: number;
  engagementRate: number;
  averageSessionDuration: number;
  keyEvents: number;
};

export type Ga4TrendPoint = Ga4Metrics & { date: string };

/** Absolute deltas retain each metric's unit, like the GSC counterpart. */
export type Ga4Delta = Ga4Metrics;

export type Ga4Performance = {
  siteUrl: string;
  requestedRange: DateRange;
  startDate: string;
  endDate: string;
  metrics: Ga4Metrics;
  previousMetrics: Ga4Metrics;
  deltas: Ga4Delta;
  trend: Ga4TrendPoint[];
  previousTrend: Ga4TrendPoint[];
};

/** Current and previous window travel together so shares and deltas stay exact. */
export type Ga4ChannelRow = {
  channel: string;
  sessions: number;
  previousSessions: number;
};

export type Ga4PageRow = {
  pagePath: string;
  sessions: number;
  users: number;
  pageviews: number;
};

/**
 * A single dimension value with the current window and the same value in the
 * previous window. Channel groups are too coarse to act on: `Organic Search`
 * does not tell you which source or which landing page earned the sessions.
 */
export type Ga4BreakdownRow = {
  label: string;
  sessions: number;
  previousSessions: number;
  users: number;
  pageviews: number;
  engagementRate: number;
  keyEvents: number;
};

export type Ga4Breakdowns = {
  sources: Ga4BreakdownRow[];
  landingPages: Ga4BreakdownRow[];
  devices: Ga4BreakdownRow[];
  countries: Ga4BreakdownRow[];
  events: Ga4BreakdownRow[];
};

/** A linked GA4 property, identified by its Admin API resource id. */
export type Ga4Link = {
  propertyId: string;
  displayName: string;
};

/**
 * GA4 coverage is explicit per site: a site without a resolvable GA4 property is
 * "unmatched" and can never contribute fabricated zeros to totals.
 */
export type Ga4OverviewSite =
  | { status: 'ready'; siteUrl: string; performance: Ga4Performance }
  | { status: 'unmatched'; siteUrl: string }
  | { status: 'error'; siteUrl: string; error: string };

export type Ga4OverviewReport = {
  requestedRange: DateRange;
  range: DateRange;
  sites: Ga4OverviewSite[];
  matchedProperties: Array<Ga4Link & { siteUrl: string }>;
  unmatchedProperties: Ga4Link[];
  totals: Ga4Performance | null;
  fetchedAt: string;
};

export type Ga4SiteReport = Ga4Performance & {
  link: Ga4Link;
  channels: Ga4ChannelRow[];
  pages: Ga4PageRow[];
  breakdowns: Ga4Breakdowns;
};
