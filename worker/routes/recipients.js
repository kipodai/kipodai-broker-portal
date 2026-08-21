import { json } from '../../server/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { getEffectiveRecipients, normalizeRecipients } from '../../server/recipients.js';
import { saveStoredRecipients } from '../../server/storage.js';

// Admin-only settings endpoint: view/edit the pre-approved recipient list.
// This is the ONLY place the list can be changed — send-email.js still
// independently re-validates against the same getEffectiveRecipients() on
// every send, so this endpoint can't be used to bypass that check, only to
// change what it checks against.
export async function handleRecipients(request, env) {
  const secret = env.SESSION_SECRET;
  const auth = await requireRole(request.headers.get('cookie'), secret, [ROLES.ADMIN]);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  if (request.method === 'GET') {
    const recipients = await getEffectiveRecipients(env.REPORTS_KV, env.CLIENT_EMAIL_RECIPIENTS);
    return json(200, { recipients });
  }

  if (request.method === 'PUT') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'Invalid JSON body.' });
    }
    if (!Array.isArray(body?.recipients)) {
      return json(400, { error: 'recipients must be an array of email addresses.' });
    }
    const normalized = normalizeRecipients(body.recipients);
    const invalidInput = body.recipients.filter((r) => !normalized.includes(String(r).trim().toLowerCase()));
    if (invalidInput.length > 0) {
      return json(400, { error: `Not a valid email address: ${invalidInput.join(', ')}` });
    }
    await saveStoredRecipients(env.REPORTS_KV, { recipients: normalized });
    return json(200, { recipients: normalized });
  }

  return json(405, { error: 'Method not allowed.' });
}
