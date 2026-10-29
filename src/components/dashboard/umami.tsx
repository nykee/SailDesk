import {
  IconArrowBackUp,
  IconClock,
  IconEye,
  IconLink,
  IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';
import { formatDuration } from '@/features/ga4/format';
import { formatNumber, formatPercent } from '@/features/gsc/format';
import { propertyName } from '@/features/gsc/property';
import type {
  UmamiMetrics,
  UmamiOverviewReport,
  UmamiOverviewSite,
  UmamiPerformance,
  UmamiSiteReport,
} from '@/features/umami/types';
import { TrendChart } from './line-chart';
import { DataState, VolumeChange } from './report-components';

export type UmamiResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const umamiMetricLabels = {
  pageviews: '浏览量',
  visitors: '访客',
  visits: '访问次数',
  bounces: '跳出率',
  totalTime: '总停留',
} as const;

type UmamiMetricKey = keyof typeof umamiMetricLabels;

const metricOrder: UmamiMetricKey[] = [
  'pageviews',
  'visitors',
  'visits',
  'bounces',
  'totalTime',
];

const metricIcons = {
  pageviews: IconEye,
  visitors: IconUsers,
  visits: IconLink,
  bounces: IconArrowBackUp,
  totalTime: IconClock,
} as const;

/** Umami reports bounce counts; the dashboard shows the rate they imply. */
function bounceRate(metrics: UmamiMetrics): number {
  return metrics.visits > 0 ? metrics.bounces / metrics.visits : 0;
}

function formatUmamiMetric(key: UmamiMetricKey, metrics: UmamiMetrics): string {
  if (key === 'bounces') return formatPercent(bounceRate(metrics));
  if (key === 'totalTime') return formatDuration(metrics.totalTime);
  return formatNumber(metrics[key]);
}

/**
 * Umami cards reuse the GSC grid anatomy. Five metrics are reported, so the
 * section stylesheet gives this block its own five-column track.
 */
export function UmamiMetricsGrid({
  performance,
}: {
  performance: UmamiPerformance;
}) {
  return (
    <section className="metric-grid" aria-label="Umami 核心指标">
      {metricOrder.map((key) => {
        const Icon = metricIcons[key];
        return (
          <article key={key} className="metric-block">
            <div className="metric-label">
              <Icon size={17} />
              <span>{umamiMetricLabels[key]}</span>
            </div>
            <strong>{formatUmamiMetric(key, performance.metrics)}</strong>
            <VolumeChange
              current={performance.metrics[key]}
              previous={performance.previousMetrics[key]}
            />
          </article>
        );
      })}
    </section>
  );
}

export function UmamiOverviewSection({
  resource,
}: {
  resource: UmamiResource<UmamiOverviewReport>;
}) {
  if (resource.loading)
    return (
      <section className="umami-section" aria-label="Umami 流量">
        <DataState kind="loading" title="正在读取 Umami 流量数据…" />
      </section>
    );
  if (resource.error)
    return (
      <section className="umami-section" aria-label="Umami 流量">
        <DataState
          kind="error"
          title="无法读取 Umami 流量数据"
          onRetry={resource.refresh}
        >
          {resource.error}
        </DataState>
      </section>
    );
  if (!resource.data) return null;
  const report = resource.data;
  const matched = report.sites.filter((site) => site.status !== 'unmatched');
  return (
    <section className="umami-section" aria-label="Umami 流量">
      <div className="section-heading">
        <div>
          <p className="eyebrow">UMAMI TRAFFIC</p>
          <h2>
            <IconEye size={20} /> 流量分析（Umami）
          </h2>
        </div>
        <button
          type="button"
          className="refresh-button"
          aria-label="刷新 Umami 数据"
          onClick={resource.refresh}
        >
          刷新 Umami
        </button>
      </div>
      {matched.length === 0 ? (
        <DataState kind="empty" title="没有站点关联到 Umami 网站">
          在 Umami 后台把网站域名设为该站域名（如
          visualiquid.com）即可自动关联。
        </DataState>
      ) : (
        <>
          {report.totals ? (
            <UmamiMetricsGrid performance={report.totals} />
          ) : (
            <div className="notice" role="alert">
              <span>部分 Umami 数据读取失败，本周期暂不提供汇总。</span>
              <button type="button" onClick={resource.refresh}>
                重新读取
              </button>
            </div>
          )}
          <section className="site-table-scroll" aria-label="站点 Umami 流量">
            <table className="site-table">
              <thead>
                <tr>
                  <th scope="col">站点</th>
                  <th scope="col">浏览量</th>
                  <th scope="col">浏览量变化</th>
                  <th scope="col">访客</th>
                  <th scope="col">访问次数</th>
                  <th scope="col">跳出率</th>
                </tr>
              </thead>
              <tbody>
                {report.sites.map((site) => (
                  <UmamiSiteRow key={site.siteUrl} site={site} />
                ))}
              </tbody>
            </table>
          </section>
          <p className="ga4-footnote">
            共 {report.websites.length} 个 Umami 网站，{matched.length} 个与
            Search Console 站点匹配。未匹配的站点不计入汇总。
          </p>
        </>
      )}
    </section>
  );
}

function UmamiSiteRow({ site }: { site: UmamiOverviewSite }) {
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
            {formatNumber(site.performance.metrics.pageviews)}
          </td>
          <td>
            <VolumeChange
              current={site.performance.metrics.pageviews}
              previous={site.performance.previousMetrics.pageviews}
            />
          </td>
          <td>{formatNumber(site.performance.metrics.visitors)}</td>
          <td>{formatNumber(site.performance.metrics.visits)}</td>
          <td>{formatPercent(bounceRate(site.performance.metrics))}</td>
        </>
      ) : (
        <td colSpan={5} className="site-row-state">
          {site.status === 'unmatched'
            ? '未匹配到 Umami 网站'
            : `读取失败：${site.error}`}
        </td>
      )}
    </tr>
  );
}

const umamiTrendOptions = [
  { key: 'pageviews', label: '浏览量' },
  { key: 'visits', label: '访问次数' },
];

export function UmamiSiteSection({
  resource,
}: {
  resource: UmamiResource<UmamiSiteReport>;
}) {
  const [metric, setMetric] = useState<string>(umamiTrendOptions[0].key);
  if (resource.loading)
    return (
      <section className="umami-section" aria-label="站点 Umami 流量">
        <DataState kind="loading" title="正在读取站点 Umami 数据…" />
      </section>
    );
  if (resource.error)
    return (
      <section className="umami-section" aria-label="站点 Umami 流量">
        <DataState
          kind="error"
          title="无法读取站点 Umami 数据"
          onRetry={resource.refresh}
        >
          {resource.error}
        </DataState>
      </section>
    );
  if (!resource.data) return null;
  const report = resource.data;
  return (
    <section className="umami-section" aria-label="站点 Umami 流量">
      <div className="section-heading">
        <div>
          <p className="eyebrow">UMAMI TRAFFIC</p>
          <h2>
            <IconEye size={20} /> 本站流量（Umami）
          </h2>
        </div>
        <button
          type="button"
          className="refresh-button"
          aria-label="刷新站点 Umami 数据"
          onClick={resource.refresh}
        >
          刷新 Umami
        </button>
      </div>
      <UmamiMetricsGrid performance={report} />
      <section className="chart-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">UMAMI TREND</p>
            <h2>本站流量趋势</h2>
          </div>
          <fieldset className="metric-switch">
            <legend className="sr-only">Umami 趋势指标</legend>
            {umamiTrendOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={metric === option.key ? 'is-active' : ''}
                aria-pressed={metric === option.key}
                onClick={() => setMetric(option.key)}
              >
                {option.label}
              </button>
            ))}
          </fieldset>
        </div>
        <TrendChart
          trend={report.trend}
          previousTrend={report.previousTrend}
          metric={metric}
          metricOptions={umamiTrendOptions}
          formatValue={(_metric, value) => formatNumber(value)}
          emptyLabel="本周期没有 Umami 流量"
        />
      </section>
      <div className="umami-columns">
        <UmamiRankList
          title="热门页面"
          empty="本周期没有页面浏览"
          rows={report.pages.map((row) => ({
            label: row.path,
            value: formatNumber(row.pageviews),
          }))}
        />
        <UmamiRankList
          title="来源"
          empty="本周期没有来源数据"
          rows={report.referrers.map((row) => ({
            label: row.referrer,
            value: formatNumber(row.visitors),
          }))}
        />
        <UmamiRankList
          title="事件"
          empty="本周期没有自定义事件"
          rows={report.events.map((row) => ({
            label: row.name,
            value: formatNumber(row.count),
          }))}
        />
      </div>
    </section>
  );
}

function UmamiRankList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="umami-rank" aria-label={title}>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="umami-rank-empty">{empty}</p>
      ) : (
        <ol>
          {rows.slice(0, 10).map((row) => (
            <li key={row.label}>
              <span title={row.label}>{row.label}</span>
              <strong>{row.value}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
