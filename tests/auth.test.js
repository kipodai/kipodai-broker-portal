import { describe, it, expect } from 'vitest';
import {
  createSessionCookieValue,
  verifySessionCookieValue,
  buildSetCookieHeader,
  requireRole,
  ROLES,
  SESSION_COOKIE_NAME,
} from '../server/auth.js';

const SECRET = 'test-secret-do-not-use-in-prod';

async function cookieHeaderFor(role, secret = SECRET, now = Date.now()) {
  const value = await createSessionCookieValue(role, secret, now);
  return `${SESSION_COOKIE_NAME}=${value}`;
}

describe('session cookie sign/verify', () => {
  it('round-trips a valid admin session', async () => {
    const value = await createSessionCookieValue(ROLES.ADMIN, SECRET);
    const session = await verifySessionCookieValue(value, SECRET);
    expect(session).not.toBeNull();
    expect(session.role).toBe('admin');
  });

  it('rejects a tampered signature', async () => {
    const value = await createSessionCookieValue(ROLES.CLIENT, SECRET);
    const tampered = value.slice(0, -4) + 'XXXX';
    expect(await verifySessionCookieValue(tampered, SECRET)).toBeNull();
  });

  it('rejects a cookie signed with the wrong secret', async () => {
    const value = await createSessionCookieValue(ROLES.ADMIN, SECRET);
    expect(await verifySessionCookieValue(value, 'a-different-secret')).toBeNull();
  });

  it('rejects an expired session', async () => {
    const now = Date.now();
    const value = await createSessionCookieValue(ROLES.ADMIN, SECRET, now - 13 * 60 * 60 * 1000); // signed 13h ago
    expect(await verifySessionCookieValue(value, SECRET, now)).toBeNull();
  });

  it('accepts a session just under the 12h expiry and rejects just over it', async () => {
    const now = Date.now();
    const value = await createSessionCookieValue(ROLES.CLIENT, SECRET, now);
    expect(await verifySessionCookieValue(value, SECRET, now + 11.9 * 60 * 60 * 1000)).not.toBeNull();
    expect(await verifySessionCookieValue(value, SECRET, now + 12.1 * 60 * 60 * 1000)).toBeNull();
  });

  it('rejects garbage / malformed cookie values without throwing', async () => {
    expect(await verifySessionCookieValue('not-a-real-cookie', SECRET)).toBeNull();
    expect(await verifySessionCookieValue('', SECRET)).toBeNull();
    expect(await verifySessionCookieValue(null, SECRET)).toBeNull();
    expect(await verifySessionCookieValue('admin.9999999999999.badsig', SECRET)).toBeNull();
  });

  it('rejects a role outside the allowed enum even with a correctly computed signature', async () => {
    // Simulates a forged cookie for a role that was never legitimately issued.
    const now = Date.now();
    const forged = await createSessionCookieValue('superadmin', SECRET, now);
    expect(await verifySessionCookieValue(forged, SECRET, now)).toBeNull();
  });
});

describe('requireRole — server-side enforcement', () => {
  it('rejects a client-role cookie hitting an admin-only route with 403', async () => {
    const result = await requireRole(await cookieHeaderFor(ROLES.CLIENT), SECRET, [ROLES.ADMIN]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('rejects no cookie at all with 401', async () => {
    const result = await requireRole(undefined, SECRET, [ROLES.ADMIN]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('rejects an empty cookie header with 401', async () => {
    const result = await requireRole('', SECRET, [ROLES.ADMIN]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('allows an admin-role cookie on an admin-only route', async () => {
    const result = await requireRole(await cookieHeaderFor(ROLES.ADMIN), SECRET, [ROLES.ADMIN]);
    expect(result.ok).toBe(true);
    expect(result.session.role).toBe('admin');
  });

  it('allows both roles on a shared route', async () => {
    expect((await requireRole(await cookieHeaderFor(ROLES.ADMIN), SECRET, [ROLES.ADMIN, ROLES.CLIENT])).ok).toBe(true);
    expect((await requireRole(await cookieHeaderFor(ROLES.CLIENT), SECRET, [ROLES.ADMIN, ROLES.CLIENT])).ok).toBe(true);
  });

  it('rejects a session cookie that is well-formed but signed by a stale/rotated secret', async () => {
    const result = await requireRole(await cookieHeaderFor(ROLES.ADMIN, 'old-secret'), SECRET, [ROLES.ADMIN]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });
});

describe('Set-Cookie header shape', () => {
  it('includes HttpOnly, SameSite=Strict, and Secure when not local', async () => {
    const header = await buildSetCookieHeader(ROLES.ADMIN, SECRET, { secure: true });
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Secure');
  });

  it('omits Secure for localhost dev', async () => {
    const header = await buildSetCookieHeader(ROLES.ADMIN, SECRET, { secure: false });
    expect(header).not.toContain('Secure');
    expect(header).toContain('HttpOnly');
  });
});
