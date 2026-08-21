import { json, isLocalRequest } from '../../server/http.js';
import { buildSetCookieHeader, safeStringEqual, ROLES } from '../../server/auth.js';

export async function handleLogin(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const password = body?.password;
  if (!password || typeof password !== 'string') {
    return json(400, { error: 'Password is required.' });
  }

  const adminPassword = env.ADMIN_PASSWORD;
  const clientPassword = env.CLIENT_PASSWORD;
  const secret = env.SESSION_SECRET;
  if (!adminPassword || !clientPassword || !secret) {
    return json(500, { error: 'Server auth is not configured. Set ADMIN_PASSWORD, CLIENT_PASSWORD, SESSION_SECRET.' });
  }

  let role = null;
  if (safeStringEqual(password, adminPassword)) role = ROLES.ADMIN;
  else if (safeStringEqual(password, clientPassword)) role = ROLES.CLIENT;

  if (!role) {
    return json(401, { error: 'Incorrect password.' });
  }

  const cookie = await buildSetCookieHeader(role, secret, { secure: !isLocalRequest(request) });
  return json(200, { role }, { 'set-cookie': cookie });
}
