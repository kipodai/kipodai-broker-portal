# KipodAI — Broker Portal — Project Rules

Read this at the start of every session. These are durable constraints for the life of the project, not one-time build instructions. The full build spec lives in `claude_code_prompt_broker_portal.md` in this same folder — read that too if a fresh phase is starting.

## Data handling — non-negotiable
- The `/fixtures` folder contains **real supplier POS data** (Mamma Chia / Walmart). It must **never** be committed to git. Confirm `.gitignore` includes `fixtures/` before any commit, every session — don't assume a prior session set this correctly.
- Never print full rows of fixture data into commit messages, PR descriptions, or any file that gets pushed.

## Stack — do not substitute without asking
- Frontend: Vite + React, Recharts for charts.
- Backend: **Cloudflare Worker with static assets** (`worker/index.js` — single fetch handler dispatching to `worker/routes/*.js`; NOT Cloudflare Pages Functions — that's a different product with file-based routing that was tried first, then replaced 2026-08-21 to fit the dual-hosting/failover architecture, see `DECISIONS.md`). Switched from Netlify Functions after the `kipodai` Netlify account was suspended mid-project; Netlify has since come back online and now serves as a **static-only backup** behind a Cloudflare Load Balancer (frontend loads, no working `/api/*` — Netlify's function backend was removed, not rebuilt, to avoid maintaining two parallel backends). Do not switch backend approach again, and do not touch DNS/Load Balancer config for `kipodai.com` (that's owned by a parallel session working the failover setup) without asking first.
- Excel parsing: **SheetJS only**, server-side. Do not use openpyxl-equivalent strict parsers — two of the three real source files have malformed stylesheet XML that crashes strict parsers. This is permanent, not a one-time gotcha to work around and forget. Parses from a `Uint8Array` (`{ type: 'array' }`), not a Node `Buffer` — keep it that way; it's what keeps `server/parser.js` runnable on Workers with zero Node compat flags.
- Storage: **Cloudflare KV** (`env.REPORTS_KV` binding), one JSON doc per report week. No database. `server/storage.js`'s functions all take the KV namespace as an explicit first argument (no ambient global) — every caller must thread `env.REPORTS_KV` through.
- Auth signing: Web Crypto (`crypto.subtle`), not `node:crypto` — see `server/auth.js`. This is deliberate (works identically on Workers and Node with zero compat flags), not something to "simplify" back to `node:crypto` even though the code looks similar.
- Narrative: Anthropic API, model `claude-sonnet-4-6`, with a deterministic template fallback if `ANTHROPIC_API_KEY` is unset. The app must fully function with zero optional API keys configured — verify this any time email or narrative code is touched.
- Email: Resend API. Recipients come only from a pre-approved list — never allow free-text recipient entry **at send time**, ever, in any future feature. The approved list is admin-editable via `/admin/settings` (`server/recipients.js`, KV-backed once an admin has ever saved an edit; seeded from `CLIENT_EMAIL_RECIPIENTS` env var until then). The Send dialog always offers checkboxes against that stored list, never an open text field — `send-email.js` and `email-config.js` both call the same `getEffectiveRecipients()` so they can't drift apart.

## Data format facts (permanent — the source files won't change shape)
- File A (`Weekly_Trends`): headers on row 1, ~52 weekly rows.
- File B (`Trend_Analysis`) and File C (`Geo_Performance`): **row 1 is a preamble, headers are on row 2.** Detect the header row by content match, not fixed row number.
- File C's last row is `Grand Total (...)` — exclude from all state-level rankings; use it only as the period total.
- Walmart fiscal week format `YYYYWW`, sometimes arrives as float-like strings (`202528.0`) — normalize to integer strings.
- Blank LY (last-year) cells mean no data, not zero. Never coerce blank to 0.

## Auth model — non-negotiable
- Two roles only: admin, client. No user accounts, no OAuth.
- Role is enforced **server-side on every function/route**, never only hidden in the frontend UI. Any new admin-only feature must check the session role in its own function, independent of what the frontend shows.
- Client role must never be able to reach upload, email-send, or delete — by UI *or* direct API call.

## Review discipline
- After completing a phase, do not self-certify. Dispatch a fresh review subagent per the REVIEW LOOP section of the build spec before moving to the next phase.
- Keep `DECISIONS.md` updated any time an ambiguous product or implementation choice is made — future sessions (and reviewers) need to know why, not just what.

## Repo / infra ownership
- This project lives under the `kipodai` GitHub account, not any personal or Novus-related account. If a git remote or credential ever resolves to a different account, stop and flag it rather than pushing.

## Roadmap — auto-mode config revisit triggers
- The auto-mode permission setup needs to reflect the current deploy target. It is **not** set-and-forget.
- Revisit the auto-mode config the moment any of these happen, since each one expands auto-mode's blast radius:
  - Resend send capability goes live for real (not a dry-run/template path).
  - The Cloudflare Worker production deploy goes live, or the Load Balancer failover to Netlify is completed (superseded the earlier "Netlify deploy target" trigger).
