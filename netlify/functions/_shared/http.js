// Shared HTTP helpers for Netlify Functions (v2, Web Request/Response API).
// Filename prefixed folder (_shared) so Netlify doesn't register it as a route.

export function json(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

export function isLocalRequest(req) {
  const host = req.headers.get('host') || '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}
