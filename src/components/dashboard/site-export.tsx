import { IconDownload, IconFileText, IconTable } from '@tabler/icons-react';
import type { BingSiteReport } from '@/features/bing/types';
import {
  buildSiteReportCsv,
  buildSiteReportMarkdown,
  type ExportSource,
  type SiteExportInput,
  siteExportFileName,
} from '@/features/export/site-report';
import type { Ga4SiteReport } from '@/features/ga4/types';
import type { SearchReport } from '@/features/gsc/types';
import type { UmamiSiteReport } from '@/features/umami/types';

const sourceLabels: Record<ExportSource, string> = {
  ga4: 'GA4',
  bing: 'Bing',
  umami: 'Umami',
};

/** A blob download keeps the export fully client-side; nothing is re-fetched. */
function saveFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function SiteExportBar({
  siteUrl,
  gsc,
  ga4,
  bing,
  umami,
  failedSources = [],
  pendingSources = [],
}: {
  siteUrl: string;
  gsc: SearchReport;
  ga4?: Ga4SiteReport;
  bing?: BingSiteReport;
  umami?: UmamiSiteReport;
  failedSources?: ExportSource[];
  pendingSources?: ExportSource[];
}) {
  // Exporting mid-load would write "未接入" for a source that is merely slow,
  // and the analysis model downstream cannot tell the difference afterwards.
  const pending = pendingSources.length > 0;
  const pendingLabel = pendingSources
    .map((source) => sourceLabels[source])
    .join('、');

  function buildInput(): SiteExportInput {
    return {
      siteUrl,
      gsc,
      ga4,
      bing,
      umami,
      failedSources,
      generatedAt: new Date(),
    };
  }

  function exportMarkdown() {
    const input = buildInput();
    saveFile(
      siteExportFileName(input, 'md'),
      buildSiteReportMarkdown(input),
      'text/markdown;charset=utf-8'
    );
  }

  function exportCsv() {
    const input = buildInput();
    // The BOM keeps Chinese headers readable when Excel opens the file directly.
    saveFile(
      siteExportFileName(input, 'csv'),
      `\uFEFF${buildSiteReportCsv(input)}`,
      'text/csv;charset=utf-8'
    );
  }

  return (
    <section className="export-bar" aria-label="导出站点报告">
      <div className="export-copy">
        <IconDownload size={17} />
        <div>
          <strong>导出这份报告</strong>
          <span>
            {pending
              ? `正在加载 ${pendingLabel}，加载完成后才能导出完整报告。`
              : 'Markdown 适合直接交给分析模型；CSV 适合在表格里自己透视。'}
          </span>
        </div>
      </div>
      <div className="export-actions">
        <button type="button" onClick={exportMarkdown} disabled={pending}>
          <IconFileText size={15} />
          Markdown
        </button>
        <button type="button" onClick={exportCsv} disabled={pending}>
          <IconTable size={15} />
          CSV
        </button>
      </div>
    </section>
  );
}
