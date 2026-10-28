import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOverview, getReport } from '@/server/gsc.server';

// Bindings are supplied at the runtime boundary; these tests never load local secrets.
vi.mock('cloudflare:workers', () => ({
  env: {
    GOOGLE_OAUTH_CLIENT_ID: 'test-client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret',
    GSC_REFRESH_TOKEN: 'test-refresh',
  },
}));

const range = { startDate: '2026-10-01', endDate: '2026-10-07' };

/** Reproduce Google completion metadata and disjoint, sparse daily groups. */
function googleTransport(failedSite?: string) {
  return vi.fn(async (input: string, init?: RequestInit) => {
    if (input.includes('oauth2.googleapis.com'))
      return Response.json({ access_token: 'test-access-token' });
    if (input.endsWith('/sites'))
      return Response.json({
        siteEntry: [
          { siteUrl: 'sc-domain:a.example', permissionLevel: 'siteOwner' },
          { siteUrl: 'sc-domain:b.example', permissionLevel: 'siteOwner' },
        ],
      });
    if (failedSite && input.includes(encodeURIComponent(failedSite)))
      return Response.json(
        { error: { message: 'Permission denied' } },
        { status: 403 }
      );
    const request = JSON.parse(init?.body as string);
    if (request.dataState === 'all')
      return Response.json({ metadata: { firstIncompleteDate: '2026-10-06' } });
    const a = input.includes('a.example');
    if (request.dimensions[0] === 'query') return Response.json({ rows: [] });
    return Response.json({
      rows: [
        {
          keys: ['2026-09-22'],
          clicks: a ? 100 : 0,
          impressions: a ? 1000 : 0,
          ctr: 0.1,
          position: a ? 5 : 10,
        },
        {
          keys: ['2026-09-29'],
          clicks: a ? 80 : 60,
          impressions: a ? 800 : 600,
          ctr: 0.1,
          position: a ? 5 : 10,
        },
      ],
    });
  });
}

// Date-only mocking keeps retention tests deterministic without mocking I/O timers.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T03:00:00Z'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GSC overview request boundary', () => {
  it('rejects a comparison baseline outside Google retention before calling any API', async () => {
    const transport = googleTransport();
    vi.stubGlobal('fetch', transport);
    await expect(
      getOverview({ startDate: '2020-01-01', endDate: '2020-01-28' })
    ).rejects.toMatchObject({ status: 400 });
    expect(transport).not.toHaveBeenCalled();
  });
  it('uses one token and exactly aligned final windows for all sites', async () => {
    const transport = googleTransport();
    vi.stubGlobal('fetch', transport);
    const report = await getOverview(range);
    expect(report.range).toEqual({
      startDate: '2026-09-29',
      endDate: '2026-10-05',
    });
    expect(report.sites).toHaveLength(2);
    expect(report.totals?.metrics.clicks).toBe(140);
    expect(report.totals?.metrics.position).toBeCloseTo(50 / 7);
    expect(report.totals?.previousMetrics.clicks).toBe(100);
    expect(report.totals?.trend).toHaveLength(7);
    expect(
      transport.mock.calls.filter(([url]) =>
        url.includes('oauth2.googleapis.com')
      )
    ).toHaveLength(1);
    const finalRequests = transport.mock.calls
      .filter(([url]) => url.includes('searchAnalytics'))
      .map(([, init]) => JSON.parse(init?.body as string))
      .filter((request) => request.dataState === 'final');
    expect(finalRequests).toHaveLength(2);
    expect(
      finalRequests.every(
        (request) =>
          request.startDate === '2026-09-22' && request.endDate === '2026-10-05'
      )
    ).toBe(true);
  });

  it('keeps failed properties visible and refuses to publish incomplete totals', async () => {
    vi.stubGlobal('fetch', googleTransport('sc-domain:b.example'));
    const report = await getOverview(range);
    expect(report.sites.map((site) => site.status)).toEqual(['ready', 'error']);
    expect(report.sites[1]).toMatchObject({
      status: 'error',
      error: 'Permission denied',
    });
    expect(report.totals).toBeNull();
  });

  it('gets single-site totals directly from Google and shares final-day alignment', async () => {
    vi.stubGlobal('fetch', googleTransport());
    const report = await getReport('sc-domain:a.example', range);
    expect(report.endDate).toBe('2026-10-05');
    expect(report.metrics.clicks).toBe(80);
    expect(report.queries).toEqual([]);
  });

  it('does not relock the dashboard when Google rejects its upstream credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) =>
        input.includes('oauth2.googleapis.com')
          ? Response.json({ access_token: 'expired' })
          : Response.json(
              { error: { message: 'Google authorization expired' } },
              { status: 401 }
            )
      )
    );
    await expect(getReport('sc-domain:a.example', range)).rejects.toMatchObject(
      { status: 502 }
    );
  });
});
