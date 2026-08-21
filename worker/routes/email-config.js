import { json } from '../../server/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { getEffectiveRecipients } from '../../server/recipients.js';

// Admin-only: tells the upload/report UI whether email sending is
// configured and what the pre-approved recipient list is, so the admin can
// only ever select from it — never type a free-text address.
export async function handleEmailConfig(request, env) {
  const secret = env.SESSION_SECRET;
  const auth = await requireRole(request.headers.get('cookie'), secret, [ROLES.ADMIN]);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const configured = Boolean(env.RESEND_API_KEY);
  const recipients = await getEffectiveRecipients(env.REPORTS_KV, env.CLIENT_EMAIL_RECIPIENTS);

  return json(200, { configured, recipients });
}
