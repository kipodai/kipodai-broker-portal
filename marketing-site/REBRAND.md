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
- The demo link continues to use `https://demo.kipodai.com/`.
- `gate.js` retains `ALLOWED_NEXT_ORIGINS = ['https://demo.kipodai.com']`.
- `wrangler.production.jsonc` retains `COOKIE_DOMAIN = '.kipodai.com'`.

For `/demos` to work from `spikeretail.com`, its gated redirect flow must allow the new marketing origin and the authentication cookie must be issued for a domain accessible to that origin. A `.kipodai.com` cookie cannot be shared with `spikeretail.com`; that requires a separate cookie/session arrangement or moving the demo service under the new domain.
