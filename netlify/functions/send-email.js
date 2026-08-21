import { json } from './_shared/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { getReport, appendSendLog } from '../../server/storage.js';
import { sendReportEmail } from '../../server/email.js';
import { getEffectiveRecipients } from '../../server/recipients.js';

export default async (req) => {
  const secret = process.env.SESSION_SECRET;
  const auth = requireRole(req.headers.get('cookie'), secret, [ROLES.ADMIN]);
  if (!auth.ok) return json(auth.status, { error: auth.error });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return json(200, { sent: false, reason: 'not_configured' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const { week, recipients } = body || {};
  if (!week || !Array.isArray(recipients) || recipients.length === 0) {
    return json(400, { error: 'week and a non-empty recipients array are required.' });
  }

  // Recipients must come only from the pre-approved list (Blobs-stored if
  // an admin has edited it, else the CLIENT_EMAIL_RECIPIENTS env seed) —
  // never free text, even if the frontend UI is bypassed via direct API call.
  const allowed = await getEffectiveRecipients();
  const invalid = recipients.filter((r) => !allowed.includes(r));
  if (invalid.length > 0) {
    return json(400, { error: `Recipient(s) not in the pre-approved list: ${invalid.join(', ')}` });
  }

  const report = await getReport(week);
  if (!report) return json(404, { error: `No report found for week ${week}.` });

  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  if (!fromAddress) {
    return json(500, { error: 'EMAIL_FROM_ADDRESS is not configured.' });
  }

  const url = new URL(req.url);
  const portalUrl = `${url.protocol}//${url.host}/report/${week}`;

  try {
    await sendReportEmail({ report, recipients, apiKey, fromAddress, portalUrl });
    const updated = await appendSendLog(week, {
      timestamp: new Date().toISOString(),
      recipients,
      sentBy: auth.session.role,
    });
    return json(200, { sent: true, sendLog: updated.sendLog });
  } catch (err) {
    return json(502, { error: `Failed to send email: ${err.message}` });
  }
};
