import { json } from '../../server/http.js';
import { getSessionFromRequest } from '../../server/auth.js';

// Frontend-convenience endpoint only — tells the SPA whether a session
// exists and which role, so it knows which UI to render. This is NEVER a
// substitute for server-side role checks: every admin-only route
// independently calls requireRole() regardless of what this reports.
export async function handleSession(request, env) {
  const secret = env.SESSION_SECRET;
  const session = await getSessionFromRequest(request.headers.get('cookie'), secret);
  if (!session) return json(200, { authenticated: false });
  return json(200, { authenticated: true, role: session.role });
}
