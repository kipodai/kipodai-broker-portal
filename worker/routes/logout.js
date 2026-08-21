import { json, isLocalRequest } from '../../server/http.js';
import { buildClearCookieHeader } from '../../server/auth.js';

export async function handleLogout(request) {
  const cookie = buildClearCookieHeader({ secure: !isLocalRequest(request) });
  return json(200, { ok: true }, { 'set-cookie': cookie });
}
