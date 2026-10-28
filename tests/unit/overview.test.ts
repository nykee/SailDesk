import { describe, expect, it } from 'vitest';
import {
  completedDateRange,
  dateKeys,
  isValidDateRange,
  isWithinRetention,
  oldestSearchConsoleDate,
  previousDateRange,
} from '@/features/gsc/date-range';
import { relativeChange, siteHealth } from '@/features/gsc/health';
import { aggregateMetrics, aggregateTrend } from '@/features/gsc/metrics';
import {
  overviewProperties,
  propertyContains,
  propertyName,
  propertyWebsite,
} from '@/features/gsc/property';

const metrics = (clicks: number, impressions: number, position = 5) => ({
  clicks,
  impressions,
  position,
  ctr: impressions ? clicks / impressions : 0,
});

describe('observable portfolio health', () => {
  it('distinguishes gains, losses, mixed directions, unchanged and unavailable activity', () => {
    const previous = metrics(10, 100);
    expect(siteHealth(metrics(20, 200), previous)).toBe('growing');
    expect(siteHealth(metrics(10, 200), previous)).toBe('growing');
    expect(siteHealth(metrics(5, 100), previous)).toBe('declining');
    expect(siteHealth(metrics(0, 0), previous)).toBe('declining');
    expect(siteHealth(metrics(20, 50), previous)).toBe('mixed');
    expect(siteHealth(metrics(5, 200), previous)).toBe('mixed');
    expect(siteHealth(previous, previous)).toBe('stable');
    expect(siteHealth(metrics(0, 0), metrics(0, 0))).toBe('empty');
    expect(siteHealth(metrics(0, 10), metrics(0, 0))).toBe('growing');
  });

  it('does not invent an infinite growth percentage for a zero baseline', () => {
    expect(relativeChange(1, 0)).toBeNull();
    expect(relativeChange(0, 0)).toBe(0);
    expect(relativeChange(0, 10)).toBe(-1);
    expect(relativeChange(15, 10)).toBe(0.5);
  });
});

describe('comparable completed calendar windows', () => {
  it('clamps the Pacific-time retention boundary at month-end', () => {
    expect(oldestSearchConsoleDate(new Date('2026-10-31T20:00:00Z'))).toBe(
      '2025-06-30'
    );
  });
  it('keeps every accepted API range inside the 16-month retention window', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    expect(
      isWithinRetention({ startDate: '2026-09-28', endDate: '2026-10-25' }, now)
    ).toBe(true);
    expect(
      isWithinRetention({ startDate: '2025-01-01', endDate: '2025-01-28' }, now)
    ).toBe(false);
    // The comparison period, not the selected one, sets the boundary.
    expect(
      isWithinRetention({ startDate: '2025-07-25', endDate: '2025-08-21' }, now)
    ).toBe(true);
    expect(
      isWithinRetention({ startDate: '2025-07-24', endDate: '2025-08-20' }, now)
    ).toBe(false);
  });
  it('uses the earliest reported incomplete day across all properties and retains window length', () => {
    const range = completedDateRange(
      { startDate: '2026-09-23', endDate: '2026-10-20' },
      ['2026-10-20', '2026-10-19']
    );
    expect(range).toEqual({ startDate: '2026-09-21', endDate: '2026-10-18' });
    expect(dateKeys(range)).toHaveLength(28);
    expect(previousDateRange(range)).toEqual({
      startDate: '2026-08-24',
      endDate: '2026-09-20',
    });
  });

  it('preserves explicitly requested historical periods when no incomplete day is present', () => {
    const range = { startDate: '2024-02-28', endDate: '2024-03-01' };
    expect(completedDateRange(range, [])).toEqual(range);
    expect(dateKeys(range)).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });

  it('rejects invalid months/days without throwing while the user edits a date', () => {
    expect(
      isValidDateRange({ startDate: '2026-13-01', endDate: '2026-14-01' })
    ).toBe(false);
    expect(isValidDateRange({ startDate: '', endDate: '2026-10-20' })).toBe(
      false
    );
  });
});

describe('correct metric aggregation', () => {
  it('weights position by impressions and computes CTR from the total denominator', () => {
    expect(aggregateMetrics([metrics(1, 10, 1), metrics(9, 90, 11)])).toEqual({
      clicks: 10,
      impressions: 100,
      ctr: 0.1,
      position: 10,
    });
    expect(aggregateMetrics([])).toEqual(metrics(0, 0, 0));
  });

  it('joins sparse series by calendar date without aligning different dates together', () => {
    const points = aggregateTrend(
      [
        [{ date: '2026-10-01', ...metrics(1, 10) }],
        [{ date: '2026-10-03', ...metrics(2, 20) }],
      ],
      { startDate: '2026-10-01', endDate: '2026-10-03' }
    );
    expect(points.map(({ date, clicks }) => ({ date, clicks }))).toEqual([
      { date: '2026-10-01', clicks: 1 },
      { date: '2026-10-02', clicks: 0 },
      { date: '2026-10-03', clicks: 2 },
    ]);
  });
});

describe('GSC scope containment', () => {
  it('excludes covered prefixes/subdomains without confusing lookalike domains', () => {
    const properties = [
      'sc-domain:example.com',
      'https://example.com/',
      'sc-domain:blog.example.com',
      'sc-domain:notexample.com',
    ].map((siteUrl) => ({ siteUrl, permissionLevel: 'siteOwner' }));
    const result = overviewProperties(properties);
    expect(result.included.map((property) => property.siteUrl)).toEqual([
      'sc-domain:example.com',
      'sc-domain:notexample.com',
    ]);
    expect(result.excluded).toHaveLength(2);
    expect(
      propertyContains('sc-domain:example.com', 'https://notexample.com/')
    ).toBe(false);
    expect(
      propertyContains(
        'https://example.com/blog/',
        'https://example.com/blog/post'
      )
    ).toBe(true);
    expect(
      propertyContains('https://example.com/', 'http://example.com/')
    ).toBe(false);
  });

  it('retains paths in names and produces a real link for domain resources', () => {
    expect(propertyName('https://example.com/blog/')).toBe('example.com/blog/');
    expect(propertyWebsite('sc-domain:example.com')).toBe(
      'https://example.com'
    );
  });
});
