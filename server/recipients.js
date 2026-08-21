// Resolves the current pre-approved email recipient list: the KV-stored
// list (server/storage.js getStoredRecipients) if an admin has ever saved
// one, otherwise falls back to the CLIENT_EMAIL_RECIPIENTS env var as the
// initial seed. This is the ONLY function that should be used to determine
// "is this address allowed" — both email-config.js (what the Send dialog
// offers) and send-email.js (what it actually accepts) must call it, so
// they can never drift apart.

import { getStoredRecipients } from './storage.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

export function normalizeRecipients(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const email = String(raw).trim().toLowerCase();
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function envSeedRecipients(clientEmailRecipientsEnvVar) {
  return normalizeRecipients((clientEmailRecipientsEnvVar || '').split(','));
}

export async function getEffectiveRecipients(kv, clientEmailRecipientsEnvVar) {
  const stored = await getStoredRecipients(kv);
  if (stored && Array.isArray(stored.recipients)) return stored.recipients;
  return envSeedRecipients(clientEmailRecipientsEnvVar);
}
