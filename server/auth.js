// Session auth: HMAC-signed cookie carrying only a role + expiry. No user
// accounts, no OAuth — deliberately lightweight per spec. Every function
// that needs a role check calls getSessionFromRequest() itself; there is no
// shared middleware, so a missing check is a visible, greppable gap rather
// than a silent one.

import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'broker_portal_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours
export const ROLES = { ADMIN: 'admin', CLIENT: 'client' };

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

// Constant-time string comparison for password checks — a shared-password
// login is still worth protecting against timing attacks.
export function safeStringEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // keep timing consistent-ish on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createSessionCookieValue(role, secret, now = Date.now()) {
  const expiresAt = now + SESSION_DURATION_MS;
  const payload = `${role}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionCookieValue(value, secret, now = Date.now()) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [role, expiresAtStr, signature] = parts;
  if (role !== ROLES.ADMIN && role !== ROLES.CLIENT) return null;

  const expected = sign(`${role}.${expiresAtStr}`, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || now > expiresAt) return null;

  return { role, expiresAt };
}

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export function isLocalHost(host) {
  return typeof host === 'string' && (host.startsWith('localhost') || host.startsWith('127.0.0.1'));
}

export function buildSetCookieHeader(role, secret, { secure = true } = {}) {
  const value = createSessionCookieValue(role, secret);
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  const secureAttr = secure ? ' Secure;' : '';
  return `${SESSION_COOKIE_NAME}=${value}; HttpOnly;${secureAttr} SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function buildClearCookieHeader({ secure = true } = {}) {
  const secureAttr = secure ? ' Secure;' : '';
  return `${SESSION_COOKIE_NAME}=; HttpOnly;${secureAttr} SameSite=Strict; Path=/; Max-Age=0`;
}

// `cookieHeader` is the raw Cookie request header string. Returns
// { role, expiresAt } or null. Callers MUST treat null as unauthenticated
// and reject — never fall back to trusting frontend state.
export function getSessionFromRequest(cookieHeader, secret) {
  const cookies = parseCookies(cookieHeader);
  return verifySessionCookieValue(cookies[SESSION_COOKIE_NAME], secret);
}

export function requireRole(cookieHeader, secret, allowedRoles) {
  const session = getSessionFromRequest(cookieHeader, secret);
  if (!session) return { ok: false, status: 401, error: 'Not authenticated.' };
  if (!allowedRoles.includes(session.role)) {
    return { ok: false, status: 403, error: 'Not authorized for this action.' };
  }
  return { ok: true, session };
}
