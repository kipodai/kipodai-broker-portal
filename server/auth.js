// Session auth: HMAC-signed cookie carrying only a role + expiry. No user
// accounts, no OAuth — deliberately lightweight per spec. Every function
// that needs a role check calls getSessionFromRequest() itself; there is no
// shared middleware, so a missing check is a visible, greppable gap rather
// than a silent one.
//
// Signing uses the Web Crypto API (globalThis.crypto.subtle) rather than
// node:crypto, so the exact same code runs unchanged on Cloudflare Workers
// (a native, zero-config platform API there) and on Node (built in since
// Node 20, what Vitest runs on) — no compatibility flags, no runtime-
// specific branches. This makes createSessionCookieValue/
// verifySessionCookieValue/getSessionFromRequest/requireRole/
// buildSetCookieHeader all async, unlike the previous node:crypto version.

export const SESSION_COOKIE_NAME = 'broker_portal_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours
export const ROLES = { ADMIN: 'admin', CLIENT: 'client' };

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64url) {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret, usages) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

async function sign(payload, secret) {
  const key = await importHmacKey(secret, ['sign']);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(sigBuffer));
}

// Verifies an HMAC signature via crypto.subtle.verify, which the platform
// guarantees is constant-time — preferred over re-signing and
// byte-comparing ourselves.
async function verify(payload, secret, signatureBase64Url) {
  let signatureBytes;
  try {
    signatureBytes = base64UrlToBytes(signatureBase64Url);
  } catch {
    return false;
  }
  const key = await importHmacKey(secret, ['verify']);
  return crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(payload));
}

// Constant-time string comparison for password checks — a shared-password
// login is still worth protecting against timing attacks. Pure byte
// comparison (TextEncoder only), no crypto.subtle needed, so this stays
// synchronous.
export function safeStringEqual(a, b) {
  const bytesA = new TextEncoder().encode(String(a ?? ''));
  const bytesB = new TextEncoder().encode(String(b ?? ''));
  const len = Math.max(bytesA.length, bytesB.length, 1);
  let diff = bytesA.length === bytesB.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (i < bytesA.length ? bytesA[i] : 0) ^ (i < bytesB.length ? bytesB[i] : 0);
  }
  return diff === 0;
}

export async function createSessionCookieValue(role, secret, now = Date.now()) {
  const expiresAt = now + SESSION_DURATION_MS;
  const payload = `${role}.${expiresAt}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionCookieValue(value, secret, now = Date.now()) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [role, expiresAtStr, signature] = parts;
  if (role !== ROLES.ADMIN && role !== ROLES.CLIENT) return null;

  const valid = await verify(`${role}.${expiresAtStr}`, secret, signature);
  if (!valid) return null;

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

export async function buildSetCookieHeader(role, secret, { secure = true } = {}) {
  const value = await createSessionCookieValue(role, secret);
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
export async function getSessionFromRequest(cookieHeader, secret) {
  const cookies = parseCookies(cookieHeader);
  return verifySessionCookieValue(cookies[SESSION_COOKIE_NAME], secret);
}

export async function requireRole(cookieHeader, secret, allowedRoles) {
  const session = await getSessionFromRequest(cookieHeader, secret);
  if (!session) return { ok: false, status: 401, error: 'Not authenticated.' };
  if (!allowedRoles.includes(session.role)) {
    return { ok: false, status: 403, error: 'Not authorized for this action.' };
  }
  return { ok: true, session };
}
