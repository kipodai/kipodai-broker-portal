import { json } from './_shared/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { getReport, deleteReport } from '../../server/storage.js';

export default async (req) => {
  const secret = process.env.SESSION_SECRET;
  const auth = requireRole(req.headers.get('cookie'), secret, [ROLES.ADMIN]);
  if (!auth.ok) return json(auth.status, { error: auth.error });
  if (req.method !== 'POST' && req.method !== 'DELETE') return json(405, { error: 'Method not allowed.' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const { week } = body || {};
  if (!week) return json(400, { error: 'week is required.' });

  const existing = await getReport(week);
  if (!existing) return json(404, { error: `No report found for week ${week}.` });

  await deleteReport(week);
  return json(200, { ok: true });
};
