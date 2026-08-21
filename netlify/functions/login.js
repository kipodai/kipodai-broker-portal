import { json, isLocalRequest } from './_shared/http.js';
import { buildSetCookieHeader, safeStringEqual, ROLES } from '../../server/auth.js';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const password = body?.password;
  if (!password || typeof password !== 'string') {
    return json(400, { error: 'Password is required.' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const clientPassword = process.env.CLIENT_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!adminPassword || !clientPassword || !secret) {
    return json(500, { error: 'Server auth is not configured. Set ADMIN_PASSWORD, CLIENT_PASSWORD, SESSION_SECRET.' });
  }

  let role = null;
  if (safeStringEqual(password, adminPassword)) role = ROLES.ADMIN;
  else if (safeStringEqual(password, clientPassword)) role = ROLES.CLIENT;

  if (!role) {
    return json(401, { error: 'Incorrect password.' });
  }

  const cookie = buildSetCookieHeader(role, secret, { secure: !isLocalRequest(req) });
  return json(200, { role }, { 'set-cookie': cookie });
};
