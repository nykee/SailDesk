import { propertyWebsite } from '@/features/gsc/property';
import type { SearchProperty } from '@/features/gsc/types';

/** A GA4 property as listed by the Admin API accountSummaries endpoint. */
export type Ga4PropertySummary = {
  propertyId: string;
  displayName: string;
};

/**
 * GSC scopes map to hostnames differently: a domain property covers every
 * subdomain, a URL-prefix property covers exactly one host. Path prefixes are
 * ignored for GA4 matching because the Data API only reports hostnames.
 */
export function gscHostnameRule(siteUrl: string): {
  domain: string | null;
  hostname: string;
} {
  if (siteUrl.startsWith('sc-domain:'))
    return {
      domain: siteUrl.slice(10).toLowerCase(),
      hostname: siteUrl.slice(10).toLowerCase(),
    };
  const url = new URL(propertyWebsite(siteUrl));
  const hostname = url.hostname.toLowerCase();
  return { domain: null, hostname };
}

/** Hostname containment: exact host, or any host under a domain property. */
export function hostnameMatches(
  rule: ReturnType<typeof gscHostnameRule>,
  hostname: string
): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (rule.domain)
    return host === rule.domain || host.endsWith(`.${rule.domain}`);
  return host === rule.hostname;
}

/**
 * Display names are normalized by stripping case, spaces and dots, so a GA4
 * property named after its domain ("example.com", "Example.com") links
 * automatically. Partial matches are refused on purpose: "example" must never
 * silently match "example-shop.com" or "example.studio".
 */
export function displayNameMatchesDomain(
  displayName: string,
  siteUrl: string
): boolean {
  const rule = gscHostnameRule(siteUrl);
  return normalizeName(displayName) === normalizeName(rule.hostname);
}

export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s.]+/g, '');
}

/**
 * Greedy 1:1 assignment between GSC resources and GA4 properties. A GA4
 * property can only be claimed once, so an aggregated property cannot inject
 * the same traffic into two site rows; later sites stay explicitly unmatched.
 */
export function assignGa4Properties(
  sites: SearchProperty[],
  summaries: Ga4PropertySummary[],
  hostsByProperty: Map<string, string[]>
): Map<string, Ga4PropertySummary> {
  const assignments = new Map<string, Ga4PropertySummary>();
  const taken = new Set<string>();
  for (const site of [...sites].sort((a, b) =>
    a.siteUrl.localeCompare(b.siteUrl)
  )) {
    const matched =
      summaries.find(
        (summary) =>
          !taken.has(summary.propertyId) &&
          displayNameMatchesDomain(summary.displayName, site.siteUrl)
      ) ??
      summaries.find(
        (summary) =>
          !taken.has(summary.propertyId) &&
          (hostsByProperty.get(summary.propertyId) ?? []).some((hostname) =>
            hostnameMatches(gscHostnameRule(site.siteUrl), hostname)
          )
      );
    if (matched) {
      assignments.set(site.siteUrl, matched);
      taken.add(matched.propertyId);
    }
  }
  return assignments;
}
