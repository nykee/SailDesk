import { describe, expect, it } from 'vitest';
import type { BingSiteReport } from '@/features/bing/types';
import {
  buildSiteReportCsv,
  buildSiteReportMarkdown,
  type SiteExportInput,
  siteExportFileName,
} from '@/features/export/site-report';
import type { Ga4SiteReport } from '@/features/ga4/types';
import type { DateRange } from '@/features/gsc/date-range';
import type { SearchReport } from '@/features/gsc/types';
import type { UmamiSiteReport } from '@/features/umami/types';

const range: DateRange = { startDate: '2026-10-01', endDate: '2026-10-28' };
const generatedAt = new Date('2026-10-28T00:30:00.000Z');

function gscReport(overrides: Partial<SearchReport> = {}): SearchReport {
  return {
    siteUrl: 'sc-domain:example.com',
    requestedRange: range,
    startDate: range.startDate,
    endDate: range.endDate,
    metrics: { clicks: 120, impressions: 4000, ctr: 0.03, position: 12.4 },
    previousMetrics: {
      clicks: 80,
      impressions: 2000,
      ctr: 0.04,
      position: 14.2,
    },
    deltas: { clicks: 40, impressions: 2000, ctr: -0.01, position: -1.8 },
    trend: [
      {
        date: '2026-10-01',
        clicks: 5,
        impressions: 100,
        ctr: 0.05,
        position: 9.5,
      },
    ],
    previousTrend: [],
    queries: [
      {
        query: 'ai video tool',
        clicks: 10,
        impressions: 300,
        ctr: 0.033,
        position: 6.2,
      },
    ],
    pages: [
      {
        page: 'https://example.com/tools/video',
        clicks: 6,
        impressions: 240,
        ctr: 0.025,
        position: 7.4,
      },
    ],
    ...overrides,
  };
}

function ga4Report(): Ga4SiteReport {
  return {
    siteUrl: 'sc-domain:example.com',
    requestedRange: range,
    startDate: range.startDate,
    endDate: range.endDate,
    metrics: {
      sessions: 300,
      users: 250,
      pageviews: 900,
      engagementRate: 0.55,
      averageSessionDuration: 92.5,
      keyEvents: 12,
    },
    previousMetrics: {
      sessions: 200,
      users: 180,
      pageviews: 600,
      engagementRate: 0.5,
      averageSessionDuration: 80,
      keyEvents: 8,
    },
    deltas: {
      sessions: 100,
      users: 70,
      pageviews: 300,
      engagementRate: 0.05,
      averageSessionDuration: 12.5,
      keyEvents: 4,
    },
    trend: [],
    previousTrend: [],
    link: { propertyId: '123456789', displayName: 'example.com - GA4' },
    channels: [
      { channel: 'Organic Search', sessions: 200, previousSessions: 150 },
      { channel: 'Direct', sessions: 100, previousSessions: 50 },
    ],
    pages: [{ pagePath: '/', sessions: 180, users: 150, pageviews: 400 }],
    breakdowns: {
      sources: [
        {
          label: 'google / organic',
          sessions: 200,
          previousSessions: 150,
          users: 170,
          pageviews: 380,
          engagementRate: 0.52,
          keyEvents: 7,
        },
      ],
      landingPages: [
        {
          label: '/pricing',
          sessions: 120,
          previousSessions: 90,
          users: 100,
          pageviews: 240,
          engagementRate: 0.6,
          keyEvents: 5,
        },
      ],
      devices: [
        {
          label: '移动端',
          sessions: 180,
          previousSessions: 120,
          users: 150,
          pageviews: 330,
          engagementRate: 0.5,
          keyEvents: 4,
        },
      ],
      countries: [
        {
          label: 'United States',
          sessions: 160,
          previousSessions: 110,
          users: 130,
          pageviews: 300,
          engagementRate: 0.55,
          keyEvents: 6,
        },
      ],
      events: [
        {
          label: 'sign_up',
          sessions: 40,
          previousSessions: 20,
          users: 38,
          pageviews: 45,
          engagementRate: 0.8,
          keyEvents: 12,
        },
      ],
    },
  };
}

function bingReport(overrides: Partial<BingSiteReport> = {}): BingSiteReport {
  return {
    siteUrl: 'sc-domain:example.com',
    bingSiteUrl: 'https://www.example.com/',
    weeks: [
      { weekStart: '2026-10-05', clicks: 20, impressions: 400, position: 7.1 },
    ],
    metrics: { clicks: 20, impressions: 400, ctr: 0.05, position: 7.1 },
    previousMetrics: { clicks: 10, impressions: 200, ctr: 0.05, position: 8.3 },
    weekCount: 4,
    truncated: false,
    queries: [
      { query: 'video generator', clicks: 8, impressions: 120, position: 5.4 },
    ],
    pages: [
      {
        page: 'https://www.example.com/',
        clicks: 12,
        impressions: 200,
        position: 6.1,
      },
    ],
    ...overrides,
  };
}

function umamiReport(): UmamiSiteReport {
  return {
    siteUrl: 'sc-domain:example.com',
    websiteId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    requestedRange: range,
    startDate: range.startDate,
    endDate: range.endDate,
    metrics: {
      pageviews: 500,
      visitors: 200,
      visits: 260,
      bounces: 90,
      totalTime: 9000,
    },
    previousMetrics: {
      pageviews: 400,
      visitors: 180,
      visits: 210,
      bounces: 80,
      totalTime: 8000,
    },
    deltas: {
      pageviews: 100,
      visitors: 20,
      visits: 50,
      bounces: 10,
      totalTime: 1000,
    },
    trend: [],
    previousTrend: [],
    pages: [{ path: '/', pageviews: 300 }],
    referrers: [{ referrer: 'google.com', visitors: 120 }],
    events: [{ name: 'signup', count: 9 }],
  };
}

function input(overrides: Partial<SiteExportInput> = {}): SiteExportInput {
  return {
    siteUrl: 'sc-domain:example.com',
    gsc: gscReport(),
    ga4: ga4Report(),
    bing: bingReport(),
    umami: umamiReport(),
    generatedAt,
    ...overrides,
  };
}

describe('siteExportFileName', () => {
  it('uses the actual GSC window, not the requested one', () => {
    // Google shifts the window back when the newest days are incomplete.
    const shifted = input({
      gsc: gscReport({ startDate: '2026-09-30', endDate: '2026-10-27' }),
    });
    expect(siteExportFileName(shifted, 'md')).toBe(
      'saildesk-example.com-2026-09-30_2026-10-27.md'
    );
    expect(siteExportFileName(shifted, 'csv')).toBe(
      'saildesk-example.com-2026-09-30_2026-10-27.csv'
    );
  });

  it('strips characters that are unsafe in a file name', () => {
    const prefix = input({ siteUrl: 'https://www.example.com/blog/' });
    const name = siteExportFileName(prefix, 'md');
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
    expect(name).toContain('www.example.com');
  });
});

describe('buildSiteReportMarkdown', () => {
  it('opens with the site header and the source coverage line', () => {
    const markdown = buildSiteReportMarkdown(input());
    expect(markdown).toContain('# 站点诊断报告 · example.com');
    expect(markdown).toContain('`sc-domain:example.com`');
    expect(markdown).toContain('2026-10-28 00:30:00 UTC');
    expect(markdown).toContain('2026-10-01 → 2026-10-28（28 天）');
    expect(markdown).toContain('GSC ✅ · GA4 ✅ · Bing ✅ · Umami ✅');
  });

  it('emits all six numbered sections in order', () => {
    const markdown = buildSiteReportMarkdown(input());
    const headings = [
      '## 1. 核心指标',
      '## 2. Google Search Console',
      '## 3. Google Analytics 4',
      '## 4. Bing Webmaster',
      '## 5. Umami',
      '## 6. 口径与缺口（分析前必读）',
    ];
    const positions = headings.map((heading) => markdown.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('keeps the caveat that blocks the cross-source ratio mistake', () => {
    const markdown = buildSiteReportMarkdown(input());
    expect(markdown).toContain('不要把 GA4 会话除以 GSC 点击');
    expect(markdown).toContain('数值越小越好');
  });

  it('reports a missing source as missing instead of zero', () => {
    const markdown = buildSiteReportMarkdown(
      input({ ga4: undefined, bing: undefined, umami: undefined })
    );
    expect(markdown).toContain('GA4 ❌ 未接入');
    expect(markdown).toContain('Bing ❌ 未接入');
    expect(markdown).toContain('Umami ❌ 未接入');
    expect(markdown).toContain('该站点未关联 GA4 媒体资源');
    expect(markdown).toContain('该站点未关联 Bing Webmaster 站点');
    expect(markdown).toContain('该站点未关联 Umami 站点');
    // No GA4/Bing/Umami rows leak into the core metric table.
    expect(markdown).not.toContain('站内会话（GA4）');
    expect(markdown).not.toContain('Bing 点击');
    expect(markdown).not.toContain('浏览量（Umami）');
  });

  it('marks a connected source that returned no rows as 无数据, not a plain tick', () => {
    const markdown = buildSiteReportMarkdown(
      input({
        bing: bingReport({ weeks: [], queries: [], pages: [] }),
      })
    );
    expect(markdown).toContain('Bing ✅ 无数据');
    // GA4 still has sessions in this fixture, so it stays a plain tick.
    expect(markdown).toContain('GA4 ✅');
  });

  it('distinguishes a failed source from a source that is not connected', () => {
    const markdown = buildSiteReportMarkdown(
      input({
        ga4: undefined,
        bing: undefined,
        umami: undefined,
        failedSources: ['ga4'],
      })
    );
    expect(markdown).toContain('GA4 ⚠️ 读取失败');
    expect(markdown).toContain('Bing ❌ 未接入');
    expect(markdown).toContain('GA4 数据本次读取失败');
    expect(markdown).not.toContain('该站点未关联 GA4 媒体资源');
  });

  it('says 新增 instead of an infinite growth rate when the previous period is zero', () => {
    const markdown = buildSiteReportMarkdown(
      input({
        gsc: gscReport({
          previousMetrics: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        }),
      })
    );
    expect(markdown).toContain('新增');
    expect(markdown).not.toContain('Infinity');
    expect(markdown).not.toContain('∞');
  });

  it('does not invent a ranking move when the previous window had no impressions', () => {
    const markdown = buildSiteReportMarkdown(
      input({
        gsc: gscReport({
          previousMetrics: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        }),
      })
    );
    const positionRow = markdown
      .split('\n')
      .find((line) => line.startsWith('| 平均排名 |'));
    // Position 0 is a "no data" sentinel; a delta against it is meaningless.
    expect(positionRow).toContain('无可比区间');
    expect(positionRow).not.toContain('+42.7');
  });

  it('marks an unavailable Bing comparison window explicitly', () => {
    const markdown = buildSiteReportMarkdown(
      input({ bing: bingReport({ previousMetrics: null }) })
    );
    expect(markdown).toContain('无可比区间');
  });

  it('falls back to a placeholder when a section has no rows', () => {
    const markdown = buildSiteReportMarkdown(
      input({
        gsc: gscReport({ trend: [], queries: [], pages: [] }),
        ga4: { ...ga4Report(), channels: [], pages: [] },
        bing: bingReport({ weeks: [], queries: [], pages: [] }),
        umami: { ...umamiReport(), pages: [], referrers: [], events: [] },
      })
    );
    expect(markdown).toContain('（该区间没有逐日数据）');
    expect(markdown).toContain('（该区间没有关键词数据）');
    expect(markdown).toContain('（该区间没有页面数据）');
    expect(markdown).toContain('（没有渠道数据）');
    expect(markdown).toContain('（没有周桶数据）');
    expect(markdown).toContain('（没有事件数据）');
  });

  it('includes landing pages, which is what a page-level fix acts on', () => {
    const markdown = buildSiteReportMarkdown(input());
    expect(markdown).toContain('### 2.3 获得曝光的页面（Top 1）');
    expect(markdown).toContain('https://example.com/tools/video');
    expect(markdown).toContain('曝光高但点击率低的页面是优先项');
  });

  it('breaks GA4 down by source, landing page, device, country and event', () => {
    const markdown = buildSiteReportMarkdown(input());
    expect(markdown).toContain('### 3.4 来源 / 媒介');
    expect(markdown).toContain('google / organic');
    expect(markdown).toContain('### 3.5 落地页');
    expect(markdown).toContain('/pricing');
    expect(markdown).toContain('### 3.6 设备');
    expect(markdown).toContain('移动端');
    expect(markdown).toContain('### 3.7 国家 / 地区');
    expect(markdown).toContain('United States');
    expect(markdown).toContain('### 3.8 事件');
    expect(markdown).toContain('sign_up');
  });

  it('flags a truncated Bing result so long-tail totals are read as approximate', () => {
    const markdown = buildSiteReportMarkdown(
      input({ bing: bingReport({ truncated: true }) })
    );
    expect(markdown).toContain('已触达（长尾总计为近似值）');
  });
});

describe('buildSiteReportCsv', () => {
  it('starts with the wide header and keeps one row per entity', () => {
    const lines = buildSiteReportCsv(input()).split('\n');
    expect(lines[0]).toBe(
      'source,table,item,value,previous,delta,clicks,impressions,ctr,position,sessions,users,pageviews,visits,keyEvents,count'
    );
    // 4 GSC summary + 1 query + 1 page + 1 trend + 6 GA4 summary + 2 channels
    // + 1 page + 5 breakdowns + 1 Bing week + 1 Bing query + 1 Bing page
    // + 5 Umami summary + 1 page + 1 referrer + 1 event.
    expect(lines).toHaveLength(
      1 + 4 + 1 + 1 + 1 + 6 + 2 + 1 + 5 + 1 + 1 + 1 + 5 + 1 + 1 + 1
    );
  });

  it('tags every row with its source so a spreadsheet can pivot', () => {
    const lines = buildSiteReportCsv(input()).split('\n').slice(1);
    const sources = new Set(lines.map((line) => line.split(',')[0]));
    expect([...sources].sort()).toEqual(['bing', 'ga4', 'gsc', 'umami']);
  });

  it('keeps GSC queries and pages as separate table values', () => {
    const csv = buildSiteReportCsv(input());
    expect(csv).toContain('gsc,query,ai video tool,,,,10,300,0.033,6.2');
    expect(csv).toContain(
      'gsc,page,https://example.com/tools/video,,,,6,240,0.025,7.4'
    );
  });

  it('emits one row per GA4 breakdown value, tagged by dimension', () => {
    const csv = buildSiteReportCsv(input());
    for (const expected of [
      'ga4,source,google / organic',
      'ga4,landing,/pricing',
      'ga4,device,移动端',
      'ga4,country,United States',
      'ga4,event,sign_up',
    ])
      expect(csv).toContain(expected);
  });

  it('omits rows for sources that are not connected', () => {
    const csv = buildSiteReportCsv(
      input({ ga4: undefined, bing: undefined, umami: undefined })
    );
    expect(csv).not.toContain('ga4,');
    expect(csv).not.toContain('bing,');
    expect(csv).not.toContain('umami,');
  });

  it('quotes commas, quotes and newlines per RFC 4180', () => {
    const csv = buildSiteReportCsv(
      input({
        gsc: gscReport({
          queries: [
            {
              query: 'ai, video "tool"',
              clicks: 10,
              impressions: 300,
              ctr: 0.033,
              position: 6.2,
            },
            {
              query: 'line\nbreak',
              clicks: 1,
              impressions: 10,
              ctr: 0.1,
              position: 3,
            },
          ],
        }),
      })
    );
    expect(csv).toContain('gsc,query,"ai, video ""tool"""');
    expect(csv).toContain('gsc,query,"line\nbreak"');
  });

  it('leaves empty cells empty rather than inventing zeros', () => {
    const row = buildSiteReportCsv(input())
      .split('\n')
      .find((line) => line.startsWith('gsc,query,'));
    // `item` is the query, then value/previous/delta are blank, then the metric
    // columns start at `clicks` — blank, never 0.
    expect(row).toBe('gsc,query,ai video tool,,,,10,300,0.033,6.2');
  });

  it('keeps GA4 engagement rate as a ratio, not a percentage string', () => {
    const row = buildSiteReportCsv(input())
      .split('\n')
      .find(
        (line) =>
          line === 'ga4,summary,engagementRate,0.55,0.5,0.050000000000000044'
      );
    expect(row).toBeDefined();
  });
});
