import {
  IconArrowUpRight,
  IconCalendar,
  IconChartLine,
  IconClick,
  IconSearch,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import {
  type DateRange,
  defaultDateRange,
  previousDateRange,
} from '@/features/gsc/date-range';
import {
  formatMetric,
  formatNumber,
  formatPercent,
  formatPosition,
} from '@/features/gsc/format';
import { relativeChange } from '@/features/gsc/health';
import type {
  ChartMetric,
  SearchMetrics,
  SearchPerformance,
  SearchReport,
} from '@/features/gsc/types';
import {
  formatSearchMetric,
  searchTrendOptions,
  TrendChart,
} from './line-chart';

/** Reused by portfolio and property views; dates and presets have one definition. */
export function DateToolbar({
  range,
  onChange,
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
}) {
  return (
    <section className="toolbar" aria-label="日期范围">
      <fieldset className="preset-group" aria-label="快捷日期">
        <legend className="sr-only">快捷日期</legend>
        {[7, 28, 90].map((days) => {
          const preset = defaultDateRange(new Date(), days);
          const selected =
            range.startDate === preset.startDate &&
            range.endDate === preset.endDate;
          return (
            <button
              key={days}
              type="button"
              className={selected ? 'is-selected' : ''}
              aria-pressed={selected}
              onClick={() => onChange(preset)}
            >
              {days} 天
            </button>
          );
        })}
      </fieldset>
      <div className="date-range">
        <IconCalendar size={17} />
        <label>
          开始
          <input
            type="date"
            value={range.startDate}
            max={range.endDate}
            onChange={(event) =>
              onChange({ ...range, startDate: event.target.value })
            }
          />
        </label>
        <span>至</span>
        <label>
          结束
          <input
            type="date"
            value={range.endDate}
            min={range.startDate}
            max={defaultDateRange().endDate}
            onChange={(event) =>
              onChange({ ...range, endDate: event.target.value })
            }
          />
        </label>
      </div>
    </section>
  );
}

/** Observable data conditions use one accessible, actionable empty/error state. */
export function DataState({
  kind,
  title,
  children,
  onRetry,
}: {
  kind: 'loading' | 'error' | 'empty';
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <section
      className={`data-state data-state-${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {kind === 'loading' ? (
        <span className="loading-mark" />
      ) : (
        <IconSearch size={26} />
      )}
      <h2>{title}</h2>
      {children && <div className="data-state-description">{children}</div>}
      {onRetry && (
        <button type="button" className="refresh-button" onClick={onRetry}>
          重新读取
        </button>
      )}
    </section>
  );
}

/** The exact two compared windows stay visible, including Google completion lag. */
export function PeriodNote({
  range,
  requestedRange,
}: {
  range: DateRange;
  requestedRange: DateRange;
}) {
  const previous = previousDateRange(range);
  return (
    <div className="period-note">
      <p className="data-freshness">
        <span className="live-dot" />
        已完成数据 · {range.startDate} — {range.endDate}
        <span>
          对比 {previous.startDate} — {previous.endDate}
        </span>
      </p>
      {range.endDate !== requestedRange.endDate && (
        <p className="completion-note">
          Google 的最新数据尚未完成，已根据 API
          完成日对齐两个等长周期；未完成数据不参与涨跌判断。
        </p>
      )}
    </div>
  );
}

/** Percentages with no prior denominator are called new activity, never infinity. */
export function VolumeChange({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const change = relativeChange(current, previous);
  const delta = current - previous;
  return (
    <span
      className={`metric-change ${delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''}`}
      title={`上期 ${formatNumber(previous)}；变化 ${delta > 0 ? '+' : ''}${formatNumber(delta)}`}
    >
      {delta !== 0 &&
        (delta > 0 ? (
          <IconTrendingUp size={14} />
        ) : (
          <IconTrendingDown size={14} />
        ))}
      {change === null
        ? '新增'
        : change === 0
          ? '持平'
          : `${change > 0 ? '+' : ''}${formatPercent(change)}`}
    </span>
  );
}

const metricDefinitions = [
  { key: 'clicks', label: '总点击', icon: IconClick },
  { key: 'impressions', label: '总曝光', icon: IconChartLine },
  { key: 'ctr', label: '平均点击率', icon: IconTrendingUp },
  { key: 'position', label: '平均排名', icon: IconSearch },
] as const;

/** Shared totals keep CTR percentage points and ranking-direction semantics exact. */
export function MetricsGrid({
  performance,
}: {
  performance: SearchPerformance;
}) {
  return (
    <section className="metric-grid" aria-label="核心指标">
      {metricDefinitions.map(({ key, label, icon: Icon }) => (
        <article key={key} className="metric-block">
          <div className="metric-label">
            <Icon size={17} />
            <span>{label}</span>
          </div>
          <strong
            title={
              key === 'clicks' || key === 'impressions'
                ? formatNumber(performance.metrics[key])
                : undefined
            }
          >
            {formatMetric(key, performance.metrics[key])}
          </strong>
          {key === 'clicks' || key === 'impressions' ? (
            <VolumeChange
              current={performance.metrics[key]}
              previous={performance.previousMetrics[key]}
            />
          ) : (
            <MetricDifference
              metric={key}
              current={performance.metrics}
              previous={performance.previousMetrics}
            />
          )}
        </article>
      ))}
    </section>
  );
}

function MetricDifference({
  metric,
  current,
  previous,
}: {
  metric: 'ctr' | 'position';
  current: SearchMetrics;
  previous: SearchMetrics;
}) {
  if (!current.impressions || !previous.impressions)
    return <span className="metric-change">暂无可比数据</span>;
  const delta = current[metric] - previous[metric];
  const positive = metric === 'position' ? delta < 0 : delta > 0;
  return (
    <span
      className={`metric-change ${!delta ? '' : positive ? 'is-positive' : 'is-negative'}`}
    >
      {!delta
        ? '与上期持平'
        : metric === 'ctr'
          ? `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(2)} 个百分点`
          : `${positive ? '提升' : '下降'} ${Math.abs(delta).toFixed(1)} 位`}
    </span>
  );
}

/** Same chart, switch and comparison legend for overview and individual reports. */
export function PerformanceChart({
  performance,
  metric,
  onMetric,
  title = '搜索表现趋势',
}: {
  performance: SearchPerformance;
  metric: ChartMetric;
  onMetric: (metric: ChartMetric) => void;
  title?: string;
}) {
  return (
    <section className="chart-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PERFORMANCE TREND</p>
          <h2>{title}</h2>
        </div>
        <fieldset className="metric-switch">
          <legend className="sr-only">趋势指标</legend>
          {searchTrendOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={metric === option.key ? 'is-active' : ''}
              aria-pressed={metric === option.key}
              onClick={() => onMetric(option.key as ChartMetric)}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </div>
      <TrendChart
        trend={performance.trend}
        previousTrend={performance.previousTrend}
        metric={metric}
        metricOptions={[...searchTrendOptions]}
        formatValue={formatSearchMetric}
        emptyLabel="此日期范围还没有可展示的 Search Console 数据。"
      />
    </section>
  );
}

/** URLs are long; the path is what a reader compares, the full URL stays in `title`. */
function pagePath(page: string): string {
  try {
    return new URL(page).pathname || '/';
  } catch {
    return page;
  }
}

/** Keywords are a property-specific detail; the summary/chart remain reusable. */
export function PropertyReport({
  report,
  metric,
  onMetric,
}: {
  report: SearchReport;
  metric: ChartMetric;
  onMetric: (metric: ChartMetric) => void;
}) {
  return (
    <div className="report-content">
      <PeriodNote range={report} requestedRange={report.requestedRange} />
      <MetricsGrid performance={report} />
      <PerformanceChart
        performance={report}
        metric={metric}
        onMetric={onMetric}
      />
      <section className="query-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SEARCH QUERIES</p>
            <h2>带来流量的关键词</h2>
          </div>
          <span className="query-count">前 {report.queries.length} 项</span>
        </div>
        <div className="query-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">搜索查询</th>
                <th scope="col">点击</th>
                <th scope="col">曝光</th>
                <th scope="col">CTR</th>
                <th scope="col">平均排名</th>
              </tr>
            </thead>
            <tbody>
              {report.queries.map((query) => (
                <tr key={query.query}>
                  <th scope="row">{query.query}</th>
                  <td>{formatNumber(query.clicks)}</td>
                  <td>{formatNumber(query.impressions)}</td>
                  <td>{formatPercent(query.ctr)}</td>
                  <td>{formatPosition(query.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.queries.length && (
            <div className="table-empty">该范围内没有关键词数据。</div>
          )}
        </div>
      </section>
      <section className="query-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LANDING PAGES</p>
            <h2>获得曝光的页面</h2>
          </div>
          <span className="query-count">前 {report.pages.length} 项</span>
        </div>
        <div className="query-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">页面</th>
                <th scope="col">点击</th>
                <th scope="col">曝光</th>
                <th scope="col">CTR</th>
                <th scope="col">平均排名</th>
              </tr>
            </thead>
            <tbody>
              {report.pages.map((row) => (
                <tr key={row.page}>
                  <th scope="row" title={row.page}>
                    {pagePath(row.page)}
                  </th>
                  <td>{formatNumber(row.clicks)}</td>
                  <td>{formatNumber(row.impressions)}</td>
                  <td>{formatPercent(row.ctr)}</td>
                  <td>{formatPosition(row.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.pages.length && (
            <div className="table-empty">该范围内没有页面数据。</div>
          )}
        </div>
      </section>
    </div>
  );
}

/** The same no-resources state is shared by both dashboard entry routes. */
export function EmptyProperties() {
  return (
    <DataState kind="empty" title="没有可用的 GSC 项目">
      <p>当前 Google 账号尚未验证任何网站资源，或没有对应资源的读取权限。</p>
      <a
        href="https://search.google.com/search-console"
        target="_blank"
        rel="noreferrer"
      >
        前往 Search Console 添加资源 <IconArrowUpRight size={16} />
      </a>
    </DataState>
  );
}
