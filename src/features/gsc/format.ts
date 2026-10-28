import type { SearchMetrics } from '@/features/gsc/types';

/** Shared display rules keep numeric language consistent across metrics and tables. */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(
    value
  );
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPosition(value: number): string {
  return value ? value.toFixed(1) : '—';
}

export function formatMetric(
  metric: keyof SearchMetrics,
  value: number
): string {
  if (metric === 'ctr') return formatPercent(value);
  if (metric === 'position') return formatPosition(value);
  return formatCompact(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
