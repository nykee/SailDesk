import type { SearchProperty } from './types';

/** Preserve URL-prefix paths so distinct GSC resources remain distinguishable. */
export function propertyName(siteUrl: string): string {
  if (siteUrl.startsWith('sc-domain:')) return siteUrl.slice(10);
  const url = new URL(siteUrl);
  return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
}

/** Domain-property identifiers are not navigable URLs. */
export function propertyWebsite(siteUrl: string): string {
  return siteUrl.startsWith('sc-domain:')
    ? `https://${siteUrl.slice(10)}`
    : siteUrl;
}

/**
 * GSC domain scopes contain all protocols and subdomains; URL-prefix scopes
 * contain only that exact prefix. This is scope containment, not hostname
 * guessing or public-suffix-based deduplication.
 */
export function propertyContains(parent: string, child: string): boolean {
  if (parent === child) return true;
  if (!parent.startsWith('sc-domain:'))
    return !child.startsWith('sc-domain:') && child.startsWith(parent);
  const domain = parent.slice(10).toLowerCase();
  const hostname = child.startsWith('sc-domain:')
    ? child.slice(10).toLowerCase()
    : new URL(child).hostname.toLowerCase();
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Keep maximal non-overlapping scopes, so portfolio totals never double count. */
export function overviewProperties(properties: SearchProperty[]): {
  included: SearchProperty[];
  excluded: SearchProperty[];
} {
  const included: SearchProperty[] = [];
  const excluded: SearchProperty[] = [];
  for (const property of properties) {
    const covered = properties.some(
      (other) =>
        other.siteUrl !== property.siteUrl &&
        propertyContains(other.siteUrl, property.siteUrl)
    );
    (covered ? excluded : included).push(property);
  }
  return { included, excluded };
}

/** Shared permission copy is used in the sidebar, table and detail header. */
export const permissionLabels: Record<string, string> = {
  siteOwner: '所有者',
  siteFullUser: '完全用户',
  siteRestrictedUser: '受限用户',
  siteUnverifiedUser: '未验证',
};
