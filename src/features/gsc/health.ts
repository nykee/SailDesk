import type { SearchMetrics } from './types';

export type SiteHealth = 'growing' | 'declining' | 'mixed' | 'stable' | 'empty';

/** These labels describe observed changes, never an invented SEO health score. */
export const healthDefinitions: Record<
  SiteHealth,
  { label: string; description: string }
> = {
  growing: { label: '增长', description: '点击和曝光均未下降，至少一项增长' },
  declining: { label: '下降', description: '点击和曝光均未增长，至少一项下降' },
  mixed: { label: '走势分化', description: '点击和曝光变化方向相反' },
  stable: { label: '持平', description: '点击和曝光均与上期一致' },
  empty: { label: '无曝光', description: '两个周期均无搜索曝光，无法判断涨跌' },
};

/**
 * Classification uses exact signs of the two comparable volume deltas. There
 * are no arbitrary thresholds, traffic forecasts or heuristic health scores.
 */
export function siteHealth(
  current: SearchMetrics,
  previous: SearchMetrics
): SiteHealth {
  if (!current.impressions && !previous.impressions) return 'empty';
  const clicks = current.clicks - previous.clicks;
  const impressions = current.impressions - previous.impressions;
  if (!clicks && !impressions) return 'stable';
  if (clicks >= 0 && impressions >= 0) return 'growing';
  if (clicks <= 0 && impressions <= 0) return 'declining';
  return 'mixed';
}

/** A zero denominator has no percentage change: show new activity explicitly. */
export function relativeChange(
  current: number,
  previous: number
): number | null {
  return previous === 0
    ? current === 0
      ? 0
      : null
    : (current - previous) / previous;
}
