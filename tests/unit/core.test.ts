import { describe, expect, it } from 'vitest';
import { websiteConfig } from '@/config/website';
import {
  defaultDateRange,
  isValidDateRange,
  previousDateRange,
} from '@/features/gsc/date-range';
import { formatMetric } from '@/features/gsc/format';

describe('dashboard core contracts', () => {
  it('uses the SailDesk identity and private visual colors', () => {
    expect(websiteConfig.name).toBe('SailDesk');
    expect(websiteConfig.colors.background).toBe('#0d0f12');
    expect(websiteConfig.colors.theme).toBe('#a6ff65');
  });

  it('creates the complete 28-day range ending yesterday', () => {
    expect(defaultDateRange(new Date('2026-08-31T12:00:00.000Z'))).toEqual({
      startDate: '2026-08-03',
      endDate: '2026-08-30',
    });
  });

  it('calculates an immediately preceding range with the same inclusive length', () => {
    expect(
      previousDateRange({ startDate: '2026-08-03', endDate: '2026-08-30' })
    ).toEqual({ startDate: '2026-07-06', endDate: '2026-08-02' });
  });

  it('rejects malformed, impossible, and inverted date ranges', () => {
    expect(
      isValidDateRange({ startDate: '2026-02-29', endDate: '2026-03-01' })
    ).toBe(false);
    expect(
      isValidDateRange({ startDate: '2026-08-30', endDate: '2026-08-03' })
    ).toBe(false);
    expect(
      isValidDateRange({ startDate: '2026/08/03', endDate: '2026-08-30' })
    ).toBe(false);
    expect(
      isValidDateRange({ startDate: '2026-08-03', endDate: '2026-08-30' })
    ).toBe(true);
  });

  it('uses metric-aware number formatting', () => {
    expect(formatMetric('ctr', 0.1234)).toBe('12.34%');
    expect(formatMetric('position', 5.25)).toBe('5.3');
  });
});
