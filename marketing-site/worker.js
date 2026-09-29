const unauthorized = () => new Response('This KipodAI preview is private.', {
  status: 401,
  headers: {
    'WWW-Authenticate': 'Basic realm="KipodAI preview", charset="UTF-8"',
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=UTF-8'
  }
});

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const isStaticAsset = /\.(?:css|js|png|jpe?g|svg|ico|woff2?|mp4|webm|srt)$/i.test(pathname);
    const expected = `Basic ${btoa(`preview:${env.PREVIEW_PASSWORD}`)}`;
    // Browsers do not reliably replay Basic Auth credentials for every
    // stylesheet, script, and image request. Keep pages protected while
    // letting their non-sensitive presentation assets load normally.
    if (!isStaticAsset && request.headers.get('Authorization') !== expected) return unauthorized();
    return env.ASSETS.fetch(request);
  }
};
