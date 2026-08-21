# Broker Portal

Weekly supplier report portal. An analyst uploads three Excel exports from ABI Studio each
week; the app parses them, computes business metrics, generates a one-page visual report,
and publishes it to a password-protected portal for the broker's supplier clients. Full spec:
`claude_code_prompt_broker_portal.md`. Durable project rules: `CLAUDE.md`. Product/implementation
decisions: `DECISIONS.md`.

## Stack

- Frontend: Vite + React (single-page app), Recharts for charts.
- Backend: Netlify Functions (serverless).
- Storage: Netlify Blobs — one JSON document per report week, plus an index document.
- Excel parsing: SheetJS (`xlsx`), server-side.
- Email: Resend API.
- Narrative: Anthropic API (`claude-sonnet-4-6`), with a deterministic template fallback.

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

Copy `.env.example` to `.env` for local development with `netlify dev`.

## Local development

```
npm install
npm run dev          # Vite only, frontend at http://localhost:5173 (functions not available)
npm run netlify:dev   # Full stack via Netlify CLI at http://localhost:8888 (frontend + functions + blobs)
npm test              # Vitest — parser and metrics unit tests against /fixtures
npm run build          # Production build
```

`/fixtures` holds real supplier POS data used for parser/metrics tests. It is git-ignored and
must never be committed — see `CLAUDE.md`.

## Deployment

This project must be deployed under a **new Netlify account created for this business**
(`kipodai`), not a personal or unrelated business account — see `CLAUDE.md` repo/infra ownership
rule.

1. Create the Netlify account/team if it doesn't already exist.
2. Push this repo to a **private** GitHub repository under the `kipodai` account (see the data
   handling note below before your first push).
3. In Netlify: **Add new site → Import an existing project**, connect the GitHub repo. Netlify
   will read `netlify.toml` automatically (build command `npm run build`, publish `dist`,
   functions in `netlify/functions`).
4. Under **Site configuration → Environment variables**, set every variable from the table above
   that applies (`ADMIN_PASSWORD`, `CLIENT_PASSWORD`, `SESSION_SECRET` are required; the rest are
   optional but must be set together — see the table). Generate `SESSION_SECRET` as a long random
   string, e.g. `openssl rand -base64 32`.
5. Enable **Netlify Blobs** for the site (on by default for sites created after Blobs GA; no
   extra setup needed beyond deploying — the first upload creates the store).
6. Trigger a deploy. Confirm `npm run build` succeeds in the Netlify build log.
7. Log in as admin, run through the Weekly Runbook once with real fixtures to confirm the full
   path end-to-end in production before handing the client URL to suppliers.

### Data handling before the first push

`/fixtures` contains real supplier POS data and is git-ignored (`.gitignore`) — verify
`git status` does **not** show it before any commit or push. This repo must stay private for as
long as real fixture data has ever been part of its history; if fixtures are ever accidentally
committed, treat it as a credential leak (rewrite history, rotate nothing-sensitive-here but still
scrub) rather than just deleting the file in a new commit.

## Future upgrades (not in current scope)

- Per-user accounts / OAuth instead of two shared passwords.
- See `CLAUDE.md` → "Roadmap — auto-mode config revisit triggers" for when to revisit the
  Claude Code auto-mode permission setup itself (not an app feature, but relevant to this repo's
  automation). Note: two of its three triggers have already fired (Netlify deploy target added,
  git remote connected) — worth a look next session.

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
  (`src/pages/AdminSettings.jsx`), backed by `netlify/functions/recipients.js` (GET/PUT,
  admin-only) and `server/recipients.js` (shared resolution logic: Blobs-stored list once an
  admin has ever saved one, else falls back to seeding from `CLIENT_EMAIL_RECIPIENTS`).
  `email-config.js` and `send-email.js` both call the same `getEffectiveRecipients()` so they can
  never drift apart — the Send dialog still only ever offers checkboxes, never free text.

## Status

Build in progress through the BUILD LOOP in `claude_code_prompt_broker_portal.md`. See
`DECISIONS.md` for implementation choices made along the way.
