# SailDesk agent guide

## Purpose

SailDesk is a single-operator analytics desk for SaaS sites going global. It
reads one Google account's Search Console properties, pairs each with its GA4
property, and optionally its Bing Webmaster site.

It is deliberately **not** a multi-tenant product. Do not add user accounts,
sign-up, billing, teams, roles, a database, or a general-purpose cache layer.
The only intended persistence is one KV namespace holding the Bing response
cache, because Bing blocks Cloudflare's shared egress IPs.

## Source of truth

- Site identity, repository URL, theme tokens: `src/config/website.ts`
- UI copy: `project.inlang/messages/{en,zh}.json`
- Styles: `src/styles.css`
- Routes and API surface: `src/routes/`
- Worker configuration and KV binding: `wrangler.jsonc`
- Secrets contract: `.dev.vars.example` and `src/env.d.ts`

Generated files — `src/locale/paraglide/`, `src/routeTree.gen.ts`,
`worker-configuration.d.ts` — must be regenerated, never edited by hand.

## Commands

```bash
pnpm dev            # vite dev on 127.0.0.1:3200
pnpm check          # biome + locale keys + vitest + tsc
pnpm build          # vite build, then tsc --noEmit
pnpm e2e            # Playwright, desktop and mobile
pnpm run deploy     # build, then wrangler deploy
pnpm gsc:authorize  # one-off Google OAuth flow, prints a refresh token
```

Run `pnpm locale:compile` after changing message files, and `pnpm cf-typegen`
after changing `wrangler.jsonc`. `pnpm install` already runs both via
postinstall.

## Hard constraints

- **50 subrequests per request** on the Workers free plan. The GSC overview
  fans out across properties and must stay under it. GA4 and Bing have their
  own endpoints for exactly this reason — do not merge them into one request.
- **Bing is never called from the Worker.** Bing rate-limits by egress IP and
  answers `{"ErrorCode":17,"Message":"ERROR!!! ThrottleIP"}` for Cloudflare's
  shared IPs. The Worker reads KV; `scripts/seed-bing-cache.mjs` fills it from
  a clean network.
- **Never render a partial portfolio as a complete one.** A property that fails
  to load stays an error row. If any property failed, do not show a total.
- **Never treat a missing source as zero.** Missing GA4 links and a cold Bing
  cache are reported as such, not folded into sums.

## Conventions

- Keep pure logic in `src/features/` and I/O in `src/server/`; the unit tests
  only cover the pure layer.
- Vitest has no globals — import `describe`, `expect`, `it` from `vitest`.
- Biome enforces `noNonNullAssertion` (no `!`, including in tests),
  `useOptionalChain`, and `useAriaPropsSupportedByRole` (a container with
  `aria-label` must be `<section>`, not `<div>`).
- `DateRange` lives in `src/features/gsc/date-range.ts` and has no label field.
- Never commit `.dev.vars`, refresh tokens, API keys, custom domains, or
  Cloudflare account IDs. `.dev.vars*` and `.env*` are gitignored — keep it that
  way.
