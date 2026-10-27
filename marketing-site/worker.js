import { handleLogin, handleLogout, hasValidGateCookie, isGatedPath, loginRedirectUrl } from './gate.js';

const unauthorized = () => new Response('This Spike Retail preview is private.', {
  status: 401,
  headers: {
    'WWW-Authenticate': 'Basic realm="Spike Retail preview", charset="UTF-8"',
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=UTF-8'
  }
});

// The site moved from kipodai.com to spikeretail.com. The old hosts stay bound
// to this Worker only to send visitors on, keeping the path and query.
const CANONICAL_HOST = 'spikeretail.com';
const LEGACY_HOSTS = new Set(['kipodai.com', 'www.kipodai.com', 'www.spikeretail.com']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (LEGACY_HOSTS.has(url.hostname)) {
      return Response.redirect(`https://${CANONICAL_HOST}${pathname}${url.search}`, 301);
    }

    // Preview deployment: the whole site sits behind Basic auth. It is on when
    // the config var PREVIEW_BASIC_AUTH is set (wrangler.jsonc) OR the
    // PREVIEW_PASSWORD secret exists. A secret survives deploys and dashboard
    // edits, so dropping the var can never open the preview. Production sets
    // neither.
    if (env.PREVIEW_BASIC_AUTH || env.PREVIEW_PASSWORD) {
      const isStaticAsset = /\.(?:css|js|png|jpe?g|svg|ico|woff2?|mp4|webm|srt)$/i.test(pathname);
      const expected = `Basic ${btoa(`preview:${env.PREVIEW_PASSWORD}`)}`;
      // Browsers do not reliably replay Basic Auth credentials for every
      // stylesheet, script, and image request. Keep pages protected while
      // letting their non-sensitive presentation assets load normally.
      // No password configured means nobody gets in (never "preview:undefined").
      if (!isStaticAsset && (!env.PREVIEW_PASSWORD || request.headers.get('Authorization') !== expected)) return unauthorized();
    }

    if (pathname === '/demo-login') return handleLogin(request, env);
    if (pathname === '/demo-logout') return handleLogout(request, env);

    // Everything under /demos is private. The public marketing pages fall
    // straight through to static assets unchanged.
    if (isGatedPath(pathname)) {
      if (!(await hasValidGateCookie(request, env))) {
        return Response.redirect(new URL(loginRedirectUrl('', pathname), url).href, 302);
      }
      const res = await env.ASSETS.fetch(request);
      const gated = new Response(res.body, res);
      gated.headers.set('Cache-Control', 'private, no-store');
      return gated;
    }

    return env.ASSETS.fetch(request);
  }
};
