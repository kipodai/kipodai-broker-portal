import { json } from '../../server/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { getReport, getLatestReport } from '../../server/storage.js';

function sanitizeForRole(report, role) {
  if (role === ROLES.ADMIN) return report;
  const { sendLog, ...rest } = report; // clients never see send history
  return rest;
}

export async function handleGetReport(request, env) {
  const secret = env.SESSION_SECRET;
  const auth = await requireRole(request.headers.get('cookie'), secret, [ROLES.ADMIN, ROLES.CLIENT]);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const url = new URL(request.url);
  const week = url.searchParams.get('week');
  const report = week ? await getReport(env.REPORTS_KV, week) : await getLatestReport(env.REPORTS_KV);

  if (!report) {
    return json(404, { error: week ? `No report found for week ${week}.` : 'No reports published yet.' });
  }

  return json(200, { report: sanitizeForRole(report, auth.session.role) });
}
