# Broker Portal

Weekly supplier report portal. An analyst uploads three Excel exports from ABI Studio each
week; the app parses them, computes business metrics, generates a one-page visual report,
and publishes it to a password-protected portal for the broker's supplier clients. Full spec:
`claude_code_prompt_broker_portal.md`. Durable project rules: `CLAUDE.md`. Product/implementation
decisions: `DECISIONS.md`.

## Stack

- Frontend: Vite + React (single-page app), Recharts for charts.
- Backend: a single **Cloudflare Worker with static assets** (`worker/index.js` dispatches to
  `worker/routes/*.js` by pathname; static files served from `dist/` via the `assets` binding).
  Not Cloudflare Pages — Pages Functions (file-based routing) was tried first and replaced the
  same day to fit a dual-hosting/failover architecture (Cloudflare primary, Netlify static-only
  backup via a Cloudflare Load Balancer) — see `DECISIONS.md`.
- Storage: Cloudflare KV (`env.REPORTS_KV` binding) — one JSON document per report week, plus an
  index document.
- Excel parsing: SheetJS (`xlsx`), server-side.
- Email: Resend API.
- Narrative: Anthropic API (`claude-sonnet-4-6`), with a deterministic template fallback.

Migrated from Netlify Functions + Netlify Blobs on 2026-08-21 after the Netlify account was
suspended — see `DECISIONS.md` for the full incident/migration writeup, including the later
Pages→Worker pivot.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | Yes | Password that logs in with the admin role. |
| `CLIENT_PASSWORD` | Yes | Password that logs in with the read-only client role. |
| `SESSION_SECRET` | Yes | HMAC key used to sign the session cookie. Use a long random string. |
| `RESEND_API_KEY` | No | Enables the "Send report" email feature. Without it, the send button shows "email not configured". |
| `EMAIL_FROM_ADDRESS` | Only if `RESEND_API_KEY` is set | From-address used for sent report emails. |
| `CLIENT_EMAIL_RECIPIENTS` | Only if `RESEND_API_KEY` is set | Comma-separated pre-defined recipient list. The admin can only pick from this list in the UI — no free-text recipient entry, ever. |
| `ANTHROPIC_API_KEY` | No | Enables Claude-generated executive summaries. Without it, a deterministic template narrative is used. The app is fully functional with this unset. |

Copy `.env.example` to `.dev.vars` (Wrangler's convention for local-only env vars — distinct from
`.env`, which only Vite reads, for frontend build-time vars, of which this project has none) for
local development with `wrangler dev`.

## Local development

```
npm install
npm run dev          # Vite only, frontend at http://localhost:5173 (Worker routes not available)
npm run worker:dev    # Full stack via Wrangler: builds the frontend, then runs the Worker locally
                      # (serves both dist/ and /api/* — check wrangler's printed URL/port)
npm test              # Vitest — parser and metrics unit tests against /fixtures
npm run build          # Production build
```

`npm run worker:dev` uses `wrangler.jsonc`'s `kv_namespaces` binding — Wrangler automatically
emulates KV locally once a real namespace id is filled in (see Deployment below for one-time
namespace creation; a placeholder id still lets local dev run against a local-only emulated
namespace).

`/fixtures` holds real supplier POS data used for parser/metrics tests. It is git-ignored and
must never be committed — see `CLAUDE.md`.

## Deployment

This project deploys as its own **Cloudflare Worker** (`shiftretailgroup-broker-portal` —
see `wrangler.jsonc`), under the `kipodai` Cloudflare account — not a personal account (see
`CLAUDE.md` repo/infra ownership rule, which applies to Cloudflare the same way it did to the
prior Netlify account).

**This app's Worker is separate from the `kipodai.com` marketing site's Worker** (a different
repo). Cloudflare Worker names are unique per account — this app was briefly misconfigured with
the marketing site's own Worker name (`kipodai-site`) before being caught and renamed; double
-check `wrangler.jsonc`'s `name` field doesn't collide with anything else in the account before
deploying. Per the multi-tenant architecture direction, each broker-portal client gets its own
Worker deploy (own KV namespace, own name, own subdomain, own passwords) — this repo is the
shared template, not a single shared deploy.

**DNS/Load Balancer setup for this app's hostname (`shiftretailgroup.kipodai.com`) is a
dual-hosting failover setup (Cloudflare primary, Netlify static-only backup) — see
`DECISIONS.md`.** That DNS/LB config is out of scope for the steps below; coordinate before
touching it.

1. Create the Cloudflare account/team if it doesn't already exist (free tier is fine to start).
2. Push this repo to a **private** GitHub repository under the `kipodai` account (see the data
   handling note below before your first push).
3. `wrangler login` (opens a browser to authenticate), then create the KV namespace for this
   client's data: `wrangler kv namespace create REPORTS_KV`. Copy the returned namespace `id` into
   `wrangler.jsonc`'s `kv_namespaces` entry, replacing the `REPLACE_WITH_REAL_KV_NAMESPACE_ID`
   placeholder.
4. Set the required secrets: `wrangler secret put ADMIN_PASSWORD` (repeat for `CLIENT_PASSWORD`,
   `SESSION_SECRET`, and optionally `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `EMAIL_FROM_ADDRESS`,
   `CLIENT_EMAIL_RECIPIENTS` — see the table above). `wrangler secret put` prompts for the value
   rather than taking it as a CLI argument, so it never ends up in shell history. Generate
   `SESSION_SECRET` as a long random string, e.g. `openssl rand -base64 32`.
5. `npm run build` (produces `dist/`), then `wrangler deploy` to publish the Worker.
6. Confirm the deploy's printed `*.workers.dev` URL responds, then hand that hostname to whoever
   is setting up the Load Balancer (see the DNS/LB note above) as the primary pool's origin — do
   **not** add a Worker custom-domain binding for this client's hostname yourself if a Load
   Balancer owns that DNS record instead (the two can't coexist on the same hostname).
7. Once the client's hostname is live (via the Load Balancer, or a direct custom-domain binding
   for a client that doesn't need failover), log in as admin and run through the Weekly Runbook
   once with real fixtures to confirm the full path end-to-end in production before handing the
   client URL to suppliers.

### Data handling before the first push

`/fixtures` contains real supplier POS data and is git-ignored (`.gitignore`) — verify
`git status` does **not** show it before any commit or push. This repo must stay private for as
long as real fixture data has ever been part of its history; if fixtures are ever accidentally
committed, treat it as a credential leak (rewrite history, rotate nothing-sensitive-here but still
scrub) rather than just deleting the file in a new commit.

## Future upgrades (not in current scope)

- Per-user accounts / OAuth instead of two shared passwords.
- Multi-tenant architecture (multiple broker clients, multiple dashboards): current direction is
  one Cloudflare Pages deploy per client from this shared template repo (own KV namespace, own
  subdomain, own passwords) rather than one shared multi-tenant deploy — see `DECISIONS.md` for
  the reasoning (mainly: cross-tenant data-leak risk from a tenant-scoping bug, given real
  supplier POS data is involved).
- See `CLAUDE.md` → "Roadmap — auto-mode config revisit triggers" for when to revisit the
  Claude Code auto-mode permission setup itself (not an app feature, but relevant to this repo's
  automation).

### Feature backlog (requested, not yet built)

- ~~**Item-level slicer.**~~ Done (2026-08-21) — the real export (`Mamma Chia Sales_Performance_*.xlsx`)
  turned out to carry **LWk, L4Wk, L13Wk, L26Wk, L52Wk, YTD** period rollups per item (30 items:
  Prime Item Nbr, Prime Item Desc, UPC), not the L25 originally guessed. Built as:
  - `server/parser.js` → `parseItemPerformance()`: two-row compound header (metric name ×
    period), forward-fills SheetJS's merged-cell blanks to recover the metric name per column,
    maps by header name so column reordering doesn't break it, discovers periods dynamically
    (no hardcoded list — the YTD period wasn't in the original scoping and this still picked it
    up), excludes the `Grand Total (...)` row case-insensitively (same helper now shared with
    Geo_Performance).
  - `parseUploadedFiles()` now accepts 3 or 4 files — the item file is optional, so old 3-file
    uploads are unaffected; `metrics.itemPerformance` is `null` when it's not included that week.
  - `src/components/ItemPerformancePanel.jsx`: period selector + search + checkbox multi-select
    (defaults to top 5 items by POS $), comparison table with a curated 6-metric subset (mirrors
    the brand KPI cards) plus a pinned Brand Total row.
  - `/admin/settings`-style admin-only editing wasn't needed here — no new admin route; the panel
    renders on the existing report view for both roles.
  Verified: 21 parser tests (real fixture + synthetic edge cases: reordering, missing column,
  case-insensitive Grand Total) plus a full 4-file-upload-through-real-functions
  end-to-end check. See `DECISIONS.md` for what didn't get verified (browser visual check) and why.
- ~~**Show/hide password toggle on the login page.**~~ Done — `src/pages/Login.jsx`.
- ~~**Shift Retail Group logo.**~~ Done — `logos/Shift Retail Group - Black.jpg`, shown in the
  report footer's "Prepared by Shift Retail Group" line (`src/components/ReportView.jsx`).
- **Interactive US map for geography.** Replace/augment the current horizontal-bar top-5-states
  chart with a hoverable US map showing U/S/W and In-Stock % per state on hover; states with no
  sales data greyed out. Recharts doesn't do choropleth maps — this needs a mapping library (e.g.
  `react-simple-maps`) plus a US states TopoJSON/GeoJSON, both new dependencies.
- ~~**Admin-editable email recipient list.**~~ Done — `/admin/settings` page
  (`src/pages/AdminSettings.jsx`), backed by `functions/api/recipients.js` (GET/PUT,
  admin-only) and `server/recipients.js` (shared resolution logic: KV-stored list once an
  admin has ever saved one, else falls back to seeding from `CLIENT_EMAIL_RECIPIENTS`).
  `email-config.js` and `send-email.js` both call the same `getEffectiveRecipients()` so they can
  never drift apart — the Send dialog still only ever offers checkboxes, never free text.

## Status

Build in progress through the BUILD LOOP in `claude_code_prompt_broker_portal.md`. See
`DECISIONS.md` for implementation choices made along the way.
