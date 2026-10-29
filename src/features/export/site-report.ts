import type { BingSiteReport } from '@/features/bing/types';
import type { Ga4SiteReport } from '@/features/ga4/types';
import { type DateRange, previousDateRange } from '@/features/gsc/date-range';
import {
  formatNumber,
  formatPercent,
  formatPosition,
} from '@/features/gsc/format';
import { propertyName } from '@/features/gsc/property';
import type { SearchReport } from '@/features/gsc/types';
import type { UmamiSiteReport } from '@/features/umami/types';

/**
 * Everything the single-site detail view already holds, in one object. The
 * export is assembled in the browser from data that is already on screen, so
 * it never triggers another Google, Bing or Umami request.
 */
export type ExportSource = 'ga4' | 'bing' | 'umami';

export type SiteExportInput = {
  siteUrl: string;
  gsc: SearchReport;
  ga4?: Ga4SiteReport;
  bing?: BingSiteReport;
  umami?: UmamiSiteReport;
  /** Sources that failed to load; distinct from "not connected". */
  failedSources?: ExportSource[];
  generatedAt: Date;
};

/**
 * Google may shift the window back when the newest days are still incomplete.
 * The file name and the body must both describe the range the numbers actually
 * cover, otherwise the export contradicts itself.
 */
function actualRange(input: SiteExportInput): DateRange {
  return { startDate: input.gsc.startDate, endDate: input.gsc.endDate };
}

/** A stable, filesystem-safe name; the date pair makes repeated exports sort. */
export function siteExportFileName(
  input: SiteExportInput,
  extension: 'md' | 'csv'
): string {
  const host = propertyName(input.siteUrl).replace(/[^a-zA-Z0-9.-]/g, '-');
  const range = actualRange(input);
  return `saildesk-${host}-${range.startDate}_${range.endDate}.${extension}`;
}

/** Inclusive day count, matching how the dashboard describes its windows. */
function dayCount(range: DateRange): number {
  const start = Date.parse(`${range.startDate}T00:00:00Z`);
  const end = Date.parse(`${range.endDate}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Relative movement with the same vocabulary the dashboard uses on screen. */
function changeLabel(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '持平' : '新增';
  if (current === previous) return '持平';
  const ratio = (current - previous) / previous;
  return `${ratio > 0 ? '+' : ''}${formatPercent(ratio)}`;
}

function signedNumber(value: number): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

function signedDecimal(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

function signedPercentPoints(value: number): string {
  const points = value * 100;
  return `${points > 0 ? '+' : ''}${points.toFixed(2)}pp`;
}

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return [head, rule, body].filter(Boolean).join('\n');
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body}`;
}

function sourceLine(input: SiteExportInput): string {
  // "Connected" and "returned rows" are different claims. A site can be linked
  // to Bing and still report nothing for the window, and a reader who sees only
  // a tick will assume there is data behind it.
  const hasData: Record<ExportSource, boolean> = {
    ga4: Boolean(
      input.ga4 &&
        (input.ga4.metrics.sessions > 0 || input.ga4.channels.length > 0)
    ),
    bing: Boolean(
      input.bing &&
        input.bing.weeks.length +
          input.bing.queries.length +
          input.bing.pages.length >
          0
    ),
    umami: Boolean(
      input.umami &&
        (input.umami.metrics.pageviews > 0 || input.umami.pages.length > 0)
    ),
  };
  const state = (source: ExportSource, present: boolean) => {
    if (!present) {
      // A failed request is not a missing property; conflating them would let an
      // analysis model conclude the site has no traffic in that source.
      return input.failedSources?.includes(source) ? '⚠️ 读取失败' : '❌ 未接入';
    }
    return hasData[source] ? '✅' : '✅ 无数据';
  };
  return [
    'GSC ✅',
    `GA4 ${state('ga4', Boolean(input.ga4))}`,
    `Bing ${state('bing', Boolean(input.bing))}`,
    `Umami ${state('umami', Boolean(input.umami))}`,
  ].join(' · ');
}

function headerBlock(input: SiteExportInput, actual: DateRange): string {
  const previous = previousDateRange(actual);
  return [
    `# 站点诊断报告 · ${propertyName(input.siteUrl)}`,
    '',
    `- 站点：\`${input.siteUrl}\``,
    `- 生成时间：${input.generatedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    `- 数据区间：${actual.startDate} → ${actual.endDate}（${dayCount(actual)} 天）`,
    `- 对比区间：${previous.startDate} → ${previous.endDate}（${dayCount(previous)} 天）`,
    `- 数据源：${sourceLine(input)}`,
    '',
    '> 这份文件是给分析模型做站点优化诊断用的。请先读最后一节「口径与缺口」，再下结论。',
  ].join('\n');
}

function coreMetrics(input: SiteExportInput): string {
  const { metrics, previousMetrics } = input.gsc;
  const rows: string[][] = [
    [
      '搜索点击',
      formatNumber(metrics.clicks),
      formatNumber(previousMetrics.clicks),
      `${changeLabel(metrics.clicks, previousMetrics.clicks)}（${signedNumber(metrics.clicks - previousMetrics.clicks)}）`,
    ],
    [
      '搜索曝光',
      formatNumber(metrics.impressions),
      formatNumber(previousMetrics.impressions),
      `${changeLabel(metrics.impressions, previousMetrics.impressions)}（${signedNumber(metrics.impressions - previousMetrics.impressions)}）`,
    ],
    [
      '搜索点击率',
      formatPercent(metrics.ctr),
      formatPercent(previousMetrics.ctr),
      signedPercentPoints(metrics.ctr - previousMetrics.ctr),
    ],
    [
      '平均排名',
      formatPosition(metrics.position),
      formatPosition(previousMetrics.position),
      // Position 0 means "no impressions in that window", not rank zero; a
      // numeric delta against it would read as a real ranking move.
      previousMetrics.position
        ? signedDecimal(metrics.position - previousMetrics.position)
        : '无可比区间',
    ],
  ];

  if (input.ga4) {
    const current = input.ga4.metrics;
    const previous = input.ga4.previousMetrics;
    rows.push(
      [
        '站内会话（GA4）',
        formatNumber(current.sessions),
        formatNumber(previous.sessions),
        `${changeLabel(current.sessions, previous.sessions)}（${signedNumber(current.sessions - previous.sessions)}）`,
      ],
      [
        '活跃用户（GA4）',
        formatNumber(current.users),
        formatNumber(previous.users),
        `${changeLabel(current.users, previous.users)}（${signedNumber(current.users - previous.users)}）`,
      ],
      [
        '浏览量（GA4）',
        formatNumber(current.pageviews),
        formatNumber(previous.pageviews),
        `${changeLabel(current.pageviews, previous.pageviews)}（${signedNumber(current.pageviews - previous.pageviews)}）`,
      ],
      [
        '互动率（GA4）',
        formatPercent(current.engagementRate),
        formatPercent(previous.engagementRate),
        signedPercentPoints(current.engagementRate - previous.engagementRate),
      ],
      [
        '关键事件（GA4）',
        formatNumber(current.keyEvents),
        formatNumber(previous.keyEvents),
        `${changeLabel(current.keyEvents, previous.keyEvents)}（${signedNumber(current.keyEvents - previous.keyEvents)}）`,
      ]
    );
  }

  if (input.bing) {
    const current = input.bing.metrics;
    const previous = input.bing.previousMetrics;
    rows.push([
      'Bing 点击',
      formatNumber(current.clicks),
      previous ? formatNumber(previous.clicks) : '—',
      previous
        ? `${changeLabel(current.clicks, previous.clicks)}（${signedNumber(current.clicks - previous.clicks)}）`
        : '无可比区间',
    ]);
  }

  if (input.umami) {
    const current = input.umami.metrics;
    const previous = input.umami.previousMetrics;
    rows.push(
      [
        '浏览量（Umami）',
        formatNumber(current.pageviews),
        formatNumber(previous.pageviews),
        `${changeLabel(current.pageviews, previous.pageviews)}（${signedNumber(current.pageviews - previous.pageviews)}）`,
      ],
      [
        '访客（Umami）',
        formatNumber(current.visitors),
        formatNumber(previous.visitors),
        `${changeLabel(current.visitors, previous.visitors)}（${signedNumber(current.visitors - previous.visitors)}）`,
      ]
    );
  }

  return section('1. 核心指标', table(['指标', '本期', '上期', '变化'], rows));
}

function gscSection(input: SiteExportInput): string {
  const trend = input.gsc.trend.length
    ? table(
        ['日期', '点击', '曝光', 'CTR', '平均排名'],
        input.gsc.trend.map((point) => [
          point.date,
          formatNumber(point.clicks),
          formatNumber(point.impressions),
          formatPercent(point.ctr),
          formatPosition(point.position),
        ])
      )
    : '（该区间没有逐日数据）';

  const queries = input.gsc.queries.length
    ? table(
        ['#', '查询', '点击', '曝光', 'CTR', '平均排名'],
        input.gsc.queries.map((row, index) => [
          String(index + 1),
          row.query,
          formatNumber(row.clicks),
          formatNumber(row.impressions),
          formatPercent(row.ctr),
          formatPosition(row.position),
        ])
      )
    : '（该区间没有关键词数据）';

  return section(
    '2. Google Search Console',
    [
      '### 2.1 每日趋势',
      '',
      trend,
      '',
      `### 2.2 热门查询（Top ${input.gsc.queries.length}）`,
      '',
      queries,
    ].join('\n')
  );
}

function ga4Section(input: SiteExportInput): string {
  if (!input.ga4) {
    return section(
      '3. Google Analytics 4',
      input.failedSources?.includes('ga4')
        ? 'GA4 数据本次读取失败（接口报错）。**不要据此判断站内转化，也不要把缺失当成零流量。**'
        : '该站点未关联 GA4 媒体资源，站内行为数据缺失。**不要据此判断站内转化，也不要把它当成零流量。**'
    );
  }

  const { metrics, previousMetrics, channels, pages, link } = input.ga4;
  const totalSessions = channels.reduce((sum, row) => sum + row.sessions, 0);

  const metricsTable = table(
    ['指标', '本期', '上期', '变化'],
    [
      [
        '会话',
        formatNumber(metrics.sessions),
        formatNumber(previousMetrics.sessions),
        changeLabel(metrics.sessions, previousMetrics.sessions),
      ],
      [
        '活跃用户',
        formatNumber(metrics.users),
        formatNumber(previousMetrics.users),
        changeLabel(metrics.users, previousMetrics.users),
      ],
      [
        '浏览量',
        formatNumber(metrics.pageviews),
        formatNumber(previousMetrics.pageviews),
        changeLabel(metrics.pageviews, previousMetrics.pageviews),
      ],
      [
        '互动率',
        formatPercent(metrics.engagementRate),
        formatPercent(previousMetrics.engagementRate),
        signedPercentPoints(
          metrics.engagementRate - previousMetrics.engagementRate
        ),
      ],
      [
        '平均会话时长（秒）',
        metrics.averageSessionDuration.toFixed(1),
        previousMetrics.averageSessionDuration.toFixed(1),
        signedDecimal(
          metrics.averageSessionDuration -
            previousMetrics.averageSessionDuration
        ),
      ],
      [
        '关键事件',
        formatNumber(metrics.keyEvents),
        formatNumber(previousMetrics.keyEvents),
        changeLabel(metrics.keyEvents, previousMetrics.keyEvents),
      ],
    ]
  );

  const channelsTable = channels.length
    ? table(
        ['渠道', '会话', '上期', '变化', '占比'],
        channels.map((row) => [
          row.channel,
          formatNumber(row.sessions),
          formatNumber(row.previousSessions),
          changeLabel(row.sessions, row.previousSessions),
          formatPercent(totalSessions ? row.sessions / totalSessions : 0),
        ])
      )
    : '（没有渠道数据）';

  const pagesTable = pages.length
    ? table(
        ['页面', '会话', '用户', '浏览量'],
        pages.map((row) => [
          row.pagePath,
          formatNumber(row.sessions),
          formatNumber(row.users),
          formatNumber(row.pageviews),
        ])
      )
    : '（没有页面数据）';

  return section(
    '3. Google Analytics 4',
    [
      `- 关联属性：**${link.displayName}**（propertyId \`${link.propertyId}\`）`,
      '',
      '### 3.1 核心指标',
      '',
      metricsTable,
      '',
      '### 3.2 渠道来源',
      '',
      channelsTable,
      '',
      '### 3.3 热门页面',
      '',
      pagesTable,
    ].join('\n')
  );
}

function bingSection(input: SiteExportInput): string {
  if (!input.bing) {
    return section(
      '4. Bing Webmaster',
      input.failedSources?.includes('bing')
        ? 'Bing 数据本次读取失败（接口报错或缓存不可用）。**缺失不代表 Bing 零流量。**'
        : '该站点未关联 Bing Webmaster 站点，或 Bing 缓存尚未同步。**缺失不代表 Bing 零流量。**'
    );
  }

  const { weeks, queries, pages, bingSiteUrl, truncated } = input.bing;

  const weeksTable = weeks.length
    ? table(
        ['周起始', '点击', '曝光', '平均排名'],
        weeks.map((row) => [
          row.weekStart,
          formatNumber(row.clicks),
          formatNumber(row.impressions),
          formatPosition(row.position),
        ])
      )
    : '（没有周桶数据）';

  const queriesTable = queries.length
    ? table(
        ['查询', '点击', '曝光', '平均排名'],
        queries.map((row) => [
          row.query,
          formatNumber(row.clicks),
          formatNumber(row.impressions),
          formatPosition(row.position),
        ])
      )
    : '（没有查询数据）';

  const pagesTable = pages.length
    ? table(
        ['页面', '点击', '曝光', '平均排名'],
        pages.map((row) => [
          row.page,
          formatNumber(row.clicks),
          formatNumber(row.impressions),
          formatPosition(row.position),
        ])
      )
    : '（没有页面数据）';

  return section(
    '4. Bing Webmaster',
    [
      `- 站点：\`${bingSiteUrl}\``,
      `- 行数上限：${truncated ? '已触达（长尾总计为近似值）' : '未触达'}`,
      '',
      '### 4.1 周趋势',
      '',
      weeksTable,
      '',
      '### 4.2 热门查询',
      '',
      queriesTable,
      '',
      '### 4.3 热门页面',
      '',
      pagesTable,
    ].join('\n')
  );
}

function umamiSection(input: SiteExportInput): string {
  if (!input.umami) {
    return section(
      '5. Umami',
      input.failedSources?.includes('umami')
        ? 'Umami 数据本次读取失败（接口报错或未配置密钥）。**缺失不代表零流量。**'
        : '该站点未关联 Umami 站点，或未配置 Umami 密钥。**缺失不代表零流量。**'
    );
  }

  const { metrics, previousMetrics, pages, referrers, events, websiteId } =
    input.umami;

  const metricsTable = table(
    ['指标', '本期', '上期', '变化'],
    [
      [
        '浏览量',
        formatNumber(metrics.pageviews),
        formatNumber(previousMetrics.pageviews),
        changeLabel(metrics.pageviews, previousMetrics.pageviews),
      ],
      [
        '访客',
        formatNumber(metrics.visitors),
        formatNumber(previousMetrics.visitors),
        changeLabel(metrics.visitors, previousMetrics.visitors),
      ],
      [
        '访问次数',
        formatNumber(metrics.visits),
        formatNumber(previousMetrics.visits),
        changeLabel(metrics.visits, previousMetrics.visits),
      ],
      [
        '跳出次数',
        formatNumber(metrics.bounces),
        formatNumber(previousMetrics.bounces),
        changeLabel(metrics.bounces, previousMetrics.bounces),
      ],
      [
        '停留总时长（秒）',
        formatNumber(metrics.totalTime),
        formatNumber(previousMetrics.totalTime),
        changeLabel(metrics.totalTime, previousMetrics.totalTime),
      ],
    ]
  );

  const pagesTable = pages.length
    ? table(
        ['页面', '浏览量'],
        pages.map((row) => [row.path, formatNumber(row.pageviews)])
      )
    : '（没有页面数据）';

  const referrersTable = referrers.length
    ? table(
        ['来源', '访客'],
        referrers.map((row) => [row.referrer, formatNumber(row.visitors)])
      )
    : '（没有来源数据）';

  const eventsTable = events.length
    ? table(
        ['事件', '次数'],
        events.map((row) => [row.name, formatNumber(row.count)])
      )
    : '（没有事件数据）';

  return section(
    '5. Umami',
    [
      `- websiteId：\`${websiteId}\``,
      '',
      '### 5.1 核心指标',
      '',
      metricsTable,
      '',
      '### 5.2 热门页面',
      '',
      pagesTable,
      '',
      '### 5.3 来源',
      '',
      referrersTable,
      '',
      '### 5.4 事件',
      '',
      eventsTable,
    ].join('\n')
  );
}

function caveats(): string {
  return section(
    '6. 口径与缺口（分析前必读）',
    [
      '- **GSC**：只统计 Google 自然搜索，不含广告、Bing 与社交。点击率 = 总点击 ÷ 总曝光；平均排名按曝光加权，**数值越小越好**。',
      '- **GA4**：覆盖站内全渠道流量，口径与 GSC 完全不同。**不要把 GA4 会话除以 GSC 点击**当作转化率——分子分母范围不一致，结论会失真。',
      '- **Bing**：按周聚合（每 7 天一格），最多约 6 周。因此它在 28 天、90 天窗口下都是近似值，长尾查询还可能被行数上限截断。',
      '- **Umami**：只提供站内浏览量、访客、访问次数等，不含搜索来源与关键词，不能替代 GSC。',
      '- 标注「未接入」的数据源表示该站未关联对应属性，标注「读取失败」表示本次请求出错；**两种情况都不能当作零流量**参与对比或计算。',
      '- 标注「✅ 无数据」表示已接入但该区间没有返回任何行：可能是该渠道确实没有曝光，也可能是站点尚未被收录。',
      '- 所有「变化」都是本期与紧邻的上一等长周期对比；上期为 0 时显示「新增」而不是无穷增长率。',
      '- 排名方向：数值上升代表排名变差。',
    ].join('\n')
  );
}

/** One self-describing Markdown file, sized for an analysis model to read. */
export function buildSiteReportMarkdown(input: SiteExportInput): string {
  const actual = actualRange(input);
  return [
    headerBlock(input, actual),
    coreMetrics(input),
    gscSection(input),
    ga4Section(input),
    bingSection(input),
    umamiSection(input),
    caveats(),
    '',
  ].join('\n\n');
}

const CSV_HEADER = [
  'source',
  'table',
  'item',
  'value',
  'previous',
  'delta',
  'clicks',
  'impressions',
  'ctr',
  'position',
  'sessions',
  'users',
  'pageviews',
  'visits',
  'count',
] as const;

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

/** Wide, one-row-per-entity CSV so a spreadsheet can pivot on `table`. */
export function buildSiteReportCsv(input: SiteExportInput): string {
  const rows: string[] = [CSV_HEADER.join(',')];
  const { metrics, previousMetrics } = input.gsc;

  const summary: Array<[string, number, number]> = [
    ['clicks', metrics.clicks, previousMetrics.clicks],
    ['impressions', metrics.impressions, previousMetrics.impressions],
    ['ctr', metrics.ctr, previousMetrics.ctr],
    ['position', metrics.position, previousMetrics.position],
  ];
  for (const [item, current, previous] of summary) {
    rows.push(
      csvRow(['gsc', 'summary', item, current, previous, current - previous])
    );
  }

  for (const row of input.gsc.queries) {
    rows.push(
      csvRow([
        'gsc',
        'query',
        row.query,
        null,
        null,
        null,
        row.clicks,
        row.impressions,
        row.ctr,
        row.position,
      ])
    );
  }

  for (const point of input.gsc.trend) {
    rows.push(
      csvRow([
        'gsc',
        'trend',
        point.date,
        null,
        null,
        null,
        point.clicks,
        point.impressions,
        point.ctr,
        point.position,
      ])
    );
  }

  if (input.ga4) {
    const ga4 = input.ga4;
    const ga4Summary: Array<[string, number, number]> = [
      ['sessions', ga4.metrics.sessions, ga4.previousMetrics.sessions],
      ['users', ga4.metrics.users, ga4.previousMetrics.users],
      ['pageviews', ga4.metrics.pageviews, ga4.previousMetrics.pageviews],
      [
        'engagementRate',
        ga4.metrics.engagementRate,
        ga4.previousMetrics.engagementRate,
      ],
      [
        'averageSessionDuration',
        ga4.metrics.averageSessionDuration,
        ga4.previousMetrics.averageSessionDuration,
      ],
      ['keyEvents', ga4.metrics.keyEvents, ga4.previousMetrics.keyEvents],
    ];
    for (const [item, current, previous] of ga4Summary) {
      rows.push(
        csvRow(['ga4', 'summary', item, current, previous, current - previous])
      );
    }
    for (const row of ga4.channels) {
      rows.push(
        csvRow([
          'ga4',
          'channel',
          row.channel,
          null,
          row.previousSessions,
          row.sessions - row.previousSessions,
          null,
          null,
          null,
          null,
          row.sessions,
        ])
      );
    }
    for (const row of ga4.pages) {
      rows.push(
        csvRow([
          'ga4',
          'page',
          row.pagePath,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          row.sessions,
          row.users,
          row.pageviews,
        ])
      );
    }
  }

  if (input.bing) {
    for (const row of input.bing.weeks) {
      rows.push(
        csvRow([
          'bing',
          'week',
          row.weekStart,
          null,
          null,
          null,
          row.clicks,
          row.impressions,
          null,
          row.position,
        ])
      );
    }
    for (const row of input.bing.queries) {
      rows.push(
        csvRow([
          'bing',
          'query',
          row.query,
          null,
          null,
          null,
          row.clicks,
          row.impressions,
          null,
          row.position,
        ])
      );
    }
    for (const row of input.bing.pages) {
      rows.push(
        csvRow([
          'bing',
          'page',
          row.page,
          null,
          null,
          null,
          row.clicks,
          row.impressions,
          null,
          row.position,
        ])
      );
    }
  }

  if (input.umami) {
    const umami = input.umami;
    const umamiSummary: Array<[string, number, number]> = [
      ['pageviews', umami.metrics.pageviews, umami.previousMetrics.pageviews],
      ['visitors', umami.metrics.visitors, umami.previousMetrics.visitors],
      ['visits', umami.metrics.visits, umami.previousMetrics.visits],
      ['bounces', umami.metrics.bounces, umami.previousMetrics.bounces],
      ['totalTime', umami.metrics.totalTime, umami.previousMetrics.totalTime],
    ];
    for (const [item, current, previous] of umamiSummary) {
      rows.push(
        csvRow([
          'umami',
          'summary',
          item,
          current,
          previous,
          current - previous,
        ])
      );
    }
    for (const row of umami.pages) {
      rows.push(
        csvRow([
          'umami',
          'page',
          row.path,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          row.pageviews,
        ])
      );
    }
    for (const row of umami.referrers) {
      rows.push(
        csvRow([
          'umami',
          'referrer',
          row.referrer,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          row.visitors,
        ])
      );
    }
    for (const row of umami.events) {
      rows.push(
        csvRow([
          'umami',
          'event',
          row.name,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          row.count,
        ])
      );
    }
  }

  return rows.join('\n');
}
