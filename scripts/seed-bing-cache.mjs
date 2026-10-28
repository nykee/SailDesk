// Seeds the Bing Webmaster KV cache from a clean IP.
//
// Bing throttles Cloudflare Workers' shared egress IP (ErrorCode 17), so the
// dashboard worker never calls Bing directly — it reads from this KV cache. Run
// this script from a machine with an un-throttled IP (local dev box or the AI
// sandbox, both of which reach Bing fine) to (re)populate the cache.
//
// Usage: node scripts/seed-bing-cache.mjs [outfile.json]
//   outfile defaults to /tmp/bing-seed.json; pass a second intent to also push:
//   node scripts/seed-bing-cache.mjs --push   (runs `wrangler kv bulk put`)

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BING_API_URL = 'https://ssl.bing.com/webmaster/api.svc/json';
const TTL = 60 * 60 * 24 * 7; // 7 days, matches Bing's weekly cadence

// cache key shape must stay in sync with src/server/bing.server.ts cacheKey()
function cacheKey(endpoint, siteUrl) {
  if (endpoint === 'GetUserSites') return 'bing:sites';
  const enc = encodeURIComponent(siteUrl ?? '');
  return endpoint === 'GetQueryStats' ? `bing:qs:${enc}` : `bing:ps:${enc}`;
}

function loadKey() {
  const raw = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0 && line.slice(0, idx).trim() === 'BING_API_KEY') {
      return line.slice(idx + 1).trim();
    }
  }
  throw new Error('BING_API_KEY not found in .dev.vars');
}

async function bingFetch(endpoint, siteUrl) {
  const url = new URL(`${BING_API_URL}/${endpoint}`);
  url.searchParams.set('apikey', KEY);
  if (siteUrl) url.searchParams.set('siteUrl', siteUrl);
  const res = await fetch(url.toString(), {
    headers: { 'user-agent': 'saildesk-seed/1.0' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${endpoint} -> HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
  return res.json();
}

const KEY = loadKey();
const push = process.argv.includes('--push');
const outFile =
  process.argv.find((a) => a.endsWith('.json')) ?? '/tmp/bing-seed.json';

const entries = [];

console.log('Fetching GetUserSites…');
const sites = await bingFetch('GetUserSites');
entries.push({
  key: cacheKey('GetUserSites'),
  value: JSON.stringify(sites),
  expiration_ttl: TTL,
});
const verified = (sites.d ?? []).filter((s) => s.IsVerified);
console.log(`  ${verified.length} verified sites`);

for (const site of verified) {
  const url = site.Url;
  process.stdout.write(`  ${url} … `);
  try {
    const qs = await bingFetch('GetQueryStats', url);
    entries.push({
      key: cacheKey('GetQueryStats', url),
      value: JSON.stringify(qs),
      expiration_ttl: TTL,
    });
    const ps = await bingFetch('GetPageStats', url);
    entries.push({
      key: cacheKey('GetPageStats', url),
      value: JSON.stringify(ps),
      expiration_ttl: TTL,
    });
    console.log(
      `ok (${qs.d?.length ?? 0} queries, ${ps.d?.length ?? 0} pages)`
    );
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 150));
}

writeFileSync(outFile, JSON.stringify(entries, null, 2));
console.log(`\nWrote ${entries.length} cache entries to ${outFile}`);

if (push) {
  console.log('Pushing to Cloudflare KV (BING_CACHE)…');
  // Use the project-local wrangler so the job works without a global pnpm/wrangler.
  const wrangler = fileURLToPath(
    new URL('../node_modules/.bin/wrangler', import.meta.url)
  );
  execFileSync(
    wrangler,
    ['kv', 'bulk', 'put', '--binding', 'BING_CACHE', '--remote', outFile],
    { stdio: 'inherit', cwd: fileURLToPath(new URL('..', import.meta.url)) }
  );
  console.log('Done.');
} else {
  console.log('Run with --push to upload to Cloudflare KV, e.g.:');
  console.log(`  node scripts/seed-bing-cache.mjs --push`);
}
