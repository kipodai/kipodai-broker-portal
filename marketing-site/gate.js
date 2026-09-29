// Signed-cookie gate for the private demos. Web Crypto only, so it runs
// identically on Workers and Node with zero compat flags (same convention as
// server/auth.js). The same file is duplicated verbatim in the demo Worker so
// both hosts accept one cookie; tests/demo-gate.test.js exists in both places
// to catch drift. No storage APIs, no dependencies.

export const COOKIE_NAME = 'kipod_demo';
export const TOKEN_VERSION = 'v1';
export const COOKIE_TTL_SECONDS = 12 * 60 * 60;
export const LOGIN_PATH = '/product-tour.html';
export const DEFAULT_NEXT = '/demos/';
// Absolute origins a login may send the visitor back to. Anything else falls
// back to DEFAULT_NEXT, so the login redirect cannot be used as an open redirect.
export const ALLOWED_NEXT_ORIGINS = ['https://demo.kipodai.com'];

const enc = new TextEncoder();

const hmacKey = (secret, usages) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 || !/^[0-9a-f]+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function signToken(secret, expiresAtSec) {
  const payload = `${TOKEN_VERSION}.${expiresAtSec}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), enc.encode(payload));
  return `${payload}.${toHex(sig)}`;
}

export async function verifyToken(secret, token, nowSec) {
  if (!secret || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp) || exp <= nowSec) return false;
  const sig = fromHex(parts[2]);
  if (!sig) return false;
  // subtle.verify compares the tag in constant time.
  return crypto.subtle.verify('HMAC', await hmacKey(secret, ['verify']), sig, enc.encode(`${parts[0]}.${parts[1]}`));
}

// The previous client-side check ignored case, spaces and punctuation
// ("Kipod Tour" == "kipodtour"). Kept so the password behaves as it did.
export const normalizePassword = (value) =>
  String(value ?? '').trim().replace(/[^a-z0-9]/gi, '').toLowerCase();

// Constant-time comparison: MAC the expected value, then let subtle.verify
// check the supplied value against that tag.
export async function passwordMatches(gateSecret, supplied, expected) {
  const want = normalizePassword(expected);
  const got = normalizePassword(supplied);
  if (!gateSecret || !want || !got) return false;
  const key = await hmacKey(gateSecret, ['sign', 'verify']);
  const tag = await crypto.subtle.sign('HMAC', key, enc.encode(want));
  return crypto.subtle.verify('HMAC', key, tag, enc.encode(got));
}

// Only scope the cookie to the shared parent domain when this request is
// actually on it. A misconfigured or foreign host (localhost, workers.dev)
// gets a host-only cookie instead of one the browser would silently drop.
export function cookieDomainFor(hostname, configured) {
  const domain = String(configured ?? '').trim().toLowerCase().replace(/^\./, '');
  const host = String(hostname ?? '').toLowerCase();
  if (!domain) return '';
  return host === domain || host.endsWith(`.${domain}`) ? `.${domain}` : '';
}

export function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function buildSetCookie(token, { maxAge = COOKIE_TTL_SECONDS, domain = '', secure = true } = {}) {
  const attrs = [`${COOKIE_NAME}=${token}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Lax'];
  if (secure) attrs.push('Secure');
  if (domain) attrs.push(`Domain=${domain}`);
  return attrs.join('; ');
}

// Lower-cased, decoded, backslash-normalized path so odd encodings
// (%2F, %44emos, /DEMOS/, \demos) cannot slip past the prefix check.
export function isGatedPath(pathname) {
  let p = String(pathname ?? '');
  try { p = decodeURIComponent(p); } catch { return true; } // undecodable: fail closed
  p = p.replace(/\\/g, '/').toLowerCase();
  return p === '/demos' || p.startsWith('/demos/');
}

export function safeNext(next) {
  if (typeof next !== 'string' || !next) return DEFAULT_NEXT;
  if (/^\/demos(?:\/[A-Za-z0-9._~\-/]*)?$/.test(next) && !next.includes('..')) return next;
  try {
    const url = new URL(next);
    if (ALLOWED_NEXT_ORIGINS.includes(url.origin)) return url.href;
  } catch { /* not an absolute URL */ }
  return DEFAULT_NEXT;
}

// marketingOrigin is '' on the marketing Worker itself (relative redirect) and
// the absolute marketing origin on the demo Worker.
export const loginRedirectUrl = (marketingOrigin, next) =>
  `${marketingOrigin}${LOGIN_PATH}?demo=1&next=${encodeURIComponent(next)}`;

export async function hasValidGateCookie(request, env, nowMs = Date.now()) {
  const token = parseCookie(request.headers.get('Cookie'), COOKIE_NAME);
  return verifyToken(env.DEMO_GATE_SECRET, token, Math.floor(nowMs / 1000));
}

export async function handleLogin(request, env, nowMs = Date.now()) {
  const json = (status, body, headers = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
    });
  if (request.method !== 'POST') return json(405, { ok: false }, { Allow: 'POST' });
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json(403, { ok: false });
  if (!env.DEMO_GATE_SECRET || !env.DEMO_PASSWORD) return json(503, { ok: false, error: 'not-configured' });

  // Refuse an oversized body from its declared length before reading it, and
  // again from the text itself in case the header was absent or wrong.
  if (Number(request.headers.get('Content-Length')) > 2048) return json(413, { ok: false });
  let body;
  try {
    const text = await request.text();
    if (text.length > 2048) return json(413, { ok: false });
    body = JSON.parse(text);
  } catch { return json(400, { ok: false }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.password !== 'string') {
    return json(400, { ok: false });
  }

  if (!(await passwordMatches(env.DEMO_GATE_SECRET, body.password, env.DEMO_PASSWORD))) {
    return json(401, { ok: false });
  }
  const token = await signToken(env.DEMO_GATE_SECRET, Math.floor(nowMs / 1000) + COOKIE_TTL_SECONDS);
  return json(200, { ok: true, next: safeNext(body.next) }, {
    'Set-Cookie': buildSetCookie(token, { domain: cookieDomainFor(url.hostname, env.COOKIE_DOMAIN), secure: url.protocol === 'https:' }),
  });
}
