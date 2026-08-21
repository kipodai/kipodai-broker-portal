import { json } from '../../server/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { listReportWeeks } from '../../server/storage.js';

export async function handleListReports(request, env) {
  const secret = env.SESSION_SECRET;
  const auth = await requireRole(request.headers.get('cookie'), secret, [ROLES.ADMIN, ROLES.CLIENT]);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const weeks = await listReportWeeks(env.REPORTS_KV);
  return json(200, { weeks });
}
