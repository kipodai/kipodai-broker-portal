import { describe, it, expect } from 'vitest';
import {
  COOKIE_NAME, COOKIE_TTL_SECONDS, signToken, verifyToken, passwordMatches, normalizePassword,
  parseCookie, buildSetCookie, cookieDomainFor, isGatedPath, safeNext, loginRedirectUrl,
} from '../marketing-site/gate.js';
import worker from '../marketing-site/worker.js';

const SECRET = 'test-gate-secret';
const NOW = 1_800_000_000_000; // ms
const nowSec = Math.floor(NOW / 1000);

describe('signed token', () => {
  it('verifies a fresh token', async () => {
    const t = await signToken(SECRET, nowSec + 60);
    expect(await verifyToken(SECRET, t, nowSec)).toBe(true);
  });

  it.each([
    ['expired', async () => signToken(SECRET, nowSec - 1), SECRET],
    ['expiring exactly now', async () => signToken(SECRET, nowSec), SECRET],
    ['signed with another secret', async () => signToken('other', nowSec + 60), SECRET],
    ['empty secret on verify', async () => signToken(SECRET, nowSec + 60), ''],
    ['undefined secret on verify', async () => signToken(SECRET, nowSec + 60), undefined],
  ])('rejects %s', async (_n, make, secret) => {
    expect(await verifyToken(secret, await make(), nowSec)).toBe(false);
  });

  it('rejects a tampered expiry or signature', async () => {
    const [v, exp, sig] = (await signToken(SECRET, nowSec + 60)).split('.');
    expect(await verifyToken(SECRET, `${v}.${Number(exp) + 3600}.${sig}`, nowSec)).toBe(false);
    const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    expect(await verifyToken(SECRET, `${v}.${exp}.${flipped}`, nowSec)).toBe(false);
  });

  it.each([
    [''], ['garbage'], ['v1.123'], ['v2.9999999999.abcd'], ['v1.abc.abcd'], ['v1.9999999999.zz'],
    ['v1.9999999999.'], ['v1..abcd'], [null], [undefined], [42],
  ])('rejects malformed token %j', async (token) => {
    expect(await verifyToken(SECRET, token, nowSec)).toBe(false);
  });
});

describe('cross-Worker compatibility (the demo Worker pins this same token)', () => {
  // tests/gate.mjs in kipodai-demo-dashboard asserts this exact string. If the
  // token format ever changes here, that project's test fails until its
  // worker/gate.js copy is updated, so the two hosts cannot drift silently.
  const VECTOR = 'v1.4102444800.ce39fd60ea8286be271224740303a5304942fe5e876da2d1bab6a2e9fc545f8d';
  it('produces the pinned token and verifies it', async () => {
    expect(await signToken('vector-secret', 4102444800)).toBe(VECTOR);
    expect(await verifyToken('vector-secret', VECTOR, nowSec)).toBe(true);
    expect(await verifyToken('other-secret', VECTOR, nowSec)).toBe(false);
  });
});

describe('password', () => {
  it.each([
    ['exact', 'kipodtour', true],
    ['case and spacing ignored, as before', ' Kipod Tour ', true],
    ['punctuation ignored, as before', 'kipod-tour!', true],
    ['wrong', 'kipodtours', false],
    ['prefix', 'kipod', false],
    ['empty', '', false],
    ['only punctuation', '---', false],
    ['undefined', undefined, false],
  ])('%s', async (_n, supplied, ok) => {
    expect(await passwordMatches(SECRET, supplied, 'kipodtour')).toBe(ok);
  });

  it('fails closed when the secret or the expected password is not configured', async () => {
    expect(await passwordMatches('', 'kipodtour', 'kipodtour')).toBe(false);
    expect(await passwordMatches(SECRET, 'kipodtour', '')).toBe(false);
    expect(await passwordMatches(SECRET, '', '')).toBe(false);
    expect(await passwordMatches(SECRET, '---', '---')).toBe(false);
  });

  it('normalizes the way the old client-side check did', () => {
    expect(normalizePassword('  Kipod Tour!! ')).toBe('kipodtour');
  });
});

describe('cookie helpers', () => {
  it('parses a named cookie among others', () => {
    expect(parseCookie('a=1; kipod_demo=tok.en; b=2', COOKIE_NAME)).toBe('tok.en');
    expect(parseCookie('a=1', COOKIE_NAME)).toBeNull();
    expect(parseCookie(null, COOKIE_NAME)).toBeNull();
    expect(parseCookie('xkipod_demo=nope', COOKIE_NAME)).toBeNull();
  });
  it('builds a hardened cookie', () => {
    const c = buildSetCookie('T', { domain: '.spikeretail.com', secure: true });
    expect(c).toContain(`${COOKIE_NAME}=T`);
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${COOKIE_TTL_SECONDS}`, 'Domain=.spikeretail.com']) {
      expect(c).toContain(attr);
    }
  });
  it('is host-only and non-Secure for local http development', () => {
    const c = buildSetCookie('T', { secure: false });
    expect(c).not.toContain('Secure');
    expect(c).not.toContain('Domain=');
  });
});

describe('cookieDomainFor', () => {
  it.each([
    ['spikeretail.com', '.spikeretail.com', '.spikeretail.com'],
    ['www.spikeretail.com', '.spikeretail.com', '.spikeretail.com'],
    ['demo.spikeretail.com', 'spikeretail.com', '.spikeretail.com'],
    ['127.0.0.1', '.spikeretail.com', ''],
    ['localhost', '.spikeretail.com', ''],
    ['x.workers.dev', '.spikeretail.com', ''],
    ['evilspikeretail.com', '.spikeretail.com', ''],
    ['spikeretail.com.evil.com', '.spikeretail.com', ''],
    ['spikeretail.com', '', ''],
    ['spikeretail.com', undefined, ''],
  ])('%s with %j -> %j', (host, configured, out) => {
    expect(cookieDomainFor(host, configured)).toBe(out);
  });
});

describe('isGatedPath', () => {
  it.each([
    ['/demos', true], ['/demos/', true], ['/demos/shelf/', true], ['/demos/shelf/compute.js', true],
    ['/DEMOS/shelf/', true], ['/Demos', true],
    ['/demos%2Fshelf', true], ['/%64emos/shelf', true], ['/demos%2Fshelf%2Fcompute.js', true],
    ['/%E0%A4%A', true], // undecodable: fail closed
    ['/', false], ['/product-tour.html', false], ['/demo-login', false], ['/demoshelf', false],
    ['/demos-old/x', false], ['/index.html', false], ['/site.css', false],
  ])('%s -> %s', (path, gated) => {
    expect(isGatedPath(path)).toBe(gated);
  });
});

describe('safeNext (no open redirect)', () => {
  it.each([
    ['/demos/', '/demos/'],
    ['/demos/shelf/', '/demos/shelf/'],
    ['/demos', '/demos'],
    ['https://demo.spikeretail.com/', 'https://demo.spikeretail.com/'],
    ['https://demo.spikeretail.com/map', 'https://demo.spikeretail.com/map'],
    ['//evil.com', '/demos/'],
    ['/\\evil.com', '/demos/'],
    ['https://evil.com/demos/', '/demos/'],
    ['http://demo.spikeretail.com/', '/demos/'],
    ['https://demo.spikeretail.com.evil.com/', '/demos/'],
    ['https://demo.spikeretail.com@evil.com/', '/demos/'],
    ['/demos/../admin', '/demos/'],
    ['/admin', '/demos/'],
    ['/demosx', '/demos/'],
    ['javascript:alert(1)', '/demos/'],
    ['', '/demos/'], [null, '/demos/'], [undefined, '/demos/'], [{}, '/demos/'],
  ])('%j -> %j', (input, out) => {
    expect(safeNext(input)).toBe(out);
  });
});

describe('loginRedirectUrl', () => {
  it('is relative on the marketing site and absolute from the demo host', () => {
    expect(loginRedirectUrl('', '/demos/shelf/')).toBe('/product-tour.html?demo=1&next=%2Fdemos%2Fshelf%2F');
    expect(loginRedirectUrl('https://spikeretail.com', 'https://demo.spikeretail.com/'))
      .toBe('https://spikeretail.com/product-tour.html?demo=1&next=https%3A%2F%2Fdemo.spikeretail.com%2F');
  });
});

// ---------------------------------------------------------------------------
// The Worker, end to end, with a fake asset binding.
// ---------------------------------------------------------------------------
const makeEnv = (over = {}) => {
  const served = [];
  return {
    served,
    DEMO_PASSWORD: 'kipodtour',
    DEMO_GATE_SECRET: SECRET,
    COOKIE_DOMAIN: '.spikeretail.com',
    ASSETS: { fetch: async (req) => { served.push(new URL(req.url).pathname); return new Response('asset', { headers: { 'Cache-Control': 'public, max-age=60' } }); } },
    ...over,
  };
};
const get = (path, headers = {}) => new Request(`https://spikeretail.com${path}`, { headers });
const login = (body, headers = {}) =>
  new Request('https://spikeretail.com/demo-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://spikeretail.com', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const cookieFrom = (res) => res.headers.get('Set-Cookie').split(';')[0];

describe('worker: gate', () => {
  it.each(['/demos', '/demos/', '/demos/shelf/', '/demos/shelf/compute.js', '/DEMOS/shelf/', '/demos%2Fshelf'])(
    'redirects %s to login without touching assets',
    async (path) => {
      const env = makeEnv();
      const res = await worker.fetch(get(path), env);
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toMatch(/^https:\/\/spikeretail\.com\/product-tour\.html\?demo=1&next=/);
      expect(env.served).toEqual([]);
    },
  );

  it('leaves the public marketing site untouched', async () => {
    const env = makeEnv();
    for (const path of ['/', '/product-tour.html', '/site.css', '/retail-weekly-reports.html']) {
      const res = await worker.fetch(get(path), env);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    }
    expect(env.served).toHaveLength(4);
  });

  it('rejects a cookie signed with a different secret, an expired cookie, and junk', async () => {
    const env = makeEnv();
    const bad = [
      await signToken('other-secret', nowSec + 3600),
      await signToken(SECRET, 1),
      'junk',
    ];
    for (const token of bad) {
      const res = await worker.fetch(get('/demos/', { Cookie: `${COOKIE_NAME}=${token}` }), env);
      expect(res.status).toBe(302);
    }
    expect(env.served).toEqual([]);
  });

  it('fails closed when the gate secret is not configured, even with a plausible cookie', async () => {
    const env = makeEnv({ DEMO_GATE_SECRET: undefined });
    const token = await signToken('anything', Math.floor(Date.now() / 1000) + 3600);
    const res = await worker.fetch(get('/demos/', { Cookie: `${COOKIE_NAME}=${token}` }), env);
    expect(res.status).toBe(302);
    expect(env.served).toEqual([]);
  });
});

describe('worker: login', () => {
  it('a correct password sets the cookie, which then opens /demos with no-store caching', async () => {
    const env = makeEnv();
    const res = await worker.fetch(login({ password: 'Kipod Tour' }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, next: '/demos/' });
    const set = res.headers.get('Set-Cookie');
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/Domain=\.spikeretail\.com/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const page = await worker.fetch(get('/demos/shelf/', { Cookie: cookieFrom(res) }), env);
    expect(page.status).toBe(200);
    expect(page.headers.get('Cache-Control')).toBe('private, no-store');
    expect(env.served).toEqual(['/demos/shelf/']);
  });

  it('returns only a safe next target', async () => {
    const env = makeEnv();
    const ok = await (await worker.fetch(login({ password: 'kipodtour', next: 'https://demo.spikeretail.com/' }), env)).json();
    expect(ok.next).toBe('https://demo.spikeretail.com/');
    const evil = await (await worker.fetch(login({ password: 'kipodtour', next: 'https://evil.com/' }), env)).json();
    expect(evil.next).toBe('/demos/');
  });

  it.each([
    ['wrong password', login({ password: 'nope' }), 401],
    ['missing password field', login({}), 400],
    ['empty password', login({ password: '' }), 401],
    ['invalid JSON', login('{not json'), 400],
    ['oversized body', login({ password: 'x'.repeat(5000) }), 413],
    ['oversized declared length', login({ password: 'x' }, { 'Content-Length': '999999' }), 413],
    ['JSON null body', login('null'), 400],
    ['JSON array body', login('[]'), 400],
    ['JSON string body', login('"kipodtour"'), 400],
    ['JSON number body', login('42'), 400],
    ['object password', login({ password: { a: 1 } }), 400],
    ['array password (would stringify to the right one)', login({ password: ['kipodtour'] }), 400],
    ['numeric password', login({ password: 42 }), 400],
    ['cross-origin post', login({ password: 'kipodtour' }, { Origin: 'https://evil.com' }), 403],
  ])('%s', async (_n, req, status) => {
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(status);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('only accepts POST', async () => {
    const res = await worker.fetch(get('/demo-login'), makeEnv());
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });

  it.each([
    ['no password configured', { DEMO_PASSWORD: undefined }],
    ['no signing secret configured', { DEMO_GATE_SECRET: undefined }],
  ])('%s: refuses to log anyone in', async (_n, over) => {
    const res = await worker.fetch(login({ password: 'kipodtour' }), makeEnv(over));
    expect(res.status).toBe(503);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('a request with no Origin header (non-browser client) is still checked on the password', async () => {
    const req = new Request('https://spikeretail.com/demo-login', { method: 'POST', body: JSON.stringify({ password: 'nope' }) });
    expect((await worker.fetch(req, makeEnv())).status).toBe(401);
  });

  it('a cookie is host-only and not Secure on plain-http local dev, even if a parent domain is configured', async () => {
    const env = makeEnv({ COOKIE_DOMAIN: '.spikeretail.com' });
    const req = new Request('http://localhost:8787/demo-login', {
      method: 'POST', headers: { Origin: 'http://localhost:8787' }, body: JSON.stringify({ password: 'kipodtour' }),
    });
    const set = (await worker.fetch(req, env)).headers.get('Set-Cookie');
    expect(set).not.toMatch(/Secure/);
    expect(set).not.toMatch(/Domain=/);
  });
});

describe('session length', () => {
  it('is four hours, both in the cookie lifetime and in the signed expiry', async () => {
    expect(COOKIE_TTL_SECONDS).toBe(4 * 60 * 60);
    const res = await worker.fetch(login({ password: 'kipodtour' }), makeEnv());
    expect(res.headers.get('Set-Cookie')).toContain(`Max-Age=${4 * 60 * 60}`);
    const token = res.headers.get('Set-Cookie').split(';')[0].split('=')[1];
    const exp = Number(token.split('.')[1]);
    const nowS = Math.floor(Date.now() / 1000);
    expect(exp - nowS).toBeGreaterThan(4 * 60 * 60 - 5);
    expect(exp - nowS).toBeLessThanOrEqual(4 * 60 * 60);
    // and the token really does stop working after that
    expect(await verifyToken(SECRET, token, exp + 1)).toBe(false);
    expect(await verifyToken(SECRET, token, nowS)).toBe(true);
  });
});

describe('worker: logout', () => {
  const logout = (headers = {}, method = 'POST') =>
    new Request('https://spikeretail.com/demo-logout', { method, headers: { Origin: 'https://spikeretail.com', ...headers } });

  it('clears the shared cookie with the same scope it was issued with', async () => {
    const res = await worker.fetch(logout(), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const set = res.headers.get('Set-Cookie');
    expect(set).toMatch(new RegExp(`^${COOKIE_NAME}=;`));
    for (const attr of ['Max-Age=0', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Domain=.spikeretail.com']) {
      expect(set).toContain(attr);
    }
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('after signing in then out, the next request to /demos is sent back to sign in', async () => {
    const env = makeEnv();
    const signedIn = cookieFrom(await worker.fetch(login({ password: 'kipodtour' }), env));
    expect((await worker.fetch(get('/demos/', { Cookie: signedIn }), env)).status).toBe(200);
    // the browser now holds the cleared (empty) cookie
    const cleared = cookieFrom(await worker.fetch(logout({ Cookie: signedIn }), env));
    expect(cleared).toBe(`${COOKIE_NAME}=`);
    expect((await worker.fetch(get('/demos/', { Cookie: cleared }), env)).status).toBe(302);
  });

  it('works for a visitor with no cookie and even when the gate secrets are not configured', async () => {
    const res = await worker.fetch(logout(), makeEnv({ DEMO_GATE_SECRET: undefined, DEMO_PASSWORD: undefined }));
    expect(res.status).toBe(200);
  });

  it.each([
    ['GET', () => logout({}, 'GET'), 405],
    ['PUT', () => new Request('https://spikeretail.com/demo-logout', { method: 'PUT' }), 405],
    ['a cross-site POST (cannot sign someone else out)', () => logout({ Origin: 'https://evil.com' }), 403],
  ])('%s is refused', async (_n, make, status) => {
    const res = await worker.fetch(make(), makeEnv());
    expect(res.status).toBe(status);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('is host-only and not Secure on plain-http local dev, like login', async () => {
    const req = new Request('http://localhost:8787/demo-logout', { method: 'POST', headers: { Origin: 'http://localhost:8787' } });
    const set = (await worker.fetch(req, makeEnv({ COOKIE_DOMAIN: '.spikeretail.com' }))).headers.get('Set-Cookie');
    expect(set).not.toMatch(/Secure/);
    expect(set).not.toMatch(/Domain=/);
    expect(set).toContain('Max-Age=0');
  });
});

describe('worker: preview deployment keeps its Basic auth', () => {
  const basic = (pw) => `Basic ${btoa(`preview:${pw}`)}`;
  it('challenges pages without credentials, lets them through with, and exempts static assets', async () => {
    const env = makeEnv({ PREVIEW_BASIC_AUTH: '1', PREVIEW_PASSWORD: 'pw' });
    expect((await worker.fetch(get('/'), env)).status).toBe(401);
    expect((await worker.fetch(get('/', { Authorization: basic('wrong') }), env)).status).toBe(401);
    expect((await worker.fetch(get('/', { Authorization: basic('pw') }), env)).status).toBe(200);
    expect((await worker.fetch(get('/site.css'), env)).status).toBe(200);
  });
  it('production (no flag, no preview secret) does not require Basic auth on public pages', async () => {
    const res = await worker.fetch(get('/'), makeEnv());
    expect(res.status).toBe(200);
  });
  it('fails closed: the preview secret alone (flag var missing) still enforces Basic auth', async () => {
    const env = makeEnv({ PREVIEW_PASSWORD: 'pw' });
    expect((await worker.fetch(get('/'), env)).status).toBe(401);
    expect((await worker.fetch(get('/', { Authorization: basic('pw') }), env)).status).toBe(200);
  });
  it('the flag alone with no password set challenges everyone, including "preview:undefined"', async () => {
    const env = makeEnv({ PREVIEW_BASIC_AUTH: '1' });
    expect((await worker.fetch(get('/'), env)).status).toBe(401);
    expect((await worker.fetch(get('/', { Authorization: `Basic ${btoa('preview:undefined')}` }), env)).status).toBe(401);
    expect((await worker.fetch(get('/', { Authorization: `Basic ${btoa('preview:')}` }), env)).status).toBe(401);
  });
  it('the demo gate still applies in preview, even to static-looking demo assets', async () => {
    const env = makeEnv({ PREVIEW_BASIC_AUTH: '1', PREVIEW_PASSWORD: 'pw' });
    const res = await worker.fetch(get('/demos/shelf/compute.js'), env);
    expect(res.status).toBe(302);
  });
});
