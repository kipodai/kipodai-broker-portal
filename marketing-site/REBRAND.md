# Spike Retail rebrand record

This change is intentionally easy to reverse while the Spike Retail trademark is pending.

## Brand and page-copy changes

The following files replace visible `KipodAI` / `kipodai` text with `Spike Retail` / `spike retail`, including page titles, meta descriptions, alt text, ARIA labels, footer text, email subject lines, and the Worker preview response:

- `public/index.html`
- `public/product-tour.html`
- `public/retail-weekly-reports.html`
- `public/sample-weekly-report.html`
- `public/weekly-report-walkthrough.html`
- `public/demos/index.html`
- `public/demos/shelf/index.html`
- `public/site.js`
- `worker.js`

The existing `hello@kipodai.com` address remains in every mailto link. Only the user-visible wording and prefilled email subjects changed.

## Brand assets

The old source files remain untouched:

- `public/kipodai.png`
- `public/kipodai-professor.png`
- `public/kipodai-professor-pointer.png`
- `public/favicon.png`

The navigation now uses a CSS text wordmark, so no replacement logo was invented. The floating contact treatment uses the existing hedgehog-envelope artwork rather than the old logo image.

When ready, provide `spike-retail-logo.svg` (or transparent PNG) and a `spike-retail-favicon.png` or `.ico`. Replacing the text wordmark and favicon is deliberately a separate, small change.

## Visual-system changes

- `public/tokens.css` defines the Graphite Grid semantic palette and six chart-series tokens.
- `public/layout-refresh.css` adds shared layout, hierarchy, interaction, mobile, dashboard-mockup, and text-wordmark refinements.
- The existing CSS files now use those tokens instead of hardcoded colors.
- Every public HTML entry page loads `tokens.css` before its page styles.

## Intentionally unchanged destinations and gate configuration

The following remain unchanged because they belong to the still-live KipodAI infrastructure:

- Mail delivery remains `hello@kipodai.com`.
- The `Client portal` path and `https://shiftretailgroup.kipodai.com/login` destination remain unchanged.

## Domain move to spikeretail.com

- Marketing site: `spikeretail.com`. `kipodai.com`, `www.kipodai.com` and `www.spikeretail.com` are bound to the same Worker only to 301 to the apex, keeping path and query (`worker.js`, `wrangler.production.jsonc`).
- Demo: `demo.spikeretail.com`. `gate.js` allows only that origin, and `COOKIE_DOMAIN` is `.spikeretail.com`, so one cookie covers the marketing site and the demo.
- Cookies issued on `.kipodai.com` are not accepted on the new hosts, so visitors sign in once more.
- Deploy order: set `DEMO_PASSWORD`/`DEMO_GATE_SECRET`, deploy this Worker, then deploy the demo Worker (see the demo dashboard README).
