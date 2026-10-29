import { describe, expect, it } from 'vitest';
import type { DateRange } from '@/features/gsc/date-range';
import {
  addUmamiMetrics,
  emptyUmamiMetrics,
  mergeUmamiTrend,
  umamiDeltas,
  umamiPortfolioPerformance,
} from '@/features/umami/metrics';
import type { UmamiMetrics, UmamiPerformance } from '@/features/umami/types';

const range: DateRange = { startDate: '2026-10-01', endDate: '2026-10-03' };

const current: UmamiMetrics = {
  pageviews: 120,
  visitors: 80,
  visits: 90,
  bounces: 45,
  totalTime: 3600,
};

const previous: UmamiMetrics = {
  pageviews: 100,
  visitors: 70,
  visits: 80,
  bounces: 40,
  totalTime: 3000,
};

function performance(
  siteUrl: string,
  metrics: UmamiMetrics,
  trend: UmamiPerformance['trend'] = []
): UmamiPerformance {
  return {
    siteUrl,
    websiteId: `${siteUrl}-id`,
    requestedRange: range,
    startDate: range.startDate,
    endDate: range.endDate,
    metrics,
    previousMetrics: previous,
    deltas: umamiDeltas(metrics, previous),
    trend,
    previousTrend: [],
  };
}

describe('Umami metric arithmetic', () => {
  it('keeps each delta in its own unit', () => {
    expect(umamiDeltas(current, previous)).toEqual({
      pageviews: 20,
      visitors: 10,
      visits: 10,
      bounces: 5,
      totalTime: 600,
    });
  });

  it('adds every metric independently', () => {
    expect(addUmamiMetrics(emptyUmamiMetrics, current)).toEqual(current);
  });
});

describe('Umami trend merging', () => {
  it('emits every date in the range even when a site reported nothing', () => {
    const merged = mergeUmamiTrend(
      [
        [
          { date: '2026-10-01', pageviews: 10, visits: 4 },
          { date: '2026-10-03', pageviews: 6, visits: 2 },
        ],
      ],
      range
    );
    expect(merged).toEqual([
      { date: '2026-10-01', pageviews: 10, visits: 4 },
      { date: '2026-10-02', pageviews: 0, visits: 0 },
      { date: '2026-10-03', pageviews: 6, visits: 2 },
    ]);
  });

  it('sums matching dates across sites', () => {
    const merged = mergeUmamiTrend(
      [
        [{ date: '2026-10-02', pageviews: 5, visits: 2 }],
        [{ date: '2026-10-02', pageviews: 7, visits: 3 }],
      ],
      range
    );
    expect(merged[1]).toEqual({
      date: '2026-10-02',
      pageviews: 12,
      visits: 5,
    });
  });

  it('ignores dates outside the requested range', () => {
    const merged = mergeUmamiTrend(
      [[{ date: '2026-09-30', pageviews: 99, visits: 9 }]],
      range
    );
    expect(merged.every((point) => point.pageviews === 0)).toBe(true);
  });
});

describe('Umami portfolio totals', () => {
  it('adds site metrics and keeps the comparison window aligned', () => {
    const totals = umamiPortfolioPerformance(
      [
        performance('https://a.com/', current),
        performance('https://b.com/', {
          ...current,
          pageviews: 30,
          visitors: 20,
          visits: 25,
          bounces: 5,
          totalTime: 600,
        }),
      ],
      range,
      range
    );
    expect(totals.metrics).toEqual({
      pageviews: 150,
      visitors: 100,
      visits: 115,
      bounces: 50,
      totalTime: 4200,
    });
    expect(totals.previousMetrics).toEqual({
      pageviews: 200,
      visitors: 140,
      visits: 160,
      bounces: 80,
      totalTime: 6000,
    });
    expect(totals.deltas.pageviews).toBe(-50);
    expect(totals.trend).toHaveLength(3);
  });
});
