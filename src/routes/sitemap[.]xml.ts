import { createFileRoute } from '@tanstack/react-router';
import { siteOrigin } from '@/lib/seo';

/**
 * Only /privacy is indexable: the dashboard itself is private and serves a
 * noindex shell, so listing it here would submit a noindex URL to Google.
 */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = siteOrigin(new URL(request.url).origin);
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/privacy</loc></url>
</urlset>`;
        return new Response(xml, {
          headers: { 'content-type': 'application/xml; charset=utf-8' },
        });
      },
    },
  },
});
