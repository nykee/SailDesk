/**
 * Secret names are declared here instead of committing secret values. Configure
 * them with `wrangler secret put` before deployment; this file only gives the
 * Cloudflare binding a correct TypeScript contract.
 */
declare namespace Cloudflare {
  interface Env {
    GOOGLE_OAUTH_CLIENT_ID: string;
    GOOGLE_OAUTH_CLIENT_SECRET: string;
    GSC_REFRESH_TOKEN: string;
    DASHBOARD_PASSWORD: string;
    DASHBOARD_SESSION_SECRET: string;
    BING_API_KEY: string;
    BING_CACHE: KVNamespace;
  }
}
