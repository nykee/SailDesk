import {
  IconBrandBing,
  IconChartLine,
  IconSearch,
  IconTrendingUp,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import type { BingOverviewReport } from '@/features/bing/types';
import {
  buildInsights,
  buildSummary,
  type CombinedInsight,
  type CombinedSite,
  type InsightSeverity,
  joinSites,
  rankSites,
} from '@/features/combined/analysis';
import type { Ga4OverviewReport } from '@/features/ga4/types';
import type { DateRange } from '@/features/gsc/date-range';
import {
  formatCompact,
  formatPercent,
  formatPosition,
} from '@/features/gsc/format';
import { propertyName } from '@/features/gsc/property';
import type { OverviewReport } from '@/features/gsc/types';
import { VolumeChange } from './report-components';

type Reports = {
  gsc: OverviewReport;
  ga4: Ga4OverviewReport;
  bing: BingOverviewReport;
};

type AnyReport = OverviewReport | Ga4OverviewReport | BingOverviewReport;

/** Per-source card layout. Every metric exists on the matching performance type. */
const sourceFields: Record<
  'gsc' | 'ga4' | 'bing',
  Array<{ label: string; field: string; summable: boolean }>
> = {
  gsc: [
    { label: '点击', field: 'clicks', summable: true },
    { label: '曝光', field: 'impressions', summable: true },
    { label: '点击率', field: 'ctr', summable: false },
    { label: '平均排名', field: 'position', summable: false },
  ],
  ga4: [
    { label: '会话', field: 'sessions', summable: true },
    { label: '用户', field: 'users', summable: true },
    { label: '浏览量', field: 'pageviews', summable: true },
    { label: '互动率', field: 'engagementRate', summable: false },
    { label: '关键事件', field: 'keyEvents', summable: true },
  ],
  bing: [
    { label: '点击', field: 'clicks', summable: true },
    { label: '曝光', field: 'impressions', summable: true },
    { label: '点击率', field: 'ctr', summable: false },
    { label: '平均排名', field: 'position', summable: false },
  ],
};

const sourceMeta = [
  { key: 'gsc', label: 'Google 搜索', icon: IconSearch },
  { key: 'ga4', label: 'Google Analytics', icon: IconChartLine },
  { key: 'bing', label: 'Bing Webmaster', icon: IconBrandBing },
] as const;

/**
 * The portfolio-wide rollup sits at the very top of the overview and merges the
 * three already-fetched data sources on the shared GSC site key. It never makes
 * its own requests, so it stays inside the Worker subrequest budget.
 */
export function CombinedOverview({
  reports,
  range,
  onSelect,
}: {
  reports: Reports;
  range: DateRange;
  onSelect: (siteUrl: string) => void;
}) {
  const sites = useMemo(
    () => joinSites(reports.gsc, reports.ga4, reports.bing),
    [reports.gsc, reports.ga4, reports.bing]
  );
  const summary = useMemo(
    () => buildSummary(reports.gsc, reports.ga4, reports.bing, sites),
    [reports.gsc, reports.ga4, reports.bing, sites]
  );
  const insights = useMemo(
    () => buildInsights(reports.gsc, reports.ga4, reports.bing, sites),
    [reports.gsc, reports.ga4, reports.bing, sites]
  );
  const ranked = useMemo(() => rankSites(sites), [sites]);

  return (
    <section className="combined-overview" aria-label="全站总览">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PORTFOLIO OVERVIEW</p>
          <h2>
            <IconTrendingUp size={20} /> 全站总览（三维度）
          </h2>
        </div>
        <span className="query-count">
          {rangeLabel(range)} · {summary.siteCount} 个站点
        </span>
      </div>

      <SummaryStrip summary={summary} />

      <div className="combined-metrics">
        {sourceMeta.map((source) => (
          <SourceGroup
            key={source.key}
            sourceKey={source.key}
            label={source.label}
            icon={source.icon}
            report={reports[source.key]}
          />
        ))}
      </div>

      <p className="combined-footnote">
        Bing 数据为最近约 6 周的周桶（按周更新），长周期下仅覆盖部分区间；GSC 与
        GA4
        随上方日期维度实时切换。变化均对比上一等长周期。「搜索点击占比」只统计
        同时接入 GSC 与 GA4 的 {summary.searchShareSites}{' '}
        个站点，保证分子分母口径一致。
      </p>

      <CombinedSiteTable sites={ranked} onSelect={onSelect} />

      {insights.length > 0 && (
        <section className="insight-list" aria-label="改进意见">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ACTION ITEMS</p>
              <h3>统计分析 &amp; 改进意见</h3>
            </div>
          </div>
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </section>
      )}
    </section>
  );
}

/** A compact banner of the cross-source headline numbers. */
function SummaryStrip({
  summary,
}: {
  summary: ReturnType<typeof buildSummary>;
}) {
  const items = [
    {
      label: 'GSC 总点击',
      current: summary.gscClicks,
      previous: summary.gscClicksPrevious,
    },
    {
      label: 'GA4 总会话',
      current: summary.ga4Sessions,
      previous: summary.ga4SessionsPrevious,
    },
    {
      label: 'Bing 总点击',
      current: summary.bingClicks,
      previous: summary.bingClicksPrevious,
    },
    {
      label: '搜索点击占比',
      value:
        summary.searchShare === null ? '—' : formatPercent(summary.searchShare),
      current: null,
      previous: null,
    },
    {
      label: '增长 / 下降站点',
      value: `${summary.gscHealthy} / ${summary.gscDeclining}`,
      current: null,
      previous: null,
    },
    {
      label: 'GA4 / Bing 覆盖',
      value: `${summary.ga4Covered} / ${summary.bingCovered}`,
      current: null,
      previous: null,
    },
  ];
  return (
    <section className="summary-strip" aria-label="全站核心指标">
      {items.map((item) => (
        <div key={item.label} className="summary-strip-item">
          <span className="summary-strip-label">{item.label}</span>
          <strong>{item.value ?? formatCompact(item.current ?? 0)}</strong>
          {item.current !== null && (
            <VolumeChange
              current={item.current}
              previous={item.previous ?? 0}
            />
          )}
        </div>
      ))}
    </section>
  );
}

/** Reads the optional configured/available flags that only Bing reports carry. */
function sourceStatus(report: AnyReport): {
  configured: boolean;
  available: boolean;
} {
  if ('configured' in report) {
    return {
      configured: report.configured,
      available: report.available ?? true,
    };
  }
  return { configured: true, available: true };
}

/** One source's aggregate cards, reusing the dashboard metric-block anatomy. */
function SourceGroup({
  sourceKey,
  label,
  icon: Icon,
  report,
}: {
  sourceKey: 'gsc' | 'ga4' | 'bing';
  label: string;
  icon: typeof IconSearch;
  report: AnyReport;
}) {
  const { configured, available } = sourceStatus(report);
  const metrics = report.totals?.metrics;
  const previous = report.totals?.previousMetrics;
  const fields = sourceFields[sourceKey];
  return (
    <div className="metric-source-group">
      <div className="metric-source-head">
        <Icon size={16} />
        <span>{label}</span>
        {!configured && <span className="source-unconfigured">未配置</span>}
        {configured && !available && (
          <span className="source-unconfigured">未同步</span>
        )}
      </div>
      {metrics ? (
        <div className="metric-grid">
          {fields.map((field) => (
            <SourceMetric
              key={field.field}
              label={field.label}
              value={formatField(metrics, field.field)}
              current={metricValue(metrics, field.field)}
              previous={metricValue(previous, field.field)}
              previousText={formatField(previous, field.field)}
              summable={field.summable}
            />
          ))}
        </div>
      ) : (
        <p className="source-empty">该维度暂无汇总数据。</p>
      )}
    </div>
  );
}

function formatField(
  metrics: object | null | undefined,
  field: string
): string {
  const value = metricValue(metrics, field);
  if (field === 'ctr' || field === 'engagementRate')
    return formatPercent(value);
  if (field === 'position') return formatPosition(value);
  return formatCompact(value);
}

function SourceMetric({
  label,
  value,
  current,
  previous,
  previousText,
  summable,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  previousText: string;
  summable?: boolean;
}) {
  return (
    <article className="metric-block">
      <div className="metric-label">
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {summable ? (
        <VolumeChange current={current} previous={previous} />
      ) : (
        <span className="metric-sub">
          上期 {current === previous ? '持平' : previousText}
        </span>
      )}
    </article>
  );
}

/** One row per site across all three sources, leading with GSC click volume. */
function CombinedSiteTable({
  sites,
  onSelect,
}: {
  sites: CombinedSite[];
  onSelect: (siteUrl: string) => void;
}) {
  return (
    <section className="site-table-scroll" aria-label="站点三维度对比">
      <table className="site-table combined-table">
        <thead>
          <tr>
            <th scope="col">站点</th>
            <th scope="col">GSC 点击</th>
            <th scope="col">GSC CTR</th>
            <th scope="col">排名</th>
            <th scope="col">GA4 会话</th>
            <th scope="col">Bing 点击</th>
            <th scope="col">覆盖</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((site) => (
            <CombinedRow key={site.siteUrl} site={site} onSelect={onSelect} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CombinedRow({
  site,
  onSelect,
}: {
  site: CombinedSite;
  onSelect: (siteUrl: string) => void;
}) {
  const gsc = site.gsc;
  const ga4 = site.ga4;
  const bing = site.bing;
  const coverage: string[] = [];
  if (gsc) coverage.push('G');
  if (ga4) coverage.push('A');
  if (bing) coverage.push('B');
  return (
    <tr>
      <th scope="row">
        <button
          className="site-name-button"
          type="button"
          onClick={() => onSelect(site.siteUrl)}
          title={site.siteUrl}
        >
          <span className="project-favicon">
            {propertyName(site.siteUrl).slice(0, 1).toUpperCase()}
          </span>
          <span>{propertyName(site.siteUrl)}</span>
        </button>
      </th>
      <td className="volume-cell">
        {gsc ? formatCompact(gsc.metrics.clicks) : '—'}
        {gsc && (
          <div className="delta-cell">
            <VolumeChange
              current={gsc.metrics.clicks}
              previous={gsc.previousMetrics.clicks}
            />
          </div>
        )}
      </td>
      <td>{gsc ? formatPercent(gsc.metrics.ctr) : '—'}</td>
      <td>{gsc ? formatPosition(gsc.metrics.position) : '—'}</td>
      <td className="volume-cell">
        {ga4 ? (
          formatCompact(ga4.metrics.sessions)
        ) : (
          <span className="coverage-missing">未接入</span>
        )}
        {ga4 && (
          <div className="delta-cell">
            <VolumeChange
              current={ga4.metrics.sessions}
              previous={ga4.previousMetrics.sessions}
            />
          </div>
        )}
      </td>
      <td className="volume-cell">
        {bing ? (
          <>
            {formatCompact(bing.metrics.clicks)}
            {bing.previousMetrics && (
              <div className="delta-cell">
                <VolumeChange
                  current={bing.metrics.clicks}
                  previous={bing.previousMetrics.clicks}
                />
              </div>
            )}
          </>
        ) : (
          <span className="coverage-missing">未验证</span>
        )}
      </td>
      <td>
        <span className="coverage-tags">
          {coverage.map((tag) => (
            <span key={tag} className={`coverage-tag coverage-${tag}`}>
              {tag}
            </span>
          ))}
        </span>
      </td>
    </tr>
  );
}

const severityMeta: Record<InsightSeverity, { label: string }> = {
  high: { label: '优先' },
  medium: { label: '建议' },
  info: { label: '观察' },
  positive: { label: '亮点' },
};

function InsightCard({ insight }: { insight: CombinedInsight }) {
  return (
    <article className={`insight-card insight-${insight.severity}`}>
      <div className="insight-head">
        <span className={`insight-badge insight-${insight.severity}`}>
          {severityMeta[insight.severity].label}
        </span>
        <h4>{insight.title}</h4>
      </div>
      <p>{insight.detail}</p>
      {insight.sites && insight.sites.length > 0 && (
        <div className="insight-sites">
          {insight.sites.slice(0, 8).map((site) => (
            <span key={site} className="insight-site-chip">
              {propertyName(site)}
            </span>
          ))}
          {insight.sites.length > 8 && (
            <span className="insight-site-chip">
              +{insight.sites.length - 8}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/** Reads a possibly-partial metrics object without assuming every field exists. */
function metricValue(
  metrics: object | null | undefined,
  field: string
): number {
  if (!metrics) return 0;
  const value = (metrics as Record<string, number>)[field];
  return typeof value === 'number' ? value : 0;
}

/** Derives a human label from the range length for the section heading. */
function rangeLabel(range: DateRange): string {
  const start = new Date(`${range.startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${range.endDate}T00:00:00.000Z`).getTime();
  const days = Math.round((end - start) / 86_400_000) + 1;
  return `近 ${days} 天`;
}
