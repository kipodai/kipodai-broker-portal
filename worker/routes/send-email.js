import { json } from '../../server/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { getReport, appendSendLog } from '../../server/storage.js';
import { sendReportEmail } from '../../server/email.js';
import { getEffectiveRecipients } from '../../server/recipients.js';

export async function handleSendEmail(request, env) {
  const secret = env.SESSION_SECRET;
  const auth = await requireRole(request.headers.get('cookie'), secret, [ROLES.ADMIN]);
  if (!auth.ok) return json(auth.status, { error: auth.error });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return json(200, { sent: false, reason: 'not_configured' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const { week, recipients } = body || {};
  if (!week || !Array.isArray(recipients) || recipients.length === 0) {
    return json(400, { error: 'week and a non-empty recipients array are required.' });
  }

  // Recipients must come only from the pre-approved list (KV-stored if an
  // admin has edited it, else the CLIENT_EMAIL_RECIPIENTS env seed) — never
  // free text, even if the frontend UI is bypassed via direct API call.
  const allowed = await getEffectiveRecipients(env.REPORTS_KV, env.CLIENT_EMAIL_RECIPIENTS);
  const invalid = recipients.filter((r) => !allowed.includes(r));
  if (invalid.length > 0) {
    return json(400, { error: `Recipient(s) not in the pre-approved list: ${invalid.join(', ')}` });
  }

  const report = await getReport(env.REPORTS_KV, week);
  if (!report) return json(404, { error: `No report found for week ${week}.` });

  const fromAddress = env.EMAIL_FROM_ADDRESS;
  if (!fromAddress) {
    return json(500, { error: 'EMAIL_FROM_ADDRESS is not configured.' });
  }

  const url = new URL(request.url);
  const portalUrl = `${url.protocol}//${url.host}/report/${week}`;

  try {
    await sendReportEmail({ report, recipients, apiKey, fromAddress, portalUrl });
    const updated = await appendSendLog(env.REPORTS_KV, week, {
      timestamp: new Date().toISOString(),
      recipients,
      sentBy: auth.session.role,
    });
    return json(200, { sent: true, sendLog: updated.sendLog });
  } catch (err) {
    return json(502, { error: `Failed to send email: ${err.message}` });
  }
}
