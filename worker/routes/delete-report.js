import { json } from '../../server/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { getReport, deleteReport } from '../../server/storage.js';

export async function handleDeleteReport(request, env) {
  const secret = env.SESSION_SECRET;
  const auth = await requireRole(request.headers.get('cookie'), secret, [ROLES.ADMIN]);
  if (!auth.ok) return json(auth.status, { error: auth.error });
  if (request.method !== 'POST' && request.method !== 'DELETE') return json(405, { error: 'Method not allowed.' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const { week } = body || {};
  if (!week) return json(400, { error: 'week is required.' });

  const existing = await getReport(env.REPORTS_KV, week);
  if (!existing) return json(404, { error: `No report found for week ${week}.` });

  await deleteReport(env.REPORTS_KV, week);
  return json(200, { ok: true });
}
