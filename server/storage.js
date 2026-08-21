// Cloudflare KV wrapper. One JSON document per report week
// (key: `report-<week>`) plus one `index` document listing available weeks.
// No database, per spec.
//
// Unlike Netlify Blobs (ambient credentials, no explicit binding needed),
// KV has no ambient equivalent — every function here takes the bound
// namespace object (`kv`, e.g. a Pages Function's `context.env.REPORTS_KV`)
// as its first argument. KV is eventually consistent (edge propagation up
// to ~60s) — a non-issue at this app's once-a-week publish cadence.

const INDEX_KEY = 'index';
const RECIPIENTS_KEY = 'email-recipients';

function reportKey(week) {
  return `report-${week}`;
}

export async function getReport(kv, week) {
  return (await kv.get(reportKey(week), 'json')) || null;
}

async function readIndex(kv) {
  return (await kv.get(INDEX_KEY, 'json')) || { weeks: [] };
}

async function addToIndex(kv, week) {
  const index = await readIndex(kv);
  if (!index.weeks.includes(week)) {
    index.weeks.push(week);
  }
  await kv.put(INDEX_KEY, JSON.stringify(index));
}

async function removeFromIndex(kv, week) {
  const index = await readIndex(kv);
  index.weeks = index.weeks.filter((w) => w !== week);
  await kv.put(INDEX_KEY, JSON.stringify(index));
}

// Publishing overwrites that week's report if re-uploaded, per spec.
export async function saveReport(kv, week, reportDoc) {
  await kv.put(reportKey(week), JSON.stringify(reportDoc));
  await addToIndex(kv, week);
}

export async function deleteReport(kv, week) {
  await kv.delete(reportKey(week));
  await removeFromIndex(kv, week);
}

// Newest first (numeric week descending).
export async function listReportWeeks(kv) {
  const index = await readIndex(kv);
  return [...index.weeks].sort((a, b) => Number(b) - Number(a));
}

export async function getLatestReport(kv) {
  const weeks = await listReportWeeks(kv);
  if (weeks.length === 0) return null;
  return getReport(kv, weeks[0]);
}

// The admin-editable recipient list, stored in KV. Once an admin saves an
// edit here, this becomes the source of truth in place of the
// CLIENT_EMAIL_RECIPIENTS env var (which still seeds the list the first
// time, before any edit has ever been saved) — see CLAUDE.md's email
// recipient rule: the Send dialog must only ever offer checkboxes against
// this stored list, never a free-text field.
export async function getStoredRecipients(kv) {
  return await kv.get(RECIPIENTS_KEY, 'json');
}

export async function saveStoredRecipients(kv, recipients) {
  await kv.put(RECIPIENTS_KEY, JSON.stringify(recipients));
}

export async function appendSendLog(kv, week, logEntry) {
  const report = await getReport(kv, week);
  if (!report) throw new Error(`Cannot log send: report ${week} not found.`);
  report.sendLog = report.sendLog || [];
  report.sendLog.push(logEntry);
  await kv.put(reportKey(week), JSON.stringify(report));
  return report;
}
