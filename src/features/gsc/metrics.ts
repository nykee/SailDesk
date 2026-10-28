import { type DateRange, dateKeys } from './date-range';
import type { SearchMetrics, TrendPoint } from './types';

/** CTR is a ratio of sums; average position is weighted by actual impressions. */
export function aggregateMetrics(rows: SearchMetrics[]): SearchMetrics {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions
      ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
        impressions
      : 0,
  };
}

/** Absolute deltas retain the unit of each metric; percentage change is separate. */
export function subtractMetrics(
  current: SearchMetrics,
  previous: SearchMetrics
): SearchMetrics {
  return {
    clicks: current.clicks - previous.clicks,
    impressions: current.impressions - previous.impressions,
    ctr: current.ctr - previous.ctr,
    position: current.position - previous.position,
  };
}

/**
 * Date-grouped, finalized GSC responses omit days with no activity. A calendar
 * join makes those zero-activity days explicit and aligns both periods by day,
 * rather than incorrectly shifting sparse rows along the chart's x-axis.
 */
export function aggregateTrend(
  series: TrendPoint[][],
  range: DateRange
): TrendPoint[] {
  const byDate = new Map<string, SearchMetrics[]>();
  for (const trend of series)
    for (const point of trend) {
      const rows = byDate.get(point.date) ?? [];
      rows.push(point);
      byDate.set(point.date, rows);
    }
  return dateKeys(range).map((date) => ({
    date,
    ...aggregateMetrics(byDate.get(date) ?? []),
  }));
}
