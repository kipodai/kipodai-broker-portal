# Weekly Runbook — Broker Portal

The routine the admin (broker/analyst) follows every Monday to publish that week's report.
No code knowledge required.

## 1. Export the three files from ABI Studio

Export these three reports for the current week and save them anywhere convenient
(e.g. Downloads):

- **Weekly Trends** (or `Weekly_Trends`) — Walmart fiscal-week sales/instock/OTIF-adjacent metrics.
- **Trend Analysis** (or `Trend_Analysis`) — On Time / In Full supply metrics.
- **Geo Performance** (or `Geo_Performance`) — state-level sales.

Filenames don't need to match exactly — the app identifies each file by its filename first,
and falls back to reading the header row if the name doesn't match (this is normal; ABI Studio's
default export names use spaces, not underscores).

## 2. Log in

Go to the portal URL and enter the admin password (`ADMIN_PASSWORD`).

## 3. Upload

Go to **Upload** in the nav bar. Drag all three `.xlsx` files into the drop zone (or click it to
browse). Click **Preview**.

- If a file is missing, misidentified, or malformed, you'll get a clear error naming the file and
  the problem (e.g. a missing column). Fix the export and re-upload — nothing is published on a
  failed validation.

## 4. Review the preview

The preview shows exactly what clients will see: executive summary, KPI cards, the sales/in-stock
chart, alerts, geography, and the supply-chain strip. It is clearly marked **"Preview — not yet
published."** Check that the week, numbers, and alerts look right.

## 5. Publish

Click **Publish**. This stores the report for that fiscal week — if a report for that week already
exists (e.g. you're re-uploading a corrected file), publishing **overwrites** it. Clients will
immediately see the new report as soon as you publish.

## 6. Send

From the published report page, click **Send report**. Check the recipients you want (only
pre-defined addresses from `CLIENT_EMAIL_RECIPIENTS` are selectable — you cannot type a new
address here) and confirm. If `RESEND_API_KEY` isn't configured, the button will tell you email
isn't set up instead of failing silently — the report is still live on the portal either way.

---

**If something looks wrong:** the report page always shows what's actually stored. Re-uploading and
re-publishing the same week is safe and simply replaces it. If you need to remove a report entirely,
use **Delete** on that report's page (admin only, asks for confirmation).
