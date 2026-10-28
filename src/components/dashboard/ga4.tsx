import {
  IconArrowUpRight,
  IconBolt,
  IconChartPie,
  IconClock,
  IconEye,
  IconFileAnalytics,
  IconLink,
  IconUsers,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  formatDuration,
  formatGa4Metric,
  ga4MetricLabels,
  ga4TrendOptions,
} from '@/features/ga4/format';
import type {
  Ga4OverviewReport,
  Ga4OverviewSite,
  Ga4Performance,
  Ga4SiteReport,
} from '@/features/ga4/types';
import { formatNumber, formatPercent } from '@/features/gsc/format';
import { propertyName } from '@/features/gsc/property';
import { TrendChart } from './line-chart';
import { DataState, VolumeChange } from './report-components';

export type Ga4Resource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const metricIcons = {
  sessions: IconLink,
  users: IconUsers,
  pageviews: IconEye,
  engagementRate: IconBolt,
  averageSessionDuration: IconClock,
  keyEvents: IconChartPie,
} as const;

/** GA4 cards reuse the GSC grid anatomy; every delta keeps its own unit. */
export function Ga4MetricsGrid({
  performance,
}: {
  performance: Ga4Performance;
}) {
  return (
    <section className="metric-grid" aria-label="GA4 核心指标">
      {(
        Object.keys(ga4MetricLabels) as Array<keyof typeof ga4MetricLabels>
      ).map((key) => {
        const Icon = metricIcons[key];
        return (
          <article key={key} className="metric-block">
            <div className="metric-label">
              <Icon size={17} />
              <span>{ga4MetricLabels[key]}</span>
            </div>
            <strong>
              {key === 'engagementRate'
                ? formatPercent(performance.metrics[key])
                : key === 'averageSessionDuration'
                  ? formatDuration(performance.metrics[key])
                  : formatNumber(performance.metrics[key])}
            </strong>
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

/** GA4 trend switches between sessions, users and pageviews. */
export function Ga4TrendSection({
  performance,
  metric,
  onMetric,
  title,
}: {
  performance: Ga4Performance;
  metric: string;
  onMetric: (metric: string) => void;
  title: string;
}) {
  return (
    <section className="chart-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">GA4 TREND</p>
          <h2>{title}</h2>
        </div>
        <fieldset className="metric-switch">
          <legend className="sr-only">GA4 趋势指标</legend>
          {ga4TrendOptions.map((option) => (
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
        trend={performance.trend}
        previousTrend={performance.previousTrend}
        metric={metric}
        metricOptions={[...ga4TrendOptions]}
        formatValue={formatGa4Metric}
        emptyLabel="此日期范围还没有可展示的 GA4 数据。"
      />
    </section>
  );
}

/**
 * Portfolio GA4 data loads beside (never inside) the Search Console overview,
 * so one API's failure cannot blank the other's already-rendered data.
 */
export function Ga4OverviewSection({
  resource,
}: {
  resource: Ga4Resource<Ga4OverviewReport>;
}) {
  if (resource.loading)
    return (
      <section className="ga4-section" aria-label="GA4 流量分析">
        <DataState kind="loading" title="正在读取 GA4 流量数据…" />
      </section>
    );
  if (resource.error)
    return (
      <section className="ga4-section" aria-label="GA4 流量分析">
        <DataState
          kind="error"
          title="无法读取 GA4 流量数据"
          onRetry={resource.refresh}
        >
          {resource.error}
        </DataState>
      </section>
    );
  if (!resource.data) return null;
  const report = resource.data;
  return (
    <section className="ga4-section" aria-label="GA4 流量分析">
      <div className="section-heading">
        <div>
          <p className="eyebrow">GA4 TRAFFIC</p>
          <h2>
            <IconFileAnalytics size={20} /> 流量分析（Google Analytics 4）
          </h2>
        </div>
        <button
          type="button"
          className="refresh-button"
          aria-label="刷新 GA4 数据"
          onClick={resource.refresh}
        >
          刷新 GA4
        </button>
      </div>
      {report.matchedProperties.length === 0 ? (
        <DataState kind="empty" title="没有站点关联到 GA4 媒体资源">
          <Ga4UnmatchedHelp unmatched={report.unmatchedProperties} />
        </DataState>
      ) : (
        <>
          {report.totals ? (
            <>
              <Ga4MetricsGrid performance={report.totals} />
              <Ga4PortfolioTrend performance={report.totals} />
            </>
          ) : (
            <div className="notice" role="alert">
              <span>部分 GA4 数据读取失败，本周期暂不提供汇总。</span>
              <button type="button" onClick={resource.refresh}>
                重新读取
              </button>
            </div>
          )}
          <section className="site-table-scroll" aria-label="站点 GA4 流量">
            <table className="site-table">
              <thead>
                <tr>
                  <th scope="col">站点</th>
                  <th scope="col">会话</th>
                  <th scope="col">会话变化</th>
                  <th scope="col">用户</th>
                  <th scope="col">浏览量</th>
                  <th scope="col">互动率</th>
                  <th scope="col">关键事件</th>
                </tr>
              </thead>
              <tbody>
                {report.sites.map((site) => (
                  <Ga4SiteRow key={site.siteUrl} site={site} />
                ))}
              </tbody>
            </table>
          </section>
          <Ga4MethodNote report={report} />
        </>
      )}
    </section>
  );
}

function Ga4PortfolioTrend({ performance }: { performance: Ga4Performance }) {
  const [metric, setMetric] = useState<string>(ga4TrendOptions[0].key);
  return (
    <Ga4TrendSection
      performance={performance}
      metric={metric}
      onMetric={setMetric}
      title="全部站点流量趋势"
    />
  );
}

function Ga4SiteRow({ site }: { site: Ga4OverviewSite }) {
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
            {formatNumber(site.performance.metrics.sessions)}
          </td>
          <td>
            <VolumeChange
              current={site.performance.metrics.sessions}
              previous={site.performance.previousMetrics.sessions}
            />
          </td>
          <td className="volume-cell">
            {formatNumber(site.performance.metrics.users)}
          </td>
          <td className="volume-cell">
            {formatNumber(site.performance.metrics.pageviews)}
          </td>
          <td>{formatPercent(site.performance.metrics.engagementRate)}</td>
          <td>{formatNumber(site.performance.metrics.keyEvents)}</td>
        </>
      ) : (
        <td colSpan={6} className="site-error">
          {site.status === 'unmatched' ? (
            <span className="health-badge health-error">未关联 GA4</span>
          ) : (
            site.error
          )}
        </td>
      )}
    </tr>
  );
}

function Ga4MethodNote({ report }: { report: Ga4OverviewReport }) {
  return (
    <details className="health-method">
      <summary>GA4 数据口径与关联规则</summary>
      <div>
        <p>
          GA4
          时间范围截至昨日（UTC），上一周期为等长窗口；指标按会话加权汇总。汇总仅在所有已关联站点读取成功时提供，未关联或读取失败的站点不会以零值参与汇总。
        </p>
        <p>
          关联规则：GA4
          属性名称与站点域名一致（忽略大小写、空格和点号）时自动关联；否则按属性实际收到数据的主机名匹配。一个
          GA4 属性只关联一个站点，避免重复计数。
        </p>
        {report.unmatchedProperties.length > 0 && (
          <p>
            未关联的 GA4 属性：
            {report.unmatchedProperties
              .map((link) => `${link.displayName} (${link.propertyId})`)
              .join('、')}
            。如需关联，请在 GA4 后台把属性名称改为对应站点域名。
          </p>
        )}
      </div>
    </details>
  );
}

function Ga4UnmatchedHelp({
  unmatched,
}: {
  unmatched: Ga4OverviewReport['unmatchedProperties'];
}): ReactNode {
  return (
    <>
      <p>
        自动关联需要 GA4
        属性名称与站点域名一致（忽略大小写、空格和点号），或该属性确实在接收对应域名的数据。
      </p>
      {unmatched.length > 0 && (
        <p>
          检测到 {unmatched.length} 个 GA4 属性：
          {unmatched
            .map((link) => `${link.displayName} (${link.propertyId})`)
            .join('、')}
          。请在 GA4 后台把属性名称改为对应站点域名，然后刷新。
        </p>
      )}
    </>
  );
}

/** Detail view: metrics, trend, acquisition channels and top pages in one pass. */
export function Ga4SiteSection({
  resource,
}: {
  resource: Ga4Resource<Ga4SiteReport>;
}) {
  if (resource.loading)
    return (
      <section className="ga4-section" aria-label="GA4 流量详情">
        <DataState kind="loading" title="正在读取 GA4 流量数据…" />
      </section>
    );
  if (resource.error)
    return (
      <section className="ga4-section" aria-label="GA4 流量详情">
        <DataState
          kind="error"
          title="无法读取 GA4 流量数据"
          onRetry={resource.refresh}
        >
          {resource.error}
        </DataState>
      </section>
    );
  if (!resource.data) return null;
  const report = resource.data;
  return (
    <section className="ga4-section" aria-label="GA4 流量详情">
      <div className="section-heading">
        <div>
          <p className="eyebrow">GA4 TRAFFIC</p>
          <h2>
            <IconFileAnalytics size={20} /> 流量分析（GA4 ·{' '}
            {report.link.displayName}）
          </h2>
        </div>
        <button
          type="button"
          className="refresh-button"
          aria-label="刷新 GA4 数据"
          onClick={resource.refresh}
        >
          刷新 GA4
        </button>
      </div>
      <Ga4SiteBody report={report} />
    </section>
  );
}

function Ga4SiteBody({ report }: { report: Ga4SiteReport }) {
  const [metric, setMetric] = useState<string>(ga4TrendOptions[0].key);
  return (
    <>
      <Ga4MetricsGrid performance={report} />
      <Ga4TrendSection
        performance={report}
        metric={metric}
        onMetric={setMetric}
        title="流量趋势"
      />
      <section className="query-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACQUISITION</p>
            <h2>流量来源（渠道）</h2>
          </div>
          <span className="query-count">按会话排序</span>
        </div>
        <div className="query-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">渠道</th>
                <th scope="col">会话</th>
                <th scope="col">上期会话</th>
                <th scope="col">变化</th>
                <th scope="col">占比</th>
              </tr>
            </thead>
            <tbody>
              {report.channels.map((channel) => (
                <tr key={channel.channel}>
                  <th scope="row">{channel.channel}</th>
                  <td>{formatNumber(channel.sessions)}</td>
                  <td>{formatNumber(channel.previousSessions)}</td>
                  <td>
                    <VolumeChange
                      current={channel.sessions}
                      previous={channel.previousSessions}
                    />
                  </td>
                  <td>
                    {formatShare(channel.sessions, report.metrics.sessions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.channels.length && (
            <div className="table-empty">该范围内没有渠道数据。</div>
          )}
        </div>
      </section>
      <section className="query-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TOP PAGES</p>
            <h2>热门页面</h2>
          </div>
          <span className="query-count">前 {report.pages.length} 项</span>
        </div>
        <div className="query-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">页面路径</th>
                <th scope="col">会话</th>
                <th scope="col">用户</th>
                <th scope="col">浏览量</th>
              </tr>
            </thead>
            <tbody>
              {report.pages.map((page) => (
                <tr key={page.pagePath}>
                  <th scope="row" className="page-path-cell">
                    {page.pagePath}
                  </th>
                  <td>{formatNumber(page.sessions)}</td>
                  <td>{formatNumber(page.users)}</td>
                  <td>{formatNumber(page.pageviews)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.pages.length && (
            <div className="table-empty">该范围内没有页面数据。</div>
          )}
        </div>
      </section>
      <p className="ga4-footnote">
        GA4 时间范围截至昨日（UTC），对比上一等长周期。
        <IconArrowUpRight size={13} />
      </p>
    </>
  );
}

/** Shares are computed from the same totals row, never from the sorted subset. */
function formatShare(sessions: number, total: number): string {
  return total ? formatPercent(sessions / total) : '—';
}
