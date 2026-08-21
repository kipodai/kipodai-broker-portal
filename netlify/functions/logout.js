import { json, isLocalRequest } from './_shared/http.js';
import { buildClearCookieHeader } from '../../server/auth.js';

export default async (req) => {
  const cookie = buildClearCookieHeader({ secure: !isLocalRequest(req) });
  return json(200, { ok: true }, { 'set-cookie': cookie });
};
