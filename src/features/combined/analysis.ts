import type {
  BingOverviewReport,
  BingPerformance,
} from '@/features/bing/types';
import type { Ga4OverviewReport, Ga4Performance } from '@/features/ga4/types';
import { siteHealth } from '@/features/gsc/health';
import type { OverviewReport, SearchPerformance } from '@/features/gsc/types';
import type {
  UmamiOverviewReport,
  UmamiPerformance,
} from '@/features/umami/types';

/**
 * The dashboards share the same GSC `siteUrl` as their join key, so a combined
 * portfolio view is a pure client-side merge of data that is already fetched
 * for the overview. No extra Worker subrequests are needed, which keeps the
 * whole view inside Cloudflare's per-invocation budget.
 *
 * Umami is optional: a deployment without an API key still renders the other
 * three sources instead of losing the whole rollup.
 */
export type CombinedSite = {
  siteUrl: string;
  gsc?: SearchPerformance;
  ga4?: Ga4Performance;
  bing?: BingPerformance;
  umami?: UmamiPerformance;
};

export type InsightSeverity = 'high' | 'medium' | 'info' | 'positive';

export type CombinedInsight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  sites?: string[];
};

export type CombinedSummary = {
  gscClicks: number;
  gscClicksPrevious: number;
  gscClickChange: number | null;
  ga4Sessions: number;
  ga4SessionsPrevious: number;
  bingClicks: number;
  bingClicksPrevious: number;
  /**
   * Share of GA4 sessions attributable to Google organic search, computed only
   * over sites that have both GSC and GA4 so numerator and denominator cover
   * the same portfolio.
   */
  searchShare: number | null;
  /** Sites that contribute to `searchShare`. */
  searchShareSites: number;
  gscHealthy: number;
  gscDeclining: number;
  gscEmpty: number;
  siteCount: number;
  ga4Covered: number;
  bingCovered: number;
  /** `null` means Umami is not configured for this deployment. */
  umamiPageviews: number | null;
  umamiPageviewsPrevious: number | null;
  umamiCovered: number;
};

/** Joins the per-site arrays on the shared GSC `siteUrl`. */
export function joinSites(
  gsc: OverviewReport,
  ga4: Ga4OverviewReport,
  bing: BingOverviewReport,
  umami?: UmamiOverviewReport
): CombinedSite[] {
  const ga4BySite = new Map(ga4.sites.map((site) => [site.siteUrl, site]));
  const bingBySite = new Map(bing.sites.map((site) => [site.siteUrl, site]));
  const umamiBySite = new Map(
    (umami?.sites ?? []).map((site) => [site.siteUrl, site])
  );
  return gsc.sites.map((gscSite) => {
    const ga4Site = ga4BySite.get(gscSite.property.siteUrl);
    const bingSite = bingBySite.get(gscSite.property.siteUrl);
    const umamiSite = umamiBySite.get(gscSite.property.siteUrl);
    return {
      siteUrl: gscSite.property.siteUrl,
      gsc: gscSite.status === 'ready' ? gscSite.performance : undefined,
      ga4: ga4Site?.status === 'ready' ? ga4Site.performance : undefined,
      bing: bingSite?.status === 'ready' ? bingSite.performance : undefined,
      umami: umamiSite?.status === 'ready' ? umamiSite.performance : undefined,
    };
  });
}

/** Headline cross-source numbers used by the analysis banner. */
export function buildSummary(
  gsc: OverviewReport,
  ga4: Ga4OverviewReport,
  bing: BingOverviewReport,
  sites: CombinedSite[],
  umami?: UmamiOverviewReport
): CombinedSummary {
  const gscTotals = gsc.totals;
  const ga4Totals = ga4.totals;
  const bingTotals = bing.totals;
  const umamiTotals = umami?.totals;
  const gscClicks = gscTotals?.metrics.clicks ?? 0;
  const ga4Sessions = ga4Totals?.metrics.sessions ?? 0;
  const bingClicks = bingTotals?.metrics.clicks ?? 0;
  const ready = sites.filter((site) => site.gsc);
  let gscHealthy = 0;
  let gscDeclining = 0;
  let gscEmpty = 0;
  for (const site of ready) {
    const gsc = site.gsc;
    if (!gsc) continue;
    const health = siteHealth(gsc.metrics, gsc.previousMetrics);
    if (health === 'growing') gscHealthy += 1;
    else if (health === 'declining') gscDeclining += 1;
    else if (health === 'empty') gscEmpty += 1;
  }
  // The search share must compare like with like: only sites that have both a
  // GSC property and a GA4 property contribute to either side of the ratio.
  let sharedClicks = 0;
  let sharedSessions = 0;
  let sharedSites = 0;
  for (const site of sites) {
    if (!site.gsc || !site.ga4) continue;
    sharedClicks += site.gsc.metrics.clicks;
    sharedSessions += site.ga4.metrics.sessions;
    sharedSites += 1;
  }
  return {
    gscClicks,
    gscClicksPrevious: gscTotals?.previousMetrics.clicks ?? 0,
    gscClickChange:
      gscClicks === 0 && (gscTotals?.previousMetrics.clicks ?? 0) === 0
        ? 0
        : (gscTotals?.previousMetrics.clicks ?? 0) === 0
          ? null
          : (gscClicks - (gscTotals?.previousMetrics.clicks ?? 0)) /
            (gscTotals?.previousMetrics.clicks ?? 0),
    ga4Sessions,
    ga4SessionsPrevious: ga4Totals?.previousMetrics.sessions ?? 0,
    bingClicks,
    bingClicksPrevious: bingTotals?.previousMetrics?.clicks ?? 0,
    searchShare: sharedSessions > 0 ? sharedClicks / sharedSessions : null,
    searchShareSites: sharedSites,
    gscHealthy,
    gscDeclining,
    gscEmpty,
    siteCount: sites.length,
    ga4Covered: sites.filter((site) => site.ga4).length,
    bingCovered: sites.filter((site) => site.bing).length,
    umamiPageviews: umamiTotals ? umamiTotals.metrics.pageviews : null,
    umamiPageviewsPrevious: umamiTotals
      ? umamiTotals.previousMetrics.pageviews
      : null,
    umamiCovered: sites.filter((site) => site.umami).length,
  };
}

/** Curated, deterministic improvement rules over the merged portfolio. */
export function buildInsights(
  gsc: OverviewReport,
  ga4: Ga4OverviewReport,
  bing: BingOverviewReport,
  sites: CombinedSite[],
  umami?: UmamiOverviewReport
): CombinedInsight[] {
  const insights: CombinedInsight[] = [];

  // 1. GA4 coverage gap
  const ga4Unmatched = gsc.sites
    .filter(
      (site) =>
        !ga4.sites.some(
          (g) => g.siteUrl === site.property.siteUrl && g.status === 'ready'
        )
    )
    .map((site) => site.property.siteUrl);
  if (ga4Unmatched.length > 0) {
    insights.push({
      id: 'ga4-gap',
      severity: 'high',
      title: `${ga4Unmatched.length} 个站点未关联 GA4`,
      detail:
        '这些站点无法追踪站内行为与转化。请在 Google Analytics 后台确认对应媒体资源，且资源命名与域名一致（如 example.com），否则无法自动关联。',
      sites: ga4Unmatched,
    });
  }

  // 2. Bing verification gap
  if (bing.missingFromBing.length > 0) {
    insights.push({
      id: 'bing-gap',
      severity: 'medium',
      title: `${bing.missingFromBing.length} 个站点未在 Bing Webmaster 验证`,
      detail:
        'Bing / Copilot 的 AI 搜索引用越来越多，验证这些域名可在不增加内容成本的情况下捡回一部分搜索流量。',
      sites: bing.missingFromBing,
    });
  }

  // 3. High impressions but low CTR (search snippets underperform)
  const lowCtr = sites
    .filter(
      (site) =>
        site.gsc &&
        site.gsc.metrics.impressions >= 500 &&
        site.gsc.metrics.ctr < 0.03
    )
    .map((site) => site.siteUrl);
  if (lowCtr.length > 0) {
    insights.push({
      id: 'low-ctr',
      severity: 'high',
      title: `${lowCtr.length} 个站点搜索曝光高但点击率低于 3%`,
      detail:
        '曝光充足但点击偏低，通常说明 SERP 标题、描述或结构化数据不够吸引。补充 FAQ、评分、价格等富媒体标记，往往能直接提升点击而不增加曝光。',
      sites: lowCtr,
    });
  }

  // 4. Declining search clicks
  const declining = sites
    .filter(
      (site) =>
        site.gsc &&
        site.gsc.previousMetrics.clicks > 0 &&
        site.gsc.deltas.clicks < 0 &&
        (site.gsc.metrics.clicks - site.gsc.previousMetrics.clicks) /
          site.gsc.previousMetrics.clicks <=
          -0.1
    )
    .map((site) => site.siteUrl);
  if (declining.length > 0) {
    insights.push({
      id: 'declining',
      severity: 'high',
      title: `${declining.length} 个站点自然搜索点击较上期下滑超 10%`,
      detail:
        '排查排名波动、内容时效或算法影响。下滑站点优先投入外链与内容更新以稳住收录。',
      sites: declining,
    });
  }

  // 5. Low GA4 engagement
  const lowEngagement = sites
    .filter((site) => site.ga4 && site.ga4.metrics.engagementRate < 0.4)
    .map((site) => site.siteUrl);
  if (lowEngagement.length > 0) {
    insights.push({
      id: 'low-engagement',
      severity: 'medium',
      title: `${lowEngagement.length} 个站点访问互动率低于 40%`,
      detail:
        '互动率低（低互动会话占比高）通常反映落地页加载慢、内容相关性弱或 CTA 缺失。检查 Core Web Vitals 与首屏内容匹配度。',
      sites: lowEngagement,
    });
  }

  // 6. Strong Bing long-tail as a Google content signal
  const bingLongTail = sites
    .filter((site) => site.bing && site.bing.metrics.clicks >= 50 && site.gsc)
    .map((site) => site.siteUrl);
  if (bingLongTail.length > 0) {
    insights.push({
      id: 'bing-longtail',
      severity: 'info',
      title: `${bingLongTail.length} 个站点在 Bing 有可观自然点击`,
      detail:
        '这些站长尾词在 Bing 排名较好，可作为 Google 内容策略的参考信号——在 Bing 表现强的主题，补强 Google 端内容通常回报更高。',
      sites: bingLongTail,
    });
  }

  // 7. Winners growing on both search and visit
  const winners = sites
    .filter(
      (site) =>
        site.gsc &&
        site.ga4 &&
        site.gsc.deltas.clicks > 0 &&
        site.ga4.deltas.sessions > 0
    )
    .map((site) => site.siteUrl);
  if (winners.length > 0) {
    insights.push({
      id: 'winners',
      severity: 'positive',
      title: `${winners.length} 个站点搜索点击与网站会话同步增长`,
      detail:
        '搜索流量与落地页留存同时向上，说明内容与承接都健康。建议优先加大这些站点的内容产出与外链投入。',
      sites: winners,
    });
  }

  // Umami coverage gap. Only reported when the deployment configured Umami:
  // a missing credential must not masquerade as an association problem.
  if (umami) {
    const umamiUnmatched = gsc.sites
      .filter(
        (site) =>
          !umami.sites.some(
            (u) => u.siteUrl === site.property.siteUrl && u.status === 'ready'
          )
      )
      .map((site) => site.property.siteUrl);
    if (umamiUnmatched.length > 0) {
      insights.push({
        id: 'umami-gap',
        severity: 'medium',
        title: `${umamiUnmatched.length} 个站点未关联 Umami`,
        detail:
          '这些站点缺少独立的站内流量口径。请在 Umami 后台把网站域名设为该站域名（如 example.com），否则无法自动关联。',
        sites: umamiUnmatched,
      });
    }
  }

  return insights;
}

/** Ranks sites by GSC clicks so the table leads with the portfolio's engines. */
export function rankSites(sites: CombinedSite[]): CombinedSite[] {
  return [...sites].sort(
    (left, right) =>
      (right.gsc?.metrics.clicks ?? 0) - (left.gsc?.metrics.clicks ?? 0)
  );
}
