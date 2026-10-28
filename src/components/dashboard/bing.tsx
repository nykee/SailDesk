import {
  IconArrowUpRight,
  IconBrandBing,
  IconClick,
  IconEye,
  IconPercentage,
  IconSortAscending,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type {
  BingOverviewReport,
  BingOverviewSite,
  BingPerformance,
  BingSiteReport,
} from '@/features/bing/types';
import {
  formatNumber,
  formatPercent,
  formatPosition,
} from '@/features/gsc/format';
import { propertyName } from '@/features/gsc/property';
import { TrendChart } from './line-chart';
import { DataState, VolumeChange } from './report-components';

export type BingResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const bingMetricIcons = {
  clicks: IconClick,
  impressions: IconEye,
  ctr: IconPercentage,
  position: IconSortAscending,
} as const;

const bingMetricLabels = {
  clicks: '点击',
  impressions: '曝光',
  ctr: '点击率',
  position: '平均排名',
} as const;

type BingMetricKey = keyof typeof bingMetricLabels;

/** Bing cards reuse the GSC grid anatomy; every delta keeps its own unit. */
export function BingMetricsGrid({
  performance,
}: {
  performance: BingPerformance;
}) {
  return (
    <section className="metric-grid" aria-label="Bing 核心指标">
      {(Object.keys(bingMetricLabels) as BingMetricKey[]).map((key) => {
        const Icon = bingMetricIcons[key];
        const value = performance.metrics[key];
        const previous = performance.previousMetrics?.[key];
        return (
          <article key={key} className="metric-block">
            <div className="metric-label">
              <Icon size={17} />
              <span>{bingMetricLabels[key]}</span>
            </div>
            <strong>
              {key === 'ctr'
                ? formatPercent(value)
                : key === 'position'
                  ? formatPosition(value)
                  : formatNumber(value)}
            </strong>
            {previous !== undefined ? (
              <VolumeChange current={value} previous={previous} />
            ) : (
              <span className="metric-sub">暂无上一周期</span>
            )}
          </article>
        );
      })}
    </section>
  );
}

/** Bing trend switches between clicks and impressions, weekly buckets. */
export function BingTrendSection({
  performance,
  metric,
  onMetric,
  title,
}: {
  performance: BingPerformance;
  metric: string;
  onMetric: (metric: string) => void;
  title: string;
}) {
  return (
    <section className="chart-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BING TREND</p>
          <h2>{title}</h2>
        </div>
        <fieldset className="metric-switch">
          <legend className="sr-only">Bing 趋势指标</legend>
          {bingTrendOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={metric === option.key ? 'is-active' : ''}
              aria-pressed={metric === option.key}
              onClick={() => onMetric(option.key)}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </div>
      <TrendChart
        trend={performance.weeks.map((week) => ({
          date: week.weekStart,
          clicks: week.clicks,
          impressions: week.impressions,
        }))}
        previousTrend={[]}
        metric={metric}
        metricOptions={[...bingTrendOptions]}
        formatValue={formatBingMetric}
        emptyLabel="此范围还没有可展示的 Bing 数据。"
      />
    </section>
  );
}

const bingTrendOptions = [
  { key: 'clicks', label: '点击' },
  { key: 'impressions', label: '曝光' },
] as const;

function formatBingMetric(metric: string, value: number): string {
  return formatNumber(value);
}

/**
 * Portfolio Bing data loads beside (never inside) the Search Console overview,
 * so one API's failure cannot blank the other's already-rendered data.
 */
export function BingOverviewSection({
  resource,
}: {
  resource: BingResource<BingOverviewReport>;
}) {
  if (resource.loading)
    return (
      <section className="bing-section" aria-label="Bing Webmaster 流量">
        <DataState kind="loading" title="正在读取 Bing 流量数据…" />
      </section>
    );
  if (resource.error)
    return (
      <section className="bing-section" aria-label="Bing Webmaster 流量">
        <DataState
          kind="error"
          title="无法读取 Bing 流量数据"
          onRetry={resource.refresh}
        >
          {resource.error}
        </DataState>
      </section>
    );
  if (!resource.data) return null;
  const report = resource.data;
  if (!report.configured)
    return (
      <section className="bing-section" aria-label="Bing Webmaster 流量">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BING WEBMASTER</p>
            <h2>
              <IconBrandBing size={20} /> 流量分析（Bing Webmaster）
            </h2>
          </div>
        </div>
        <DataState kind="empty" title="尚未配置 Bing API 密钥">
          <p>
            在 Bing Webmaster Tools 生成 API 密钥，并用{' '}
            <code>wrangler secret put BING_API_KEY</code> 写入 Cloudflare
            后，这里会显示各站点的 Bing 点击与曝光。
          </p>
        </DataState>
      </section>
    );
  if (!report.available)
    return (
      <section className="bing-section" aria-label="Bing Webmaster 流量">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BING WEBMASTER</p>
            <h2>
              <IconBrandBing size={20} /> 流量分析（Bing Webmaster）
            </h2>
          </div>
        </div>
        <DataState kind="empty" title="Bing 缓存数据尚未同步">
          <p>
            Bing 限流了 Cloudflare Workers 的共享出向 IP，看板改从缓存读取 Bing
            数据。缓存尚未播种（或已过期），请由干净 IP 重新运行播种脚本，
            或稍后自动同步任务触发后重试。
          </p>
        </DataState>
      </section>
    );
  return (
    <section className="bing-section" aria-label="Bing Webmaster 流量">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BING WEBMASTER</p>
          <h2>
            <IconBrandBing size={20} /> 流量分析（Bing Webmaster）
          </h2>
        </div>
        <button
          type="button"
          className="refresh-button"
          aria-label="刷新 Bing 数据"
          onClick={resource.refresh}
        >
          刷新 Bing
        </button>
      </div>
      {report.totals ? (
        <>
          <BingMetricsGrid performance={report.totals} />
          <BingPortfolioTrend performance={report.totals} />
        </>
      ) : (
        <div className="notice" role="alert">
          <span>
            暂无可展示的 Bing 数据，请确认站点已在 Bing Webmaster 中验证。
          </span>
          <button type="button" onClick={resource.refresh}>
            重新读取
          </button>
        </div>
      )}
      <section className="site-table-scroll" aria-label="站点 Bing 流量">
        <table className="site-table">
          <thead>
            <tr>
              <th scope="col">站点</th>
              <th scope="col">点击</th>
              <th scope="col">点击变化</th>
              <th scope="col">曝光</th>
              <th scope="col">点击率</th>
              <th scope="col">平均排名</th>
            </tr>
          </thead>
          <tbody>
            {report.sites.map((site) => (
              <BingSiteRow key={site.siteUrl} site={site} />
            ))}
          </tbody>
        </table>
      </section>
      <BingMethodNote report={report} />
    </section>
  );
}

function BingPortfolioTrend({ performance }: { performance: BingPerformance }) {
  const [metric, setMetric] = useState<string>(bingTrendOptions[0].key);
  return (
    <BingTrendSection
      performance={performance}
      metric={metric}
      onMetric={setMetric}
      title="全部站点流量趋势（周桶）"
    />
  );
}

function BingSiteRow({ site }: { site: BingOverviewSite }) {
  return (
    <tr>
      <th scope="row">
        <span className="site-name-button" title={site.siteUrl}>
          <span className="project-favicon">
            {propertyName(site.siteUrl).slice(0, 1).toUpperCase()}
          </span>
          <span>{propertyName(site.siteUrl)}</span>
        </span>
      </th>
      {site.status === 'ready' ? (
        <>
          <td className="volume-cell">
            {formatNumber(site.performance.metrics.clicks)}
          </td>
          <td>
            {site.performance.previousMetrics ? (
              <VolumeChange
                current={site.performance.metrics.clicks}
                previous={site.performance.previousMetrics.clicks}
              />
            ) : (
              <span className="metric-sub">—</span>
            )}
          </td>
          <td className="volume-cell">
            {formatNumber(site.performance.metrics.impressions)}
          </td>
          <td>{formatPercent(site.performance.metrics.ctr)}</td>
          <td>{formatPosition(site.performance.metrics.position)}</td>
        </>
      ) : (
        <td colSpan={5} className="site-error">
          {site.status === 'missing' ? (
            <span className="health-badge health-error">未关联 Bing</span>
          ) : (
            site.error
          )}
        </td>
      )}
    </tr>
  );
}

function BingMethodNote({ report }: { report: BingOverviewReport }) {
  return (
    <details className="health-method">
      <summary>Bing 数据口径与关联规则</summary>
      <div>
        <p>
          Bing 按周桶返回最近约 6 周的数据（每周更新一次，非实时）；指标卡取最近
          4 个完整周桶为当前周期，更早的周桶作为上一周期对比。点击/曝光为 Top
          查询汇总值，长尾查询不返回，故总量为近似值。
        </p>
        <p>
          关联规则：Bing 站点域名与 GSC 站点域名一致时自动关联，无需手工配置。
        </p>
        {report.missingFromBing.length > 0 && (
          <p>
            未在 Bing 验证的站点：
            {report.missingFromBing.map((url) => propertyName(url)).join('、')}
            。
          </p>
        )}
        {report.unmatchedBingSites.length > 0 && (
          <p>
            未关联到 GSC 的 Bing 站点：
            {report.unmatchedBingSites.join('、')}。
          </p>
        )}
      </div>
    </details>
  );
}

/** Detail view: metrics, weekly trend, top queries and top pages in one pass. */
export function BingSiteSection({
  resource,
}: {
  resource: BingResource<BingSiteReport>;
}) {
  if (resource.loading)
    return (
      <section className="bing-section" aria-label="Bing 流量详情">
        <DataState kind="loading" title="正在读取 Bing 流量数据…" />
      </section>
    );
  if (resource.error)
    return (
      <section className="bing-section" aria-label="Bing 流量详情">
        <DataState
          kind="error"
          title="无法读取 Bing 流量数据"
          onRetry={resource.refresh}
        >
          {resource.error}
        </DataState>
      </section>
    );
  if (!resource.data) return null;
  const report = resource.data;
  return (
    <section className="bing-section" aria-label="Bing 流量详情">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BING WEBMASTER</p>
          <h2>
            <IconBrandBing size={20} /> 流量分析（Bing ·{' '}
            {propertyName(report.siteUrl)}）
          </h2>
        </div>
        <button
          type="button"
          className="refresh-button"
          aria-label="刷新 Bing 数据"
          onClick={resource.refresh}
        >
          刷新 Bing
        </button>
      </div>
      <BingSiteBody report={report} />
    </section>
  );
}

function BingSiteBody({ report }: { report: BingSiteReport }) {
  const [metric, setMetric] = useState<string>(bingTrendOptions[0].key);
  return (
    <>
      <BingMetricsGrid performance={report} />
      <BingTrendSection
        performance={report}
        metric={metric}
        onMetric={setMetric}
        title="流量趋势（周桶）"
      />
      <BingQueryTable
        title="热门查询"
        rows={report.queries.map((query) => ({
          key: query.query,
          primary: query.query,
          clicks: query.clicks,
          impressions: query.impressions,
          position: query.position,
        }))}
        primaryLabel="查询"
      />
      <BingQueryTable
        title="热门页面"
        rows={report.pages.map((page) => ({
          key: page.page,
          primary: page.page,
          clicks: page.clicks,
          impressions: page.impressions,
          position: page.position,
        }))}
        primaryLabel="页面路径"
      />
      <p className="bing-footnote">
        Bing 数据为最近约 6 周的周桶汇总，每周更新一次。
        <IconArrowUpRight size={13} />
      </p>
    </>
  );
}

function BingQueryTable({
  title,
  rows,
  primaryLabel,
}: {
  title: string;
  rows: Array<{
    key: string;
    primary: string;
    clicks: number;
    impressions: number;
    position: number;
  }>;
  primaryLabel: string;
}) {
  return (
    <section className="query-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BING</p>
          <h2>{title}</h2>
        </div>
        <span className="query-count">前 {rows.length} 项</span>
      </div>
      <div className="query-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{primaryLabel}</th>
              <th scope="col">点击</th>
              <th scope="col">曝光</th>
              <th scope="col">平均排名</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="page-path-cell">
                  {row.primary}
                </th>
                <td>{formatNumber(row.clicks)}</td>
                <td>{formatNumber(row.impressions)}</td>
                <td>{formatPosition(row.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="table-empty">该范围内没有数据。</div>}
      </div>
    </section>
  );
}
