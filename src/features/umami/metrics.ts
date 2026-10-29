import { type DateRange, dateKeys } from '@/features/gsc/date-range';
import type { UmamiMetrics, UmamiPerformance, UmamiTrendPoint } from './types';

export const emptyUmamiMetrics: UmamiMetrics = {
  pageviews: 0,
  visitors: 0,
  visits: 0,
  bounces: 0,
  totalTime: 0,
};

/** Absolute deltas retain each metric's unit, like the GSC counterpart. */
export function umamiDeltas(
  current: UmamiMetrics,
  previous: UmamiMetrics
): UmamiMetrics {
  return {
    pageviews: current.pageviews - previous.pageviews,
    visitors: current.visitors - previous.visitors,
    visits: current.visits - previous.visits,
    bounces: current.bounces - previous.bounces,
    totalTime: current.totalTime - previous.totalTime,
  };
}

export function addUmamiMetrics(
  left: UmamiMetrics,
  right: UmamiMetrics
): UmamiMetrics {
  return {
    pageviews: left.pageviews + right.pageviews,
    visitors: left.visitors + right.visitors,
    visits: left.visits + right.visits,
    bounces: left.bounces + right.bounces,
    totalTime: left.totalTime + right.totalTime,
  };
}

/**
 * Merge several site trends onto one axis. Every date in the requested range is
 * emitted even when no site reported activity, so a quiet day is drawn as zero
 * instead of collapsing the chart's timeline.
 */
export function mergeUmamiTrend(
  series: readonly (readonly UmamiTrendPoint[])[],
  range: DateRange
): UmamiTrendPoint[] {
  const totals = new Map<string, { pageviews: number; visits: number }>();
  for (const date of dateKeys(range))
    totals.set(date, { pageviews: 0, visits: 0 });
  for (const points of series)
    for (const point of points) {
      const entry = totals.get(point.date);
      if (!entry) continue;
      entry.pageviews += point.pageviews;
      entry.visits += point.visits;
    }
  return [...totals].map(([date, value]) => ({ date, ...value }));
}

/**
 * Portfolio totals are only produced when every site resolved. A partial sum
 * would look like a traffic drop caused by a missing credential, so the caller
 * receives `null` and the UI can say so explicitly.
 */
export function umamiPortfolioPerformance(
  performances: readonly UmamiPerformance[],
  range: DateRange,
  requestedRange: DateRange
): UmamiPerformance {
  const metrics = performances.reduce(
    (total, performance) => addUmamiMetrics(total, performance.metrics),
    emptyUmamiMetrics
  );
  const previousMetrics = performances.reduce(
    (total, performance) => addUmamiMetrics(total, performance.previousMetrics),
    emptyUmamiMetrics
  );
  return {
    siteUrl: 'portfolio',
    websiteId: '',
    requestedRange,
    startDate: range.startDate,
    endDate: range.endDate,
    metrics,
    previousMetrics,
    deltas: umamiDeltas(metrics, previousMetrics),
    trend: mergeUmamiTrend(
      performances.map((performance) => performance.trend),
      range
    ),
    previousTrend: mergeUmamiTrend(
      performances.map((performance) => performance.previousTrend),
      range
    ),
  };
}
