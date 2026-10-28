import { describe, expect, it } from 'vitest';
import type {
  BingOverviewReport,
  BingPerformance,
} from '@/features/bing/types';
import {
  buildInsights,
  buildSummary,
  joinSites,
  rankSites,
} from '@/features/combined/analysis';
import type { Ga4OverviewReport, Ga4Performance } from '@/features/ga4/types';
import type { DateRange } from '@/features/gsc/date-range';
import type {
  OverviewReport,
  OverviewSite,
  SearchPerformance,
} from '@/features/gsc/types';

const range: DateRange = { startDate: '2026-10-01', endDate: '2026-10-28' };

function gscSite(
  siteUrl: string,
  clicks: number,
  prevClicks: number,
  ctr = 0.05,
  impressions = clicks * 20,
  position = 8
): OverviewSite {
  const performance: SearchPerformance = {
    siteUrl,
    requestedRange: range,
    startDate: range.startDate,
    endDate: range.endDate,
    metrics: { clicks, impressions, ctr, position },
    previousMetrics: { clicks: prevClicks, impressions, ctr, position },
    deltas: {
      clicks: clicks - prevClicks,
      impressions: 0,
      ctr: 0,
      position: 0,
    },
    trend: [],
    previousTrend: [],
  };
  return {
    status: 'ready',
    property: { siteUrl, permissionLevel: 'siteOwner' },
    performance,
  };
}

function ga4Site(
  siteUrl: string,
  sessions: number,
  prevSessions: number
): Ga4OverviewReport['sites'][number] {
  const performance: Ga4Performance = {
    siteUrl,
    requestedRange: range,
    startDate: range.startDate,
    endDate: range.endDate,
    metrics: {
      sessions,
      users: sessions,
      pageviews: sessions,
      engagementRate: 0.5,
      averageSessionDuration: 60,
      keyEvents: 0,
    },
    previousMetrics: {
      sessions: prevSessions,
      users: prevSessions,
      pageviews: prevSessions,
      engagementRate: 0.5,
      averageSessionDuration: 60,
      keyEvents: 0,
    },
    deltas: {
      sessions: sessions - prevSessions,
      users: 0,
      pageviews: 0,
      engagementRate: 0,
      averageSessionDuration: 0,
      keyEvents: 0,
    },
    trend: [],
    previousTrend: [],
  };
  return { status: 'ready', siteUrl, performance };
}

function bingSite(
  siteUrl: string,
  clicks: number,
  prevClicks: number
): BingOverviewReport['sites'][number] {
  const performance: BingPerformance = {
    siteUrl,
    bingSiteUrl: `https://${siteUrl.replace('sc-domain:', '')}/`,
    weeks: [],
    metrics: { clicks, impressions: clicks * 10, ctr: 0.08, position: 6 },
    previousMetrics:
      prevClicks > 0
        ? {
            clicks: prevClicks,
            impressions: prevClicks * 10,
            ctr: 0.08,
            position: 6,
          }
        : null,
    weekCount: 4,
    truncated: false,
  };
  return { status: 'ready', siteUrl, performance };
}

describe('joinSites', () => {
  it('keeps every GSC site and attaches matching GA4/Bing by siteUrl', () => {
    const gsc: OverviewReport = {
      requestedRange: range,
      range,
      sites: [
        gscSite('sc-domain:a.com', 100, 80),
        gscSite('sc-domain:b.com', 50, 40),
      ],
      excludedProperties: [],
      totals: null,
      fetchedAt: '',
    };
    const ga4: Ga4OverviewReport = {
      requestedRange: range,
      range,
      sites: [ga4Site('sc-domain:a.com', 200, 150)],
      matchedProperties: [],
      unmatchedProperties: [],
      totals: null,
      fetchedAt: '',
    };
    const bing: BingOverviewReport = {
      configured: true,
      available: true,
      totals: null,
      sites: [bingSite('sc-domain:b.com', 10, 5)],
      missingFromBing: [],
      unmatchedBingSites: [],
      fetchedAt: '',
    };
    const joined = joinSites(gsc, ga4, bing);
    expect(joined).toHaveLength(2);
    const a = joined.find((s) => s.siteUrl === 'sc-domain:a.com');
    const b = joined.find((s) => s.siteUrl === 'sc-domain:b.com');
    expect(a?.gsc?.metrics.clicks).toBe(100);
    expect(a?.ga4?.metrics.sessions).toBe(200);
    expect(a?.bing).toBeUndefined();
    expect(b?.bing?.metrics.clicks).toBe(10);
    expect(b?.ga4).toBeUndefined();
  });
});

describe('buildSummary', () => {
  it('aggregates headline cross-source numbers and ratio', () => {
    const gsc: OverviewReport = {
      requestedRange: range,
      range,
      sites: [
        gscSite('sc-domain:a.com', 100, 50),
        gscSite('sc-domain:b.com', 200, 100),
      ],
      excludedProperties: [],
      totals: {
        siteUrl: 'sc-domain:sum',
        requestedRange: range,
        startDate: range.startDate,
        endDate: range.endDate,
        metrics: { clicks: 300, impressions: 6000, ctr: 0.05, position: 8 },
        previousMetrics: {
          clicks: 150,
          impressions: 3000,
          ctr: 0.05,
          position: 8,
        },
        deltas: { clicks: 150, impressions: 0, ctr: 0, position: 0 },
        trend: [],
        previousTrend: [],
      },
      fetchedAt: '',
    };
    const ga4: Ga4OverviewReport = {
      requestedRange: range,
      range,
      sites: [
        ga4Site('sc-domain:a.com', 200, 100),
        ga4Site('sc-domain:b.com', 400, 200),
      ],
      matchedProperties: [],
      unmatchedProperties: [],
      totals: {
        siteUrl: 'sc-domain:sum',
        requestedRange: range,
        startDate: range.startDate,
        endDate: range.endDate,
        metrics: {
          sessions: 600,
          users: 600,
          pageviews: 600,
          engagementRate: 0.5,
          averageSessionDuration: 60,
          keyEvents: 0,
        },
        previousMetrics: {
          sessions: 300,
          users: 300,
          pageviews: 300,
          engagementRate: 0.5,
          averageSessionDuration: 60,
          keyEvents: 0,
        },
        deltas: {
          sessions: 300,
          users: 0,
          pageviews: 0,
          engagementRate: 0,
          averageSessionDuration: 0,
          keyEvents: 0,
        },
        trend: [],
        previousTrend: [],
      },
      fetchedAt: '',
    };
    const bing: BingOverviewReport = {
      configured: true,
      available: true,
      totals: {
        siteUrl: 'sc-domain:sum',
        bingSiteUrl: 'https://sum/',
        weeks: [],
        metrics: { clicks: 30, impressions: 300, ctr: 0.1, position: 6 },
        previousMetrics: {
          clicks: 15,
          impressions: 150,
          ctr: 0.1,
          position: 6,
        },
        weekCount: 4,
        truncated: false,
      },
      sites: [
        bingSite('sc-domain:a.com', 10, 5),
        bingSite('sc-domain:b.com', 20, 10),
      ],
      missingFromBing: [],
      unmatchedBingSites: [],
      fetchedAt: '',
    };
    const joined = joinSites(gsc, ga4, bing);
    const summary = buildSummary(gsc, ga4, bing, joined);
    expect(summary.gscClicks).toBe(300);
    expect(summary.ga4Sessions).toBe(600);
    expect(summary.bingClicks).toBe(30);
    // search share uses only sites that have both GSC and GA4
    expect(summary.searchShare).toBeCloseTo(0.5, 5);
    expect(summary.searchShareSites).toBe(2);
    expect(summary.gscClicksPrevious).toBe(150);
    expect(summary.gscClickChange).toBeCloseTo(1, 5);
    expect(summary.ga4Covered).toBe(2);
    expect(summary.bingCovered).toBe(2);
    expect(summary.siteCount).toBe(2);
  });
});

describe('buildInsights', () => {
  it('flags GA4 coverage gaps and Bing verification gaps', () => {
    const gsc: OverviewReport = {
      requestedRange: range,
      range,
      sites: [
        gscSite('sc-domain:a.com', 100, 80),
        gscSite('sc-domain:b.com', 50, 40),
      ],
      excludedProperties: [],
      totals: null,
      fetchedAt: '',
    };
    const ga4: Ga4OverviewReport = {
      requestedRange: range,
      range,
      // only a.com is linked; b.com is unmatched
      sites: [
        ga4Site('sc-domain:a.com', 200, 150),
        { status: 'unmatched', siteUrl: 'sc-domain:b.com' },
      ],
      matchedProperties: [],
      unmatchedProperties: [],
      totals: null,
      fetchedAt: '',
    };
    const bing: BingOverviewReport = {
      configured: true,
      available: true,
      totals: null,
      sites: [bingSite('sc-domain:a.com', 10, 5)],
      missingFromBing: ['sc-domain:b.com'],
      unmatchedBingSites: [],
      fetchedAt: '',
    };
    const joined = joinSites(gsc, ga4, bing);
    const insights = buildInsights(gsc, ga4, bing, joined);
    const ga4Gap = insights.find((i) => i.id === 'ga4-gap');
    const bingGap = insights.find((i) => i.id === 'bing-gap');
    expect(ga4Gap?.severity).toBe('high');
    expect(ga4Gap?.sites).toContain('sc-domain:b.com');
    expect(bingGap?.severity).toBe('medium');
    expect(bingGap?.sites).toContain('sc-domain:b.com');
  });

  it('flags low CTR and declining clicks as high priority', () => {
    const big = gscSite('sc-domain:big.com', 1000, 1200, 0.01, 100000, 12);
    const gsc: OverviewReport = {
      requestedRange: range,
      range,
      sites: [big],
      excludedProperties: [],
      totals: null,
      fetchedAt: '',
    };
    const ga4: Ga4OverviewReport = {
      requestedRange: range,
      range,
      sites: [],
      matchedProperties: [],
      unmatchedProperties: [],
      totals: null,
      fetchedAt: '',
    };
    const bing: BingOverviewReport = {
      configured: true,
      available: true,
      totals: null,
      sites: [],
      missingFromBing: [],
      unmatchedBingSites: [],
      fetchedAt: '',
    };
    const joined = joinSites(gsc, ga4, bing);
    const insights = buildInsights(gsc, ga4, bing, joined);
    expect(insights.find((i) => i.id === 'low-ctr')?.sites).toContain(
      'sc-domain:big.com'
    );
    expect(insights.find((i) => i.id === 'declining')?.sites).toContain(
      'sc-domain:big.com'
    );
  });
});

describe('rankSites', () => {
  it('sorts sites by GSC clicks descending', () => {
    const gsc: OverviewReport = {
      requestedRange: range,
      range,
      sites: [
        gscSite('sc-domain:a.com', 100, 80),
        gscSite('sc-domain:b.com', 500, 400),
      ],
      excludedProperties: [],
      totals: null,
      fetchedAt: '',
    };
    const ga4: Ga4OverviewReport = {
      requestedRange: range,
      range,
      sites: [],
      matchedProperties: [],
      unmatchedProperties: [],
      totals: null,
      fetchedAt: '',
    };
    const bing: BingOverviewReport = {
      configured: true,
      available: true,
      totals: null,
      sites: [],
      missingFromBing: [],
      unmatchedBingSites: [],
      fetchedAt: '',
    };
    const ranked = rankSites(joinSites(gsc, ga4, bing));
    expect(ranked[0].siteUrl).toBe('sc-domain:b.com');
  });
});
