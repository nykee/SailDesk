import { describe, expect, it } from 'vitest';
import type { BingStatsRow } from '@/features/bing/metrics';
import {
  aggregateBingPortfolioWeeks,
  aggregateBingWeeks,
  bingMetricsFromWeeks,
  bingTopPages,
  bingTopQueries,
  buildBingPerformance,
  mergeBingMetrics,
  mergeBingMetricsList,
  parseBingDate,
} from '@/features/bing/metrics';
import type { BingWeekPoint } from '@/features/bing/types';

describe('Bing .NET dates', () => {
  it('parses the /Date(ms)/ envelope onto ISO calendar keys', () => {
    expect(parseBingDate('/Date(1761753600000)/')).toBe('2025-10-29');
    expect(parseBingDate('/Date(1762358400000)/')).toBe('2025-11-05');
    expect(parseBingDate('not-a-date')).toBeNull();
  });
});

const week = (
  weekStart: string,
  clicks: number,
  impressions: number,
  position = 0
): BingWeekPoint => ({
  weekStart,
  clicks,
  impressions,
  position,
});

describe('Bing weekly aggregation', () => {
  it('folds per-query rows into one impression-weighted bucket per week', () => {
    const rows: BingStatsRow[] = [
      {
        Query: 'a',
        Clicks: 10,
        Impressions: 100,
        AvgImpressionPosition: 2,
        Date: '/Date(1761753600000)/',
      },
      {
        Query: 'a',
        Clicks: 5,
        Impressions: 50,
        AvgImpressionPosition: 4,
        Date: '/Date(1761753600000)/',
      },
      {
        Query: 'b',
        Clicks: 3,
        Impressions: 30,
        AvgImpressionPosition: 1,
        Date: '/Date(1762358400000)/',
      },
    ];
    const weeks = aggregateBingWeeks(rows);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({
      weekStart: '2025-10-29',
      clicks: 15,
      impressions: 150,
    });
    // (100*2 + 50*4) / 150 = 2.666...
    expect(weeks[0].position).toBeCloseTo(2.6667, 3);
    const metrics = bingMetricsFromWeeks(weeks);
    expect(metrics.clicks).toBe(18);
    expect(metrics.impressions).toBe(180);
    expect(metrics.ctr).toBeCloseTo(0.1, 5);
  });

  it('excludes the -1 no-clicks position marker from the weighted average', () => {
    const rows: BingStatsRow[] = [
      {
        Clicks: 0,
        Impressions: 100,
        AvgImpressionPosition: -1,
        Date: '/Date(1761753600000)/',
      },
    ];
    const weeks = aggregateBingWeeks(rows);
    expect(weeks[0].position).toBe(0);
  });
});

describe('Bing current vs previous window', () => {
  it('takes the trailing four weeks as current, earlier weeks as previous', () => {
    const weeks: BingWeekPoint[] = [
      week('2025-09-10', 1, 10),
      week('2025-09-17', 2, 20),
      week('2025-09-24', 3, 30),
      week('2025-10-01', 4, 40),
      week('2025-10-08', 5, 50),
      week('2025-10-15', 6, 60),
    ];
    const performance = buildBingPerformance(
      'sc-domain:example.com',
      'https://example.com/',
      weeks,
      false
    );
    expect(performance.metrics.clicks).toBe(18); // last 4 weeks
    expect(performance.previousMetrics?.clicks).toBe(3); // first 2 weeks
    expect(performance.weekCount).toBe(6);
  });

  it('reports no previous window with fewer than five buckets', () => {
    const weeks = [week('2025-10-08', 5, 50), week('2025-10-15', 6, 60)];
    const performance = buildBingPerformance(
      'sc-domain:example.com',
      'https://example.com/',
      weeks,
      false
    );
    expect(performance.previousMetrics).toBeNull();
  });
});

describe('Bing top queries and pages', () => {
  it('collapses weekly rows and sorts by clicks', () => {
    const rows: BingStatsRow[] = [
      {
        Query: 'b',
        Clicks: 1,
        Impressions: 10,
        AvgImpressionPosition: 3,
        Date: '/Date(1761753600000)/',
      },
      {
        Query: 'a',
        Clicks: 9,
        Impressions: 90,
        AvgImpressionPosition: 2,
        Date: '/Date(1761753600000)/',
      },
      {
        Query: 'a',
        Clicks: 1,
        Impressions: 10,
        AvgImpressionPosition: 2,
        Date: '/Date(1762358400000)/',
      },
    ];
    const queries = bingTopQueries(rows, 20);
    expect(queries[0]).toMatchObject({
      query: 'a',
      clicks: 10,
      impressions: 100,
    });
    expect(queries[1].query).toBe('b');
  });

  it('aggregates page rows across weeks', () => {
    const rows: BingStatsRow[] = [
      {
        Page: '/x',
        Clicks: 2,
        Impressions: 20,
        AvgImpressionPosition: 5,
        Date: '/Date(1761753600000)/',
      },
      {
        Page: '/x',
        Clicks: 3,
        Impressions: 30,
        AvgImpressionPosition: 1,
        Date: '/Date(1762358400000)/',
      },
    ];
    const pages = bingTopPages(rows, 20);
    expect(pages[0]).toMatchObject({ page: '/x', clicks: 5, impressions: 50 });
    expect(pages[0].position).toBeCloseTo((20 * 5 + 30 * 1) / 50, 3);
  });

  it('reads the page URL from Query when GetPageStats omits Page', () => {
    // Bing's GetPageStats reuses the QueryStats shape, so the page lives in Query.
    const rows: BingStatsRow[] = [
      {
        Query: 'https://example.com/page-a',
        Clicks: 4,
        Impressions: 40,
        AvgImpressionPosition: 3,
        Date: '/Date(1761753600000)/',
      },
      {
        Query: 'https://example.com/page-a',
        Clicks: 1,
        Impressions: 10,
        AvgImpressionPosition: 2,
        Date: '/Date(1762358400000)/',
      },
    ];
    const pages = bingTopPages(rows, 20);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      page: 'https://example.com/page-a',
      clicks: 5,
      impressions: 50,
    });
  });
});

describe('Bing portfolio merge', () => {
  it('sums clicks/impressions and impression-weights position', () => {
    // both weeks carry position 1, so the merged position stays 1
    const merged = mergeBingMetrics(
      bingMetricsFromWeeks([week('2025-10-08', 10, 100, 1)]),
      bingMetricsFromWeeks([week('2025-10-15', 10, 100, 1)])
    );
    expect(merged.clicks).toBe(20);
    expect(merged.impressions).toBe(200);
    expect(merged.position).toBeCloseTo(1, 5);
    // different positions blend by impressions: (100*1 + 100*3) / 200 = 2
    const blended = mergeBingMetrics(
      bingMetricsFromWeeks([week('2025-10-08', 10, 100, 1)]),
      bingMetricsFromWeeks([week('2025-10-15', 10, 100, 3)])
    );
    expect(blended.position).toBeCloseTo(2, 5);
  });

  it('merges a list and builds impression-weighted portfolio weeks', () => {
    const list = [week('2025-10-08', 10, 100), week('2025-10-15', 20, 200)];
    const totals = mergeBingMetricsList(
      list.map((w) => bingMetricsFromWeeks([w]))
    );
    expect(totals.clicks).toBe(30);
    const portfolio = aggregateBingPortfolioWeeks([
      {
        siteUrl: '',
        bingSiteUrl: '',
        weeks: list,
        metrics: bingMetricsFromWeeks(list),
        previousMetrics: null,
        weekCount: 2,
        truncated: false,
      },
    ]);
    expect(portfolio).toHaveLength(2);
    expect(portfolio[0].clicks).toBe(10);
  });
});
