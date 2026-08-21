// Shared HTTP helpers for Cloudflare Pages Functions (Web Request/Response
// API — same platform classes Netlify Functions v2 used, so this file is
// unchanged from its Netlify-era version aside from its location).

export function json(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

export function isLocalRequest(request) {
  const host = request.headers.get('host') || '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}
