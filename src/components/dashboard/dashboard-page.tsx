import { useCallback, useState } from 'react';
import type { BingOverviewReport, BingSiteReport } from '@/features/bing/types';
import type { Ga4OverviewReport, Ga4SiteReport } from '@/features/ga4/types';
import { ApiError, requestJson } from '@/features/gsc/api';
import {
  type DateRange,
  defaultDateRange,
  isValidDateRange,
} from '@/features/gsc/date-range';
import type {
  ChartMetric,
  OverviewReport,
  SearchProperty,
  SearchReport,
} from '@/features/gsc/types';
import type {
  UmamiOverviewReport,
  UmamiSiteReport,
} from '@/features/umami/types';
import { useDashboardResource } from '@/hooks/use-dashboard-resource';
import { AccessScreen } from './access-screen';
import { BingOverviewSection, BingSiteSection } from './bing';
import { CombinedOverview } from './combined';
import { DashboardHeader, DashboardSidebar } from './dashboard-chrome';
import { Ga4OverviewSection, Ga4SiteSection } from './ga4';
import { Overview } from './overview';
import {
  DataState,
  DateToolbar,
  EmptyProperties,
  PropertyReport,
} from './report-components';
import { SiteExportBar } from './site-export';
import { UmamiOverviewSection, UmamiSiteSection } from './umami';

/**
 * Orchestration only: both entry routes render this same private workspace.
 * The overview is the default landing view; detail navigation shares its date
 * range. Resource hooks abort obsolete requests and never relabel stale data.
 */
export function DashboardPage() {
  const [hasSession, setHasSession] = useState(true);
  const [selected, setSelected] = useState('overview');
  const [range, setRange] = useState<DateRange>(() => defaultDateRange());
  const [metric, setMetric] = useState<ChartMetric>('clicks');
  const [actionError, setActionError] = useState<string | null>(null);
  const onUnauthorized = useCallback(() => setHasSession(false), []);
  const properties = useDashboardResource<{ properties: SearchProperty[] }>(
    hasSession ? '/api/properties' : null,
    onUnauthorized
  );
  const ready =
    hasSession &&
    Boolean(properties.data?.properties.length) &&
    isValidDateRange(range);
  const params = new URLSearchParams(range);
  const overview = useDashboardResource<OverviewReport>(
    ready && selected === 'overview' ? `/api/overview?${params}` : null,
    onUnauthorized
  );
  const ga4Overview = useDashboardResource<Ga4OverviewReport>(
    ready && selected === 'overview'
      ? `/api/ga4/overview?${new URLSearchParams(range)}`
      : null,
    onUnauthorized
  );
  params.set('siteUrl', selected);
  const detail = useDashboardResource<SearchReport>(
    ready && selected !== 'overview' ? `/api/report?${params}` : null,
    onUnauthorized
  );
  const ga4Detail = useDashboardResource<Ga4SiteReport>(
    ready && selected !== 'overview' ? `/api/ga4/report?${params}` : null,
    onUnauthorized
  );
  const bingOverview = useDashboardResource<BingOverviewReport>(
    ready && selected === 'overview'
      ? `/api/bing/overview?${new URLSearchParams(range)}`
      : null,
    onUnauthorized
  );
  const bingDetail = useDashboardResource<BingSiteReport>(
    ready && selected !== 'overview' ? `/api/bing/report?${params}` : null,
    onUnauthorized
  );
  const umamiOverview = useDashboardResource<UmamiOverviewReport>(
    ready && selected === 'overview'
      ? `/api/umami/overview?${new URLSearchParams(range)}`
      : null,
    onUnauthorized
  );
  const umamiDetail = useDashboardResource<UmamiSiteReport>(
    ready && selected !== 'overview' ? `/api/umami/report?${params}` : null,
    onUnauthorized
  );
  const active = selected === 'overview' ? overview : detail;
  // A source that is still loading is neither connected nor missing. The export
  // must not write "未接入" while its request is still in flight.
  const exportSources = [
    [ga4Detail, 'ga4'],
    [bingDetail, 'bing'],
    [umamiDetail, 'umami'],
  ] as const;
  const exportPending = exportSources
    .filter(([resource]) => resource.loading)
    .map(([, source]) => source);
  const exportFailed = exportSources
    .filter(([resource]) => resource.error)
    .map(([, source]) => source);

  async function unlock(password: string) {
    await requestJson('/api/auth/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setActionError(null);
    setHasSession(true);
    properties.refresh();
  }

  async function lock() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok)
        throw new ApiError(response.status, '无法锁定看板，请重试。');
      setHasSession(false);
      setSelected('overview');
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '无法锁定看板。');
    }
  }

  if (!hasSession) return <AccessScreen message={null} onUnlock={unlock} />;
  if (properties.loading)
    return (
      <main className="dashboard-loading">
        <span className="loading-mark" />
        正在检查 Google Search Console 连接…
      </main>
    );
  if (properties.error)
    return (
      <main className="standalone-state">
        <DataState
          kind="error"
          title="无法读取站点列表"
          onRetry={properties.refresh}
        >
          {properties.error}
        </DataState>
      </main>
    );
  const sites = properties.data?.properties ?? [];
  return (
    <main className="dashboard-shell">
      <a className="skip-link" href="#dashboard-content">
        跳到看板内容
      </a>
      <DashboardSidebar
        properties={sites}
        selected={selected}
        onSelect={setSelected}
        onLock={() => void lock()}
      />
      <section className="dashboard-workspace" id="dashboard-content">
        <DashboardHeader
          selected={selected}
          property={sites.find((site) => site.siteUrl === selected)}
          count={sites.length}
          loading={active.loading}
          onRefresh={active.refresh}
        />
        {actionError && (
          <div className="notice" role="alert">
            {actionError}
          </div>
        )}
        {!sites.length ? (
          <EmptyProperties />
        ) : (
          <>
            <DateToolbar range={range} onChange={setRange} />
            {!isValidDateRange(range) ? (
              <DataState kind="error" title="请选择有效的日期范围" />
            ) : active.loading ? (
              <DataState
                kind="loading"
                title={
                  selected === 'overview'
                    ? `正在读取 ${sites.length} 个站点的表现…`
                    : '正在读取站点报告…'
                }
              >
                正在核对 Google 数据完成日并计算上一等长周期。
              </DataState>
            ) : active.error ? (
              <DataState
                kind="error"
                title="无法读取搜索表现"
                onRetry={active.refresh}
              >
                {active.error}
              </DataState>
            ) : selected === 'overview' && overview.data ? (
              <>
                {ga4Overview.data && bingOverview.data && (
                  <CombinedOverview
                    reports={{
                      gsc: overview.data,
                      ga4: ga4Overview.data,
                      bing: bingOverview.data,
                      umami: umamiOverview.data ?? undefined,
                    }}
                    range={range}
                    onSelect={setSelected}
                  />
                )}
                <Overview
                  report={overview.data}
                  metric={metric}
                  onMetric={setMetric}
                  onSelect={setSelected}
                  onRetry={overview.refresh}
                />
                <Ga4OverviewSection resource={ga4Overview} />
                <BingOverviewSection resource={bingOverview} />
                <UmamiOverviewSection resource={umamiOverview} />
              </>
            ) : detail.data ? (
              <>
                <SiteExportBar
                  siteUrl={selected}
                  gsc={detail.data}
                  ga4={ga4Detail.data ?? undefined}
                  bing={bingDetail.data ?? undefined}
                  umami={umamiDetail.data ?? undefined}
                  pendingSources={exportPending}
                  failedSources={exportFailed}
                />
                <PropertyReport
                  report={detail.data}
                  metric={metric}
                  onMetric={setMetric}
                />
                <Ga4SiteSection resource={ga4Detail} />
                <BingSiteSection resource={bingDetail} />
                <UmamiSiteSection resource={umamiDetail} />
              </>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
