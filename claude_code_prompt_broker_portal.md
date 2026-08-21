# Claude Code Prompt — Weekly Supplier Report Portal ("Broker Portal")

Copy everything below this line into Claude Code (Sonnet).

---

## MISSION

Build a small web application called **Broker Portal**. A retail broker's analyst (me, the admin) uploads three Excel exports from ABI Studio once a week. The app parses them, computes business metrics, generates a simple one-page visual report ("what a business analyst would tell you"), and publishes it to a password-protected portal that the broker's supplier clients can view. The admin — and only the admin — can send the report as an email to pre-defined client addresses.

Work autonomously through the BUILD LOOP at the bottom. Do not ask me questions you can answer by reading this spec or by testing against the sample files. When a genuine product decision is ambiguous, make the simpler choice and note it in DECISIONS.md.

## USERS AND ROLES

- **Admin (broker/analyst):** logs in with ADMIN_PASSWORD. Sees everything clients see, PLUS: the upload page, the "Send Email" button, and the report archive management.
- **Client (supplier):** logs in with CLIENT_PASSWORD. Sees the current report and the archive of past reports. Read-only. Must never see the upload UI, the email UI, or any admin route — enforce this **server-side** (session role checks on every admin API route and admin page), not by hiding buttons in the frontend.

No public access. Every page except the login page requires a valid session.

## TECH STACK (use exactly this unless something is impossible)

- Frontend: **Vite + React**, single-page app. Charts with **Recharts**. Styling: clean, professional, light theme; no CSS framework required beyond plain CSS or Tailwind if faster.
- Backend: **Netlify Functions** (serverless) in the same repo. If Netlify tooling is unavailable in the environment, use Cloudflare Pages + Workers with the same route contract.
- Storage: **Netlify Blobs** (or Cloudflare KV) storing one JSON document per weekly report, key = report week (e.g. `report-202627`), plus an `index` document listing available reports. No database.
- Excel parsing: **SheetJS (xlsx package)**, run **server-side inside the upload function**. Do NOT use openpyxl-style strict parsers — see FILE GOTCHAS.
- Email: **Resend API** (server-side function). Env var RESEND_API_KEY. If no key is configured, the send button must show "email not configured" rather than fail silently.
- Narrative generation: server-side function calling the **Anthropic API** (model `claude-sonnet-4-6`) with ANTHROPIC_API_KEY env var. If the key is missing, fall back to a deterministic template-based narrative (see REPORT SPEC) — the app must fully work without the API key.
- Secrets/env vars (document all in README): ADMIN_PASSWORD, CLIENT_PASSWORD, SESSION_SECRET, RESEND_API_KEY (optional), ANTHROPIC_API_KEY (optional), CLIENT_EMAIL_RECIPIENTS (comma-separated, pre-defined; the UI must NOT allow typing arbitrary recipients — admin can only select from this list), EMAIL_FROM_ADDRESS.

## AUTH (keep it simple but real)

- Login page: single password field. Try admin password first, then client password; set an HTTP-only signed session cookie containing the role (sign with SESSION_SECRET, e.g. HMAC). 12-hour expiry.
- Every function route checks the cookie and role. Admin-only routes: upload, send-email, delete-report. Shared routes: get-report, list-reports.
- This is deliberately lightweight (two shared passwords, no user accounts). Do not build OAuth. Do note in README that per-user accounts are a future upgrade.

## INPUT FILES — EXACT FORMATS (verified against real samples)

Three .xlsx files uploaded together each week. Filenames vary by timestamp but always contain these distinguishing substrings — identify each file by substring match on filename, and fall back to header-row detection if names change:

### File A — "Weekly_Trends" (substring `Weekly_Trends`)
- Sheet1. **Headers on row 1.** ~52 data rows, one per Walmart fiscal week.
- Columns (49, in order): `WM Week`, `POS $`, `POS $ LY`, `POS $ %Chg vs LY`, `POS Qty`, `POS Qty LY`, `POS Qty %Chg vs LY`, `U/S/W (Valid Store)`, `U/S/W LY (Valid Store)`, `U/S/W %Chg vs LY (Valid Store)`, `$/S/W (Valid Store)`, `$/S/W LY (Valid Store)`, `$/S/W %Chg vs LY (Valid Store)`, `Traited Store Count`, `Traited Store Count LY`, `Traited Str Cnt %Chg vs LY`, `Valid Store Count`, `Valid Store Count LY`, `Valid Str Cnt %Chg vs LY`, `POS Store Count`, `POS Store Count LY`, `POS Str Cnt %Chg vs LY`, `U/S/W (POS Stores)`, `U/S/W LY (POS Stores)`, `U/S/W %Chg vs LY (POS Stores)`, `$/S/W (POS Stores)`, `$/S/W LY (POS Stores)`, `$/S/W %Chg vs LY (POS Stores)`, `Avg Retail`, `Avg Retail LY`, `Avg Retail %Chg vs LY`, `Instock %`, `Instock % LY`, `Instock % Chg`, `Repl.Instock %`, `Repl.Instock % LY`, `Repl.Instock %Chg vs LY`, `Store Wks OH`, `Store Wks OH LY`, `Store Wks OH %Chg vs LY`, `Warehouse Wks OH`, `Warehouse Wks OH LY`, `Whse Wks OH %Chg vs LY`, `MUMD $`, `MUMD $ LY`, `MUMD Sales %Chg vs LY`, `MUMD Qty`, `MUMD Qty LY`, `MUMD Qty %Chg vs LY`.
- `WM Week` values are Walmart fiscal weeks as strings like `202601`. All %Chg columns are decimals (0.0119 = +1.19%). Instock columns are decimals (0.9897 = 98.97%).

### File B — "Trend_Analysis" (substring `Trend_Analysis`) — OTIF/supply metrics
- Sheet1. **Row 1 is a preamble** (e.g. `Selected Weeks: 202627;`) — SKIP IT. **Headers on row 2.**
- Columns: `Week`, `On Time %`, `On Time % LY`, `In Full %`, `In Full % LY`, `Collect Ready %`, `Collect Ready % LY`, `Over Filled %`, `Over Filled % LY`.
- Week values may parse as numbers like `202528.0` — normalize to integer week strings. LY columns are blank for older weeks; treat blank as null, never as zero.

### File C — "Geo_Performance" (substring `Geo_Performance`) — state-level
- Sheet1. **Row 1 is a preamble** (`Selected Filters => ...`) — SKIP IT. **Headers on row 2.**
- Columns include: `State`, `POS $`, `POS $ LY`, `POS $ %Chg vs LY`, `POS Qty`, `POS Qty LY`, `POS Qty %Chg vs LY`, `$/S/W (Valid Store)`, `$/S/W LY (Valid Store)`, `$/S/W %Chg vs LY (Valid Store)`, `$/S/W (Traited Store)`, `$/S/W LY (Traited Store)`, `$/S/W %Chg vs LY (Traited Store)`, `U/S/W (Valid Store)`, and possibly more — parse by header name, not position.
- **The last row is `Grand Total (...)` — it MUST be excluded from all state rankings and treated as the period total.** Match any row whose State value starts with `Grand Total`.

### FILE GOTCHAS (all verified — build the parser around these)
1. **Two of the three files contain malformed stylesheet XML** (invalid aRGB color values) that crashes strict parsers. SheetJS ignores styles and reads them fine — this is why SheetJS is mandated. Add a unit test that parses all three real sample files successfully.
2. Preamble rows (Files B and C) must be skipped; detect the header row by looking for the known first header (`Week` / `State`) rather than hardcoding row numbers, so a format drift of one row doesn't break parsing.
3. Numeric values may arrive as strings or floats; coerce defensively. Empty string → null.
4. Walmart fiscal week format `YYYYWW`. Sort numerically. The "current week" of a report = max week present in File A.
5. Validate on upload: all three files present, all expected headers found, ≥4 weeks of data in File A. If validation fails, reject with a clear human-readable message telling the admin which file and what's wrong — never publish a partial report.

## METRICS ENGINE (deterministic, computed at upload time, stored in the report JSON)

From File A, using the latest week (L1W), latest 4 weeks (L4W), and prior 4 weeks (P4W):
- L1W POS $ and vs LY; L4W POS $ total and vs LY; L4W avg U/S/W and vs both LY and P4W (momentum).
- Instock: L1W Instock % and Repl.Instock %, plus 13-week trend series for charting.
- Store counts: L1W POS Store Count vs Valid Store Count (selling-store gap) and vs LY.
- Weeks on hand: L1W Store Wks OH; flag if < 2.0 (low) or > 6.0 (heavy).
- MUMD: L4W MUMD $ as % of L4W POS $; flag if > 3%.
- 52-week series for the main chart: POS $ (TY vs LY) and Instock %.

From File B: L1W On Time % and In Full %; 13-week series; flag either < 95% in L1W or a ≥3-point drop vs the prior week.

From File C (period totals as exported): top 5 states by POS $, top 3 fastest-growing (POS $ %Chg vs LY, minimum $500 POS $ to avoid tiny-base noise), bottom 3 decliners under the same floor, and the Grand Total row as the period summary.

**Alert rules** (each produces a plain-English alert string, severity `watch` or `flag`): Instock % < 95% (flag) or < 98% (watch); POS $ down > 10% vs LY in L1W (flag); U/S/W momentum negative two periods running (watch); OTIF In Full < 95% (flag); Store Wks OH outside 2–6 band (watch); correlation callout — if the weeks where Instock % dropped below 95% overlap the weeks of steepest POS decline, say explicitly that the sales decline appears supply-driven, not demand-driven. This exact pattern exists in the sample data (weeks 202610–202612: instock fell to ~74%, POS fell 22–34% vs LY) — use it as the test case.

## REPORT SPEC (the one-pager clients see)

Single scrollable page, mobile-friendly, printable. Order:
1. **Header:** client/brand name (configurable constant, default "Mamma Chia — Walmart US"), report week, date generated.
2. **Executive summary:** 3–5 sentences. If ANTHROPIC_API_KEY is set, generate server-side with claude-sonnet-4-6: pass ONLY the computed metrics JSON (never raw files), instruct plain business English readable by a non-analyst, no jargon, lead with the single most important thing, mention supply-driven vs demand-driven if the correlation alert fired, ≤120 words. If no key: assemble from deterministic templates keyed off the alerts and headline metrics.
3. **KPI cards (6):** L1W POS $ (vs LY), L4W POS $ (vs LY), U/S/W (vs LY), Instock %, In Full % (OTIF), POS Store Count. Green/red deltas.
4. **Main chart:** 52-week POS $ TY vs LY lines with Instock % as a secondary axis or aligned band — the reader should SEE sales dip where instock dips.
5. **Alerts panel:** the alert strings, severity-colored. If none: "No flags this week."
6. **Geography:** horizontal bar of top 5 states by POS $, plus small "fastest growing / declining" lists.
7. **Supply chain strip:** 13-week On Time % and In Full % mini-chart.
8. Footer: "Prepared by [Broker Name]" (configurable constant) — no mention of ABI, Claude, or tooling.

## EMAIL FEATURE (admin only)

- "Send report" button on the admin view of a report. Confirmation dialog showing the recipient list (from CLIENT_EMAIL_RECIPIENTS — selectable checkboxes, no free-text entry) before sending.
- Email body: self-contained HTML version of the report — inline styles, no external CSS, charts rendered as static images (server-side chart rendering is overkill; instead render the main chart as a simple inline SVG built from the metrics JSON, which email clients that support SVG will show, and always include a prominent "View full report" link to the portal as the primary CTA). Keep the email to: exec summary, KPI table, alerts, link. The portal is the visual experience; the email is the digest.
- Log each send (timestamp, recipients, report week) into the report JSON; show send history on the admin view.

## PAGES / ROUTES

- `/login` — password entry.
- `/` — latest report (both roles).
- `/archive` — list of past report weeks, click through to `/report/:week` (both roles).
- `/admin/upload` — drag-and-drop 3 files, validate, preview computed KPIs + summary, then explicit "Publish" step (admin only). Publishing overwrites that week's report if re-uploaded.
- Admin sees Send Email + delete on report pages.

## BUILD LOOP (work in this order; after each phase run the checks before moving on)

**Phase 0 — Scaffold.** Repo layout, Vite+React app, functions directory, README with env var table, DECISIONS.md. Check: dev server runs.

**Phase 1 — Parser.** Implement the three-file parser as a pure module with unit tests (Vitest) run against the three real sample files placed in `/fixtures`. Tests must cover: malformed-stylesheet files parse; preamble rows skipped; Grand Total excluded from rankings but captured as total; blank LY → null; week normalization `202528.0` → `202528`; header-name-based column mapping survives column reordering. Check: all tests green.

**Phase 2 — Metrics engine.** Pure module, unit-tested with the fixtures. Must reproduce the known sample facts: instock collapse to ~74% around week 202611–202612 with POS down 22–34%, TX/CA as top states, and the supply-driven correlation alert firing. Check: tests assert these.

**Phase 3 — Report UI.** Build the report page from a stored metrics JSON (use a fixture-generated one). Check: renders cleanly at 375px and 1280px widths; chart shows the dip/instock alignment; no raw column names leak into the UI.

**Phase 4 — Functions + storage + auth.** Upload → validate → compute → store; get/list; session auth with role enforcement (write a test or manual check that a client-role cookie hitting an admin route gets 403). Check: end-to-end local flow with `netlify dev` (or wrangler): login as admin, upload fixtures, publish, log out, log in as client, see report, confirm no admin UI or admin API access.

**Phase 5 — Narrative + email.** Anthropic call with graceful fallback; Resend send with confirmation flow and send log. Check: with no API keys set, app works fully with template narrative and "email not configured" state; with keys, mock/dry-run the send.

**Phase 6 — Deploy readiness.** Netlify config, README deploy steps (create NEW business account — do not deploy under a personal account), env var setup instructions, and a WEEKLY_RUNBOOK.md: the exact 5-step routine the admin follows each Monday (export 3 files from ABI → login → upload → review preview → publish → send). Check: `npm run build` clean; all tests green; runbook accurate.

Throughout: keep every parsing and metric decision in DECISIONS.md. Never hardcode secrets. Never commit the fixture files to a public repo — note in README that the repo must stay private because fixtures contain real supplier data (or replace fixtures with a synthetic generator script as a final step and gitignore the real files).

## REVIEW LOOP (run after every phase, before moving to the next)

Building and checking your own work in the same pass misses things — you're primed to see what you intended to build, not what's actually there. Use a subagent to break that.

After you complete a phase and its stated checks pass, **dispatch a fresh subagent** (via the Task tool) with no prior context beyond: the phase's goal from this spec, the files it touched, and the specific check(s) it claims to satisfy. Give it these instructions verbatim:

> You are reviewing another agent's work, not your own. Assume it is wrong until you verify otherwise. Do not run the same check the builder already ran and call it done — that only confirms the happy path. Instead: (1) re-read the relevant section of the spec and check the code against it line by line, not against what the builder said it did; (2) actively try to break it — malformed input, missing files, wrong role hitting a protected route, empty API keys, edge cases in the real fixture data (blank LY cells, the Grand Total row, week format drift); (3) check for scope gaps — things the spec asked for that are quietly missing rather than wrong; (4) report PASS or FAIL with specifics. A FAIL must name the exact file, line, or behavior — no vague "looks mostly fine."

If the subagent returns FAIL: fix the specific issues, then re-dispatch a review subagent on the fix — don't self-certify the fix. Loop until a review subagent returns a clean PASS. Do not proceed to the next phase on a self-assessed pass; only a subagent PASS counts.

Phase-specific adversarial targets for the reviewer to prioritize:
- **Phase 1 (Parser):** feed it a fixture file with a column reordered, a blank inserted where a header is expected, and confirm it fails loudly rather than silently misreading columns.
- **Phase 2 (Metrics):** confirm the supply-driven correlation alert fires on the real 202610–202612 dip and does NOT fire on a synthetic week where POS drops without an instock drop (false-positive check).
- **Phase 4 (Auth):** attempt every admin route with a client-role session cookie, and attempt every route with no cookie at all — both must be rejected server-side, not just hidden in the UI.
- **Phase 5 (Email/Narrative):** strip both optional API keys and confirm zero crashes, zero blank states — templates and "not configured" messaging must render correctly.

This is the loop that gets you closer to "flawless" — not parallel builders, an adversarial second look on sequential work.

## ACCEPTANCE CHECKLIST (final self-review)
- [ ] All three real sample files parse and produce a correct report end-to-end.
- [ ] Client role cannot reach upload/email/delete via UI **or** direct API call.
- [ ] Report readable by a non-analyst: no metric appears without a plain-English label.
- [ ] Supply-vs-demand callout fires on the sample data.
- [ ] App fully functional with zero optional API keys configured.
- [ ] README + WEEKLY_RUNBOOK complete enough that the admin can operate it without reading code.
