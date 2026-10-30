import { type DateRange, dateKeys } from '@/features/gsc/date-range';
import type {
  Ga4BreakdownRow,
  Ga4ChannelRow,
  Ga4Delta,
  Ga4Metrics,
  Ga4TrendPoint,
} from './types';

export const GA4_METRIC_KEYS = [
  'sessions',
  'users',
  'pageviews',
  'engagementRate',
  'averageSessionDuration',
  'keyEvents',
] as const;

export const GA4_METRIC_API_NAMES: Record<
  (typeof GA4_METRIC_KEYS)[number],
  string
> = {
  sessions: 'sessions',
  users: 'totalUsers',
  pageviews: 'screenPageViews',
  engagementRate: 'engagementRate',
  averageSessionDuration: 'averageSessionDuration',
  keyEvents: 'keyEvents',
};

/** The Data API's date dimension is compact YYYYMMDD, unlike GSC's ISO keys. */
export function normalizeGa4Date(value: string): string {
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

/** Data API metric values are decimal strings and must become exact numbers. */
export function ga4MetricsFromValues(
  values: Array<string | undefined>
): Ga4Metrics {
  const [
    sessions,
    users,
    pageviews,
    engagementRate,
    averageSessionDuration,
    keyEvents,
  ] = values.map((value) =>
    value === undefined ? 0 : Number.parseFloat(value)
  );
  return {
    sessions: sessions ?? 0,
    users: users ?? 0,
    pageviews: pageviews ?? 0,
    engagementRate: engagementRate ?? 0,
    averageSessionDuration: averageSessionDuration ?? 0,
    keyEvents: keyEvents ?? 0,
  };
}

/**
 * Counters sum; engagement rate and session duration are weighted averages by
 * their own base (sessions), never averages of averages.
 */
export function aggregateGa4Metrics(rows: Ga4Metrics[]): Ga4Metrics {
  const sessions = rows.reduce((sum, row) => sum + row.sessions, 0);
  const weighted = (pick: (row: Ga4Metrics) => number) =>
    sessions
      ? rows.reduce((sum, row) => sum + pick(row) * row.sessions, 0) / sessions
      : 0;
  return {
    sessions,
    users: rows.reduce((sum, row) => sum + row.users, 0),
    pageviews: rows.reduce((sum, row) => sum + row.pageviews, 0),
    engagementRate: weighted((row) => row.engagementRate),
    averageSessionDuration: weighted((row) => row.averageSessionDuration),
    keyEvents: rows.reduce((sum, row) => sum + row.keyEvents, 0),
  };
}

export function ga4Deltas(current: Ga4Metrics, previous: Ga4Metrics): Ga4Delta {
  return {
    sessions: current.sessions - previous.sessions,
    users: current.users - previous.users,
    pageviews: current.pageviews - previous.pageviews,
    engagementRate: current.engagementRate - previous.engagementRate,
    averageSessionDuration:
      current.averageSessionDuration - previous.averageSessionDuration,
    keyEvents: current.keyEvents - previous.keyEvents,
  };
}

/**
 * GA4 date rows omit days without activity. A calendar join makes those days
 * explicit and aligns both periods on the same axis, mirroring the GSC rule.
 */
export function aggregateGa4Trend(
  series: Ga4TrendPoint[][],
  range: DateRange
): Ga4TrendPoint[] {
  const byDate = new Map<string, Ga4Metrics[]>();
  for (const trend of series)
    for (const point of trend) {
      const rows = byDate.get(point.date) ?? [];
      rows.push(point);
      byDate.set(point.date, rows);
    }
  return dateKeys(range).map((date) => ({
    date,
    ...aggregateGa4Metrics(byDate.get(date) ?? []),
  }));
}

export function ga4ChannelRows(
  raw: Array<{ channel: string; metrics: Ga4Metrics }>,
  previous: Array<{ channel: string; metrics: Ga4Metrics }>
): Ga4ChannelRow[] {
  const previousByChannel = new Map(
    previous.map((row) => [row.channel, row.metrics])
  );
  return raw
    .map((row) => ({
      channel: row.channel,
      sessions: row.metrics.sessions,
      previousSessions: previousByChannel.get(row.channel)?.sessions ?? 0,
    }))
    .sort((left, right) => right.sessions - left.sessions);
}

/**
 * Joins the two windows on the dimension value. A value that is new this period
 * gets `previousSessions: 0` — shown as 新增 rather than an infinite growth
 * rate — and a value that disappeared simply does not appear in the table.
 */
export function ga4BreakdownRows(
  current: Array<{ label: string; metrics: Ga4Metrics }>,
  previous: Array<{ label: string; metrics: Ga4Metrics }>
): Ga4BreakdownRow[] {
  const previousByLabel = new Map(
    previous.map((row) => [row.label, row.metrics])
  );
  return current
    .map((row) => ({
      label: row.label,
      sessions: row.metrics.sessions,
      previousSessions: previousByLabel.get(row.label)?.sessions ?? 0,
      users: row.metrics.users,
      pageviews: row.metrics.pageviews,
      engagementRate: row.metrics.engagementRate,
      keyEvents: row.metrics.keyEvents,
    }))
    .sort((left, right) => right.sessions - left.sessions);
}
