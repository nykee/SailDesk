import { env } from 'cloudflare:workers';
import {
  aggregateBingPortfolioWeeks,
  aggregateBingWeeks,
  type BingStatsRow,
  bingTopPages,
  bingTopQueries,
  buildBingPerformance,
  mergeBingMetricsList,
} from '@/features/bing/metrics';
import type {
  BingOverviewReport,
  BingOverviewSite,
  BingPerformance,
  BingSiteReport,
} from '@/features/bing/types';
import { overviewProperties } from '@/features/gsc/property';
import { GscError, listProperties } from './gsc.server';

const BING_API_URL = 'https://ssl.bing.com/webmaster/api.svc/json';

/**
 * Bing throttles by egress IP (ErrorCode 17 / "ThrottleIP"), and Cloudflare
 * Workers share a small pool of egress IPs that Bing has rate-limited. So the
 * worker never calls Bing directly in production. Instead it reads from a KV
 * cache that an out-of-band job (running from a clean IP) seeds every week.
 * A 7-day TTL on the cache lines up with Bing's own weekly data cadence.
 */
const BING_CACHE_TTL = 60 * 60 * 24 * 7;

type BingUserSite = { Url: string; IsVerified: boolean };

function bingCache(): KVNamespace | undefined {
  return (env as { BING_CACHE?: KVNamespace }).BING_CACHE;
}

function cacheKey(endpoint: string, siteUrl?: string): string {
  if (endpoint === 'GetUserSites') return 'bing:sites';
  const enc = encodeURIComponent(siteUrl ?? '');
  return endpoint === 'GetQueryStats' ? `bing:qs:${enc}` : `bing:ps:${enc}`;
}

/**
 * Reads a Bing payload from KV. Returns null when the cache is cold so callers
 * can degrade gracefully instead of throwing. When KV is unbound (local dev)
 * it falls back to a direct fetch, which works from a clean IP.
 */
async function bingGet<T>(
  endpoint: string,
  siteUrl?: string
): Promise<T | null> {
  const cache = bingCache();
  if (cache) {
    const raw = await cache.get(cacheKey(endpoint, siteUrl));
    if (raw != null) return JSON.parse(raw) as T;
    return null;
  }
  if (!env.BING_API_KEY) return null;
  try {
    return await bingFetchLive<T>(endpoint, siteUrl);
  } catch {
    return null;
  }
}

export async function getBingOverview(): Promise<BingOverviewReport> {
  if (!env.BING_API_KEY)
    return {
      configured: false,
      available: false,
      totals: null,
      sites: [],
      missingFromBing: [],
      unmatchedBingSites: [],
      fetchedAt: new Date().toISOString(),
    };
  const { included } = overviewProperties(await listProperties());
  const sitesPayload = await bingGet<{ d?: BingUserSite[] }>('GetUserSites');
  if (!sitesPayload) {
    return {
      configured: true,
      available: false,
      totals: null,
      sites: [],
      missingFromBing: [],
      unmatchedBingSites: [],
      fetchedAt: new Date().toISOString(),
    };
  }
  const bingSites = sitesPayload.d ?? [];
  const bingByDomain = new Map<string, string>();
  for (const site of bingSites)
    if (site.IsVerified) bingByDomain.set(bingDomainOf(site.Url), site.Url);
  const gscDomains = new Set(included.map((site) => domainOf(site.siteUrl)));
  const sites = await mapSites(
    included,
    async (site): Promise<BingOverviewSite> => {
      const bingUrl = bingByDomain.get(domainOf(site.siteUrl));
      if (!bingUrl) return { status: 'missing', siteUrl: site.siteUrl };
      try {
        const rows = await bingQueryStats(bingUrl);
        return {
          status: 'ready',
          siteUrl: site.siteUrl,
          performance: buildBingPerformance(
            site.siteUrl,
            bingUrl,
            aggregateBingWeeks(rows),
            rows.length >= 500
          ),
        };
      } catch (error) {
        return {
          status: 'error',
          siteUrl: site.siteUrl,
          error: publicBingError(error),
        };
      }
    }
  );
  const ready = sites.flatMap((site) =>
    site.status === 'ready' ? [site.performance] : []
  );
  const totals = ready.length > 0 ? buildBingPortfolio(ready) : null;
  return {
    configured: true,
    available: true,
    totals,
    sites,
    missingFromBing: sites
      .filter((site) => site.status === 'missing')
      .map((site) => site.siteUrl),
    unmatchedBingSites: bingSites
      .filter((site) => !gscDomains.has(bingDomainOf(site.Url)))
      .map((site) => site.Url),
    fetchedAt: new Date().toISOString(),
  };
}

/** Detail view: weekly performance plus top queries and top pages. */
export async function getBingReport(siteUrl: string): Promise<BingSiteReport> {
  const sitesPayload = await bingGet<{ d?: BingUserSite[] }>('GetUserSites');
  if (!sitesPayload)
    throw new GscError(
      503,
      'Bing 缓存数据尚未同步（Bing 限流了 Workers 出向 IP）。请稍后重试或由干净 IP 重新播种缓存。'
    );
  const bingSites = sitesPayload.d ?? [];
  const bingUrl = bingSites.find(
    (site) => site.IsVerified && bingDomainOf(site.Url) === domainOf(siteUrl)
  )?.Url;
  if (!bingUrl)
    throw new GscError(
      404,
      '该站点没有关联 Bing Webmaster 站点。请先在 Bing Webmaster Tools 中验证该域名。'
    );
  const [queryRows, pageRows] = await Promise.all([
    bingQueryStats(bingUrl),
    bingPageStats(bingUrl),
  ]);
  const performance = buildBingPerformance(
    siteUrl,
    bingUrl,
    aggregateBingWeeks(queryRows),
    queryRows.length >= 500
  );
  return {
    ...performance,
    queries: bingTopQueries(queryRows, 20),
    pages: bingTopPages(pageRows, 20),
  };
}

/**
 * Portfolio sums each site's trailing four-week window. The previous window
 * sums whatever sites actually have one; brand-new sites without a prior period
 * are simply excluded from the baseline rather than forcing the whole portfolio
 * to drop its comparison.
 */
function buildBingPortfolio(ready: BingPerformance[]): BingPerformance {
  const metrics = mergeBingMetricsList(ready.map((site) => site.metrics));
  const withPrevious = ready.filter((site) => site.previousMetrics);
  const previousMetrics =
    withPrevious.length > 0
      ? mergeBingMetricsList(
          withPrevious.map(
            (site) =>
              site.previousMetrics as NonNullable<
                BingPerformance['previousMetrics']
              >
          )
        )
      : null;
  const weeks = aggregateBingPortfolioWeeks(ready);
  return {
    siteUrl: '',
    bingSiteUrl: '',
    weeks,
    metrics,
    previousMetrics,
    weekCount: weeks.length,
    truncated: ready.some((site) => site.truncated),
  };
}

async function bingQueryStats(siteUrl: string): Promise<BingStatsRow[]> {
  const payload = await bingGet<{ d?: BingStatsRow[] }>(
    'GetQueryStats',
    siteUrl
  );
  return payload?.d ?? [];
}

async function bingPageStats(siteUrl: string): Promise<BingStatsRow[]> {
  const payload = await bingGet<{ d?: BingStatsRow[] }>(
    'GetPageStats',
    siteUrl
  );
  return payload?.d ?? [];
}

/** Direct Bing call used only when KV is unbound (local dev). */
async function bingFetchLive<T>(
  endpoint: string,
  siteUrl?: string
): Promise<T> {
  const key = env.BING_API_KEY;
  if (!key) throw new GscError(503, 'Bing API 密钥未配置。');
  const url = new URL(`${BING_API_URL}/${endpoint}`);
  url.searchParams.set('apikey', key);
  if (siteUrl) url.searchParams.set('siteUrl', siteUrl);
  const response = await fetch(url.toString(), {
    headers: {
      'user-agent': 'saildesk/1.0 (+https://github.com/nykee/SailDesk)',
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(
      'Bing API failed',
      endpoint,
      response.status,
      body.slice(0, 200)
    );
    throw new GscError(
      502,
      response.status === 403
        ? 'Bing API 密钥无效或未授权，请在 Bing Webmaster Tools 重新生成密钥并更新 Cloudflare Secret。'
        : `Bing Webmaster API 返回错误（状态码 ${response.status}）：${body.slice(0, 120)}`
    );
  }
  return response.json() as Promise<T>;
}

/** GSC domain properties and Bing site URLs both reduce to a bare hostname. */
function domainOf(siteUrl: string): string {
  let host: string;
  if (siteUrl.startsWith('sc-domain:')) host = siteUrl.slice(10).toLowerCase();
  else
    try {
      host = new URL(siteUrl).host.toLowerCase();
    } catch {
      host = siteUrl.toLowerCase();
    }
  return stripWww(host);
}

function bingDomainOf(bingUrl: string): string {
  try {
    return stripWww(new URL(bingUrl).host.toLowerCase());
  } catch {
    return stripWww(bingUrl.toLowerCase());
  }
}

/** Bing may verify a www host while GSC tracks the apex; compare on the bare host. */
function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/** Deterministic batches bound Bing concurrency; failures stay per-site. */
async function mapSites<T, R>(
  items: T[],
  map: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += 4)
    results.push(
      ...(await Promise.all(items.slice(start, start + 4).map(map)))
    );
  return results;
}

function publicBingError(error: unknown): string {
  return error instanceof GscError
    ? error.message
    : 'Bing Webmaster 返回了无法解析的数据，请重试。';
}

/** Key shape used by both the worker and the seed job; keep them in sync. */
export function bingCacheKey(endpoint: string, siteUrl?: string): string {
  return cacheKey(endpoint, siteUrl);
}

export const BING_CACHE_TTL_SECONDS = BING_CACHE_TTL;
