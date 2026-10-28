# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript, React 19, TanStack Start and Router, Vite, Tailwind CSS v4,
Paraglide, Cloudflare Workers, and a single Cloudflare KV namespace used as the
Bing response cache.

## Users

Indie builders and small teams running a portfolio of SaaS sites for a global
audience. They already own the Google account that holds every Search Console
property and GA4 resource, they check performance most days, and they do not
want another hosted analytics subscription holding their search data.

## Product Purpose

SailDesk puts Google Search Console, GA4 and Bing Webmaster in one
password-protected view, then does the part a raw dashboard does not: it joins
the three sources per site and turns the differences into a short list of things
worth fixing.

Success means an operator opens one page, sees the whole portfolio's search and
traffic movement in the selected window, and leaves with a concrete next action
instead of three tabs and a spreadsheet.

## Positioning

A self-hosted, single-operator desk — not a SaaS product and not a multi-tenant
platform. It runs on Cloudflare Workers with no database, no background jobs and
no per-seat pricing, because the only user is the person who deployed it.

Its differentiator is the cross-source join: GSC says what search showed, GA4
says what happened on site, Bing says what the other index sees. Read separately
they are three reports; read together they explain each other.

## Capabilities and Constraints

- Routes: `/` and `/zh` render the dashboard, `/privacy` is the public policy
  page required by Google's OAuth review.
- Date windows: last 7 / 28 / 90 days or a custom range, always compared with
  the immediately preceding equal-length window.
- Overview filters: growth, decline, diverging, flat, no impressions, failed.
- Sources load independently. GA4 and Bing failing never blocks GSC.
- A property that fails stays an error row; a portfolio with any failure does
  not render an aggregate.
- Bing is read from KV, never called live from the Worker, because Bing
  throttles Cloudflare's shared egress IPs.
- No user accounts, no sign-up, no billing, no teams, no database.

## Brand Commitments

- Name: SailDesk.
- Voice: direct and practical. State the number, then the consequence. No
  inflated claims and no invented benchmarks.
- Visual identity: a dark operations desk with a single lime accent — see
  `DESIGN.md`.

## Evidence on Hand

There are no customer testimonials, usage statistics, or performance claims.
Any screenshot or figure shown publicly must come from a real deployment.

## Product Principles

1. Show the real number or say why it is missing. Never substitute zero.
2. A partial portfolio is not a portfolio. Withhold the total instead.
3. Every panel must answer "so what should I do" — otherwise it is decoration.
4. Keep the deployment surface small: one Worker, one KV namespace, secrets only.
5. Prefer a legible codebase over abstraction; the pure layer stays pure and
   testable.

## Accessibility & Inclusion

Target WCAG 2.1 AA contrast, semantic landmarks, keyboard-complete controls,
visible focus states, reduced-motion support, and readable layouts from narrow
mobile screens through large desktop displays. Deltas carry a sign and an arrow
so meaning never depends on colour alone.
