import { describe, expect, it } from 'vitest';
import {
  assignGa4Properties,
  displayNameMatchesDomain,
  gscHostnameRule,
  hostnameMatches,
} from '@/features/ga4/mapping';
import {
  aggregateGa4Metrics,
  aggregateGa4Trend,
  ga4ChannelRows,
  ga4Deltas,
  ga4MetricsFromValues,
  normalizeGa4Date,
} from '@/features/ga4/metrics';

describe('GA4 compact dates', () => {
  it('normalizes the Data API YYYYMMDD dates onto ISO calendar keys', () => {
    expect(normalizeGa4Date('20261005')).toBe('2026-10-05');
    expect(normalizeGa4Date('20260201')).toBe('2026-02-01');
    expect(normalizeGa4Date('2026-10-05')).toBe('2026-10-05');
  });
});

const metrics = (
  sessions: number,
  overrides: Partial<Record<string, number>> = {}
) => ({
  sessions,
  users: sessions,
  pageviews: sessions * 2,
  engagementRate: 0.5,
  averageSessionDuration: 30,
  keyEvents: 0,
  ...overrides,
});

describe('GA4 hostname matching', () => {
  it('covers subdomains for domain properties but exact hosts for URL prefixes', () => {
    const domainRule = gscHostnameRule('sc-domain:kuvatom.com');
    expect(hostnameMatches(domainRule, 'kuvatom.com')).toBe(true);
    expect(hostnameMatches(domainRule, 'www.kuvatom.com')).toBe(true);
    expect(hostnameMatches(domainRule, 'kuvatom.com.evil.io')).toBe(false);
    const prefixRule = gscHostnameRule('https://www.kuvatom.com/');
    expect(hostnameMatches(prefixRule, 'www.kuvatom.com')).toBe(true);
    expect(hostnameMatches(prefixRule, 'kuvatom.com')).toBe(false);
  });

  it('matches display names only on the whole normalized domain, never on fragments', () => {
    expect(
      displayNameMatchesDomain('kuvatom.com', 'sc-domain:kuvatom.com')
    ).toBe(true);
    expect(
      displayNameMatchesDomain(' Kuvatom . com ', 'sc-domain:kuvatom.com')
    ).toBe(true);
    expect(displayNameMatchesDomain('kuvatom', 'sc-domain:kuvatom.com')).toBe(
      false
    );
    // The fragment danger case: two real sites in the same portfolio.
    expect(
      displayNameMatchesDomain('kuvstudio', 'sc-domain:kuvmusic.com')
    ).toBe(false);
    expect(displayNameMatchesDomain('kuvmusic', 'sc-domain:kuvmusic.com')).toBe(
      false
    );
  });

  it('assigns at most one site per GA4 property so traffic is never double counted', () => {
    const sites = [
      { siteUrl: 'sc-domain:kuvmusic.com', permissionLevel: 'siteOwner' },
      { siteUrl: 'sc-domain:kuvatom.com', permissionLevel: 'siteOwner' },
    ];
    const summaries = [
      { propertyId: '421', displayName: 'kuvatom.com' },
      { propertyId: '422', displayName: 'Music' },
    ];
    // Without host probes only the display-name match links.
    expect(
      assignGa4Properties(sites, summaries, new Map()).get(
        'sc-domain:kuvatom.com'
      )
    ).toEqual({
      propertyId: '421',
      displayName: 'kuvatom.com',
    });
    expect(
      assignGa4Properties(sites, summaries, new Map()).has(
        'sc-domain:kuvmusic.com'
      )
    ).toBe(false);
    // Host probes rescue the remaining property, and each site claims its own.
    const assignments = assignGa4Properties(
      sites,
      summaries,
      new Map([['422', ['kuvmusic.com']]])
    );
    expect(assignments.get('sc-domain:kuvmusic.com')?.propertyId).toBe('422');
    expect(assignments.get('sc-domain:kuvatom.com')?.propertyId).toBe('421');
  });

  it('keeps an aggregated property from being claimed by a second site', () => {
    const sites = [
      { siteUrl: 'sc-domain:a.example', permissionLevel: 'siteOwner' },
      { siteUrl: 'sc-domain:b.example', permissionLevel: 'siteOwner' },
    ];
    const summaries = [{ propertyId: '1', displayName: 'a.example' }];
    const hosts = new Map([['1', ['b.example']]]);
    const assignments = assignGa4Properties(sites, summaries, hosts);
    expect(assignments.get('sc-domain:a.example')?.propertyId).toBe('1');
    expect(assignments.has('sc-domain:b.example')).toBe(false);
  });
});

describe('GA4 metric math', () => {
  it('parses the decimal strings returned by the Data API', () => {
    expect(
      ga4MetricsFromValues(['100', '80', '250', '0.62', '91.5', '3'])
    ).toEqual({
      sessions: 100,
      users: 80,
      pageviews: 250,
      engagementRate: 0.62,
      averageSessionDuration: 91.5,
      keyEvents: 3,
    });
    expect(ga4MetricsFromValues([]).sessions).toBe(0);
  });

  it('weights rates by sessions and sums counters across sites', () => {
    const aggregated = aggregateGa4Metrics([
      metrics(100, { engagementRate: 0.8 }),
      metrics(300, { engagementRate: 0.4 }),
    ]);
    expect(aggregated.sessions).toBe(400);
    expect(aggregated.pageviews).toBe(800);
    expect(aggregated.engagementRate).toBeCloseTo(0.5);
    expect(aggregated.averageSessionDuration).toBe(30);
  });

  it('computes zero-free deltas without inventing data', () => {
    expect(ga4Deltas(metrics(150), metrics(100)).sessions).toBe(50);
    expect(ga4Deltas(metrics(50), metrics(100)).sessions).toBe(-50);
  });

  it('fills sparse GA4 daily rows onto the full calendar like the GSC trend', () => {
    const trend = aggregateGa4Trend(
      [[{ date: '2026-10-01', ...metrics(10) }]],
      { startDate: '2026-10-01', endDate: '2026-10-03' }
    );
    expect(trend.map((point) => point.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(trend[1].sessions).toBe(0);
    expect(trend[1].engagementRate).toBe(0);
  });

  it('pairs channels across windows and sorts by current sessions', () => {
    const rows = ga4ChannelRows(
      [
        { channel: 'Organic Search', metrics: metrics(50) },
        { channel: 'Direct', metrics: metrics(120) },
      ],
      [{ channel: 'Direct', metrics: metrics(90) }]
    );
    expect(rows.map((row) => row.channel)).toEqual([
      'Direct',
      'Organic Search',
    ]);
    expect(rows[0]).toMatchObject({ sessions: 120, previousSessions: 90 });
    expect(rows[1].previousSessions).toBe(0);
  });
});
