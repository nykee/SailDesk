import { formatDate, formatMetric } from '@/features/gsc/format';

/**
 * An SVG chart scales the selected metric only, avoiding the mathematically
 * misleading dual axis. The previous range is index-aligned for a like-for-like
 * comparison. It is dataset-agnostic: callers supply the metric choices and
 * their formatting so GSC and GA4 share one rendering.
 */
/** Any daily series with a date key and numeric metrics can share this chart. */
export type TrendSeries = Array<
  { date: string } & Record<string, number | string>
>;

export function TrendChart({
  trend,
  previousTrend,
  metric,
  metricOptions,
  formatValue,
  emptyLabel,
}: {
  trend: TrendSeries;
  previousTrend: TrendSeries;
  metric: string;
  metricOptions: Array<{ key: string; label: string }>;
  formatValue: (metric: string, value: number) => string;
  emptyLabel: string;
}) {
  const width = 780;
  const height = 250;
  const padding = { top: 16, right: 12, bottom: 32, left: 48 };
  const currentValues = trend.map((point) => Number(point[metric]));
  const previousValues = previousTrend.map((point) => Number(point[metric]));
  const maximum = Math.max(1, ...currentValues, ...previousValues);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const points = (values: number[]) =>
    values.map((value, index) => ({
      x: padding.left + (chartWidth * index) / Math.max(1, values.length - 1),
      y: padding.top + chartHeight - (value / maximum) * chartHeight,
    }));
  const current = points(currentValues);
  const previous = points(previousValues);
  const path = (series: Array<{ x: number; y: number }>) =>
    series
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      )
      .join(' ');
  const gridValues = [0, 0.5, 1];
  const metricLabel =
    metricOptions.find((option) => option.key === metric)?.label ?? metric;

  if (!trend.length) return <div className="chart-empty">{emptyLabel}</div>;

  return (
    <div className="chart-canvas">
      <svg
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="trend-svg"
      >
        <title>{`${metricLabel}趋势图，含当前周期和上一周期对比`}</title>
        {gridValues.map((value) => {
          const y = padding.top + chartHeight - chartHeight * value;
          return (
            <g key={value}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                className="chart-grid"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                className="chart-label"
                textAnchor="end"
              >
                {formatValue(metric, maximum * value)}
              </text>
            </g>
          );
        })}
        {previous.length > 1 && (
          <path d={path(previous)} className="chart-line chart-line-previous" />
        )}
        {current.length > 1 && (
          <path d={path(current)} className="chart-line chart-line-current" />
        )}
        {current.map((point, index) => (
          <circle
            key={trend[index].date}
            cx={point.x}
            cy={point.y}
            r="3.5"
            className="chart-point"
          />
        ))}
        {trend.map((point, originalIndex) => {
          // Retain each actual calendar index, including one/two-point ranges.
          if (
            originalIndex !== 0 &&
            originalIndex !== trend.length - 1 &&
            originalIndex !== Math.floor(trend.length / 2)
          )
            return null;
          return (
            <text
              key={point.date}
              x={current[originalIndex].x}
              y={height - 8}
              className="chart-label"
              textAnchor={
                originalIndex === 0
                  ? 'start'
                  : originalIndex === trend.length - 1
                    ? 'end'
                    : 'middle'
              }
            >
              {formatDate(point.date)}
            </text>
          );
        })}
      </svg>
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="legend-current" />
          当前周期
        </span>
        <span>
          <i className="legend-previous" />
          上一周期
        </span>
      </div>
    </div>
  );
}

/** GSC callers keep one shared definition of the two chartable metrics. */
export const searchTrendOptions = [
  { key: 'clicks', label: '点击' },
  { key: 'impressions', label: '曝光' },
] as const;

export function formatSearchMetric(metric: string, value: number): string {
  return formatMetric(metric as 'clicks' | 'impressions', value);
}
