// Worker entry point. Cloudflare's Workers-with-assets model serves static
// files (dist/) automatically for matching requests, but any request that
// doesn't match a static file — including every /api/* route — falls
// through to this fetch handler. Non-API requests (SPA routes like
// /archive, /report/:week) are forwarded to env.ASSETS.fetch(), which
// applies the configured SPA fallback (serves index.html) — see
// wrangler.jsonc's `not_found_handling: "single-page-application"`.
//
// This replaces the earlier Cloudflare Pages Functions approach
// (functions/api/*.js, one file per route, file-based routing) — Pages
// Functions and a plain Worker-with-assets are different Cloudflare
// products that don't compose, and this app deploys as the latter to fit
// the dual-hosting/failover architecture (see DECISIONS.md). The route
// handlers themselves are unchanged logic, just imported and dispatched
// from one place instead of one-file-per-route.

import { json } from '../server/http.js';
import { handleLogin } from './routes/login.js';
import { handleLogout } from './routes/logout.js';
import { handleSession } from './routes/session.js';
import { handleGetReport } from './routes/get-report.js';
import { handleListReports } from './routes/list-reports.js';
import { handleDeleteReport } from './routes/delete-report.js';
import { handleEmailConfig } from './routes/email-config.js';
import { handleRecipients } from './routes/recipients.js';
import { handleSendEmail } from './routes/send-email.js';
import { handleUpload } from './routes/upload.js';

const ROUTES = {
  '/api/login': handleLogin,
  '/api/logout': handleLogout,
  '/api/session': handleSession,
  '/api/get-report': handleGetReport,
  '/api/list-reports': handleListReports,
  '/api/delete-report': handleDeleteReport,
  '/api/email-config': handleEmailConfig,
  '/api/recipients': handleRecipients,
  '/api/send-email': handleSendEmail,
  '/api/upload': handleUpload,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];

    if (handler) {
      try {
        return await handler(request, env, ctx);
      } catch (err) {
        return json(500, { error: 'Internal server error.' });
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return json(404, { error: 'Not found.' });
    }

    return env.ASSETS.fetch(request);
  },
};
