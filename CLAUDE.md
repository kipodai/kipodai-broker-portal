# KipodAI — Broker Portal — Project Rules

Read this at the start of every session. These are durable constraints for the life of the project, not one-time build instructions. The full build spec lives in `claude_code_prompt_broker_portal.md` in this same folder — read that too if a fresh phase is starting.

## Data handling — non-negotiable
- The `/fixtures` folder contains **real supplier POS data** (Mamma Chia / Walmart). It must **never** be committed to git. Confirm `.gitignore` includes `fixtures/` before any commit, every session — don't assume a prior session set this correctly.
- Never print full rows of fixture data into commit messages, PR descriptions, or any file that gets pushed.

## Stack — do not substitute without asking
- Frontend: Vite + React, Recharts for charts.
- Backend: Netlify Functions (serverless). If Netlify tooling is unavailable, Cloudflare Pages + Workers is the only approved fallback — ask before switching.
- Excel parsing: **SheetJS only**, server-side. Do not use openpyxl-equivalent strict parsers — two of the three real source files have malformed stylesheet XML that crashes strict parsers. This is permanent, not a one-time gotcha to work around and forget.
- Storage: Netlify Blobs (or Cloudflare KV), one JSON doc per report week. No database.
- Narrative: Anthropic API, model `claude-sonnet-4-6`, with a deterministic template fallback if `ANTHROPIC_API_KEY` is unset. The app must fully function with zero optional API keys configured — verify this any time email or narrative code is touched.
- Email: Resend API. Recipients come only from `CLIENT_EMAIL_RECIPIENTS` env var — never allow free-text recipient entry in the UI, ever, in any future feature.

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
- The current auto-mode permission setup matches where the project is today (no live Resend sends, no Netlify deploy target, no git remote connected). It is **not** set-and-forget.
- Revisit the auto-mode config the moment any of these happen, since each one expands auto-mode's blast radius:
  - Resend send capability goes live for real (not a dry-run/template path).
  - A Netlify deploy target is added.
  - A git remote is connected.
