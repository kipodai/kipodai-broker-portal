import { json } from './_shared/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { listReportWeeks } from '../../server/storage.js';

export default async (req) => {
  const secret = process.env.SESSION_SECRET;
  const auth = requireRole(req.headers.get('cookie'), secret, [ROLES.ADMIN, ROLES.CLIENT]);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const weeks = await listReportWeeks();
  return json(200, { weeks });
};
