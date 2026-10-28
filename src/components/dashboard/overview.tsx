import {
  IconArrowDown,
  IconArrowUp,
  IconArrowUpRight,
  IconSearch,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import {
  formatNumber,
  formatPercent,
  formatPosition,
} from '@/features/gsc/format';
import {
  healthDefinitions,
  type SiteHealth,
  siteHealth,
} from '@/features/gsc/health';
import { propertyName } from '@/features/gsc/property';
import type {
  ChartMetric,
  OverviewReport,
  OverviewSite,
  SearchMetrics,
  TrendPoint,
} from '@/features/gsc/types';
import {
  DataState,
  MetricsGrid,
  PerformanceChart,
  PeriodNote,
  VolumeChange,
} from './report-components';

type HealthFilter = 'all' | SiteHealth | 'error';
type SortKey =
  | 'site'
  | 'clicks'
  | 'impressions'
  | 'clickDelta'
  | 'impressionDelta';
const filterLabels: Record<HealthFilter, string> = {
  all: '全部站点',
  growing: healthDefinitions.growing.label,
  declining: healthDefinitions.declining.label,
  mixed: healthDefinitions.mixed.label,
  stable: healthDefinitions.stable.label,
  empty: healthDefinitions.empty.label,
  error: '读取失败',
};

/** No synthetic score: badges describe the exact signs of clicks and impressions. */
export function HealthBadge({ health }: { health: SiteHealth }) {
  return (
    <span
      className={`health-badge health-${health}`}
      title={healthDefinitions[health].description}
    >
      <span />
      {healthDefinitions[health].label}
    </span>
  );
}

/**
 * Portfolio-only filtering/sorting remains local to this view, while metrics,
 * date controls, change formatting and full trend charts are shared with details.
 */
export function Overview({
  report,
  metric,
  onMetric,
  onSelect,
  onRetry,
}: {
  report: OverviewReport;
  metric: ChartMetric;
  onMetric: (metric: ChartMetric) => void;
  onSelect: (siteUrl: string) => void;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<HealthFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({
    key: 'clickDelta',
    direction: 1,
  });
  const counts = useMemo(() => {
    const result: Record<HealthFilter, number> = {
      all: report.sites.length,
      growing: 0,
      declining: 0,
      mixed: 0,
      stable: 0,
      empty: 0,
      error: 0,
    };
    for (const site of report.sites)
      result[
        site.status === 'error'
          ? 'error'
          : siteHealth(
              site.performance.metrics,
              site.performance.previousMetrics
            )
      ] += 1;
    return result;
  }, [report.sites]);
  const rows = useMemo(
    () =>
      report.sites
        .filter((site) => {
          const health =
            site.status === 'error'
              ? 'error'
              : siteHealth(
                  site.performance.metrics,
                  site.performance.previousMetrics
                );
          return (
            (filter === 'all' || health === filter) &&
            propertyName(site.property.siteUrl)
              .toLowerCase()
              .includes(search.trim().toLowerCase())
          );
        })
        .sort((left, right) => {
          if (sort.key === 'site')
            return (
              sort.direction *
              propertyName(left.property.siteUrl).localeCompare(
                propertyName(right.property.siteUrl)
              )
            );
          // Errors have no numeric value and always follow comparable data, in either direction.
          if (left.status === 'error') return right.status === 'error' ? 0 : 1;
          if (right.status === 'error') return -1;
          const value = (site: Extract<OverviewSite, { status: 'ready' }>) =>
            sort.key === 'clickDelta'
              ? site.performance.deltas.clicks
              : sort.key === 'impressionDelta'
                ? site.performance.deltas.impressions
                : site.performance.metrics[sort.key as keyof SearchMetrics];
          return (
            sort.direction * (value(left) - value(right)) ||
            propertyName(left.property.siteUrl).localeCompare(
              propertyName(right.property.siteUrl)
            )
          );
        }),
    [report.sites, filter, search, sort]
  );

  function changeSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === 1
            ? -1
            : 1
          : key === 'site' || key === 'clickDelta' || key === 'impressionDelta'
            ? 1
            : -1,
    }));
  }

  return (
    <div className="report-content overview-content">
      <PeriodNote range={report.range} requestedRange={report.requestedRange} />
      <section className="health-summary" aria-label="站点涨跌概览">
        {(['growing', 'declining', 'mixed', 'empty'] as const).map((health) => (
          <button
            key={health}
            type="button"
            className={`health-summary-item summary-${health} ${filter === health ? 'is-selected' : ''}`}
            aria-pressed={filter === health}
            title={healthDefinitions[health].description}
            onClick={() =>
              setFilter((current) => (current === health ? 'all' : health))
            }
          >
            <span className="health-summary-label">
              <span className={`health-dot health-${health}`} />
              {healthDefinitions[health].label}
            </span>
            <strong>
              {counts[health]}
              <span>个站点</span>
            </strong>
            <span className="summary-action">
              {health === 'declining'
                ? '优先关注下滑站点'
                : health === 'growing'
                  ? '查看增长来源'
                  : health === 'mixed'
                    ? '点击与曝光方向不同'
                    : '尚无可比较的搜索数据'}
              <IconArrowUpRight size={14} />
            </span>
          </button>
        ))}
      </section>
      <section
        className="portfolio-sites"
        aria-labelledby="site-performance-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">SITE PERFORMANCE</p>
            <h2 id="site-performance-title">
              站点表现
              <span className="heading-count">{report.sites.length}</span>
            </h2>
          </div>
          <span className="table-hint">
            默认按点击变化排序，下降最多的站点在前
          </span>
        </div>
        <div className="site-table-controls">
          <fieldset className="health-filters" aria-label="筛选站点状态">
            <legend className="sr-only">筛选站点状态</legend>
            {(Object.keys(filterLabels) as HealthFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                className={filter === key ? 'is-active' : ''}
                onClick={() => setFilter(key)}
              >
                {filterLabels[key]}
                <span>{counts[key]}</span>
              </button>
            ))}
          </fieldset>
          <label className="site-search">
            <IconSearch size={15} />
            <span className="sr-only">搜索站点</span>
            <input
              type="search"
              placeholder="搜索域名…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        {counts.error > 0 && (
          <div className="notice" role="alert">
            <span>
              {counts.error}{' '}
              个站点读取失败，未参与涨跌判断；汇总指标和总趋势暂不可用。
            </span>
            <button type="button" onClick={onRetry}>
              重新读取
            </button>
          </div>
        )}
        <section className="site-table-scroll" aria-label="站点表现表格">
          <table className="site-table">
            <thead>
              <tr>
                <SortHeading
                  label="站点"
                  column="site"
                  sort={sort}
                  onSort={changeSort}
                />
                <th scope="col">趋势状态</th>
                <SortHeading
                  label="点击"
                  column="clicks"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortHeading
                  label="点击变化"
                  column="clickDelta"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortHeading
                  label="曝光"
                  column="impressions"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortHeading
                  label="曝光变化"
                  column="impressionDelta"
                  sort={sort}
                  onSort={changeSort}
                />
                <th scope="col">点击趋势</th>
                <th scope="col">CTR</th>
                <th scope="col">平均排名</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((site) => (
                <SiteRow
                  key={site.property.siteUrl}
                  site={site}
                  onSelect={onSelect}
                />
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="table-empty" aria-live="polite">
              没有符合当前条件的站点。
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setFilter('all');
                  setSearch('');
                }}
              >
                清除筛选
              </button>
            </div>
          )}
        </section>
        <div className="table-footer">
          <span>
            显示 {rows.length} / {report.sites.length} 个站点 ·
            变化值均对比上一等长周期
          </span>
          <span>
            点击站点查看详情 <IconArrowUpRight size={13} />
          </span>
        </div>
      </section>
      <details className="health-method">
        <summary>涨跌判断与数据口径</summary>
        <div>
          <p>
            增长：点击和曝光均未下降，至少一项增长。下降：两项均未增长，至少一项下降。走势分化：点击和曝光方向相反。持平：两项均一致。无曝光：两个周期均无曝光，无法判断。以上描述搜索表现变化，不代表完整
            SEO 健康诊断。
          </p>
          <p>
            百分比以上期为基数；上期为零而本期有数据时显示「新增」。排名数值越低越好。总排名按曝光量加权，CTR
            为总点击除以总曝光。搜索类型为网页搜索，仅比较 Google 已完成的数据。
          </p>
          {report.excludedProperties.length > 0 && (
            <p>
              为避免重复计数，总览排除已被更大资源范围覆盖的 Property：
              {report.excludedProperties
                .map((property) => property.siteUrl)
                .join('、')}
              。这些资源仍可从侧栏进入单站详情。
            </p>
          )}
        </div>
      </details>
      {report.totals ? (
        <section className="portfolio-aggregate" aria-label="全部站点汇总">
          <div className="section-heading">
            <div>
              <p className="eyebrow">COMBINED PERFORMANCE</p>
              <h2>全部站点汇总</h2>
            </div>
            <span className="query-count">
              {report.sites.length} 个不重叠资源
            </span>
          </div>
          <MetricsGrid performance={report.totals} />
          <PerformanceChart
            performance={report.totals}
            metric={metric}
            onMetric={onMetric}
            title="全部站点搜索趋势"
          />
        </section>
      ) : (
        counts.error === 0 && (
          <DataState kind="empty" title="暂无可汇总的站点数据" />
        )
      )}
    </div>
  );
}

/** Sort direction is available to assistive technology and never inferred by color. */
function SortHeading({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; direction: 1 | -1 };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === column;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined
      }
    >
      <button type="button" onClick={() => onSort(column)}>
        {label}
        {active &&
          (sort.direction === 1 ? (
            <IconArrowUp size={12} />
          ) : (
            <IconArrowDown size={12} />
          ))}
      </button>
    </th>
  );
}

/** Failed rows explicitly span the numeric columns instead of manufacturing zeros. */
function SiteRow({
  site,
  onSelect,
}: {
  site: OverviewSite;
  onSelect: (siteUrl: string) => void;
}) {
  const property = site.property;
  const performance = site.status === 'ready' ? site.performance : null;
  return (
    <tr>
      <th scope="row">
        <button
          className="site-name-button"
          type="button"
          onClick={() => onSelect(property.siteUrl)}
          title={property.siteUrl}
        >
          <span className="project-favicon">
            {propertyName(property.siteUrl).slice(0, 1).toUpperCase()}
          </span>
          <span>{propertyName(property.siteUrl)}</span>
          <IconArrowUpRight size={13} />
        </button>
      </th>
      {performance ? (
        <>
          <td>
            <HealthBadge
              health={siteHealth(
                performance.metrics,
                performance.previousMetrics
              )}
            />
          </td>
          <td className="volume-cell">
            {formatNumber(performance.metrics.clicks)}
          </td>
          <td>
            <DeltaCell metric="clicks" performance={performance} />
          </td>
          <td className="volume-cell">
            {formatNumber(performance.metrics.impressions)}
          </td>
          <td>
            <DeltaCell metric="impressions" performance={performance} />
          </td>
          <td>
            <Sparkline trend={performance.trend} />
          </td>
          <td>{formatPercent(performance.metrics.ctr)}</td>
          <td>{formatPosition(performance.metrics.position)}</td>
        </>
      ) : (
        <>
          <td>
            <span className="health-badge health-error">读取失败</span>
          </td>
          <td colSpan={7} className="site-error">
            {site.status === 'error' ? site.error : ''}
          </td>
        </>
      )}
    </tr>
  );
}

function DeltaCell({
  metric,
  performance,
}: {
  metric: 'clicks' | 'impressions';
  performance: {
    metrics: SearchMetrics;
    previousMetrics: SearchMetrics;
    deltas: SearchMetrics;
  };
}) {
  const delta = performance.deltas[metric];
  return (
    <div className="delta-cell">
      <VolumeChange
        current={performance.metrics[metric]}
        previous={performance.previousMetrics[metric]}
      />
      <span>
        {delta > 0 ? '+' : ''}
        {formatNumber(delta)}
      </span>
    </div>
  );
}

/** Every row uses the same calendar spacing; mini charts show within-site shape. */
function Sparkline({ trend }: { trend: TrendPoint[] }) {
  const maximum = Math.max(1, ...trend.map((point) => point.clicks));
  const points = trend
    .map(
      (point, index) =>
        `${2 + (index * 90) / Math.max(1, trend.length - 1)},${28 - (point.clicks / maximum) * 24}`
    )
    .join(' ');
  return (
    <svg
      className="site-sparkline"
      viewBox="0 0 96 34"
      role="img"
      aria-label="本周期每日点击趋势，各站独立刻度"
    >
      <title>本周期每日点击趋势，各站独立刻度</title>
      <line x1="0" y1="29" x2="96" y2="29" />
      <polyline points={points} />
    </svg>
  );
}
