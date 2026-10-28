import { formatCompact, formatPercent } from '@/features/gsc/format';
import type { Ga4Metrics } from './types';

/** GA4 trend switches stay three-way; GSC keeps its own two-metric chart. */
export const ga4TrendOptions = [
  { key: 'sessions', label: '会话' },
  { key: 'users', label: '用户' },
  { key: 'pageviews', label: '浏览量' },
] as const;

export const ga4MetricLabels: Record<keyof Ga4Metrics, string> = {
  sessions: '会话数',
  users: '活跃用户',
  pageviews: '浏览量',
  engagementRate: '互动率',
  averageSessionDuration: '平均会话时长',
  keyEvents: '关键事件',
};

export function formatGa4Metric(metric: string, value: number): string {
  if (metric === 'engagementRate') return formatPercent(value);
  if (metric === 'averageSessionDuration') return formatDuration(value);
  return formatCompact(value);
}

/** Seconds stay human: 1分23秒 rather than 83.0. */
export function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes ? `${minutes}分${rest}秒` : `${rest}秒`;
}
