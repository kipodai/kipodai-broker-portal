// Netlify Blobs wrapper. One JSON document per report week
// (key: `report-<week>`) plus one `index` document listing available weeks.
// No database, per spec.

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'broker-portal-reports';
const INDEX_KEY = 'index';

function store() {
  return getStore(STORE_NAME);
}

function reportKey(week) {
  return `report-${week}`;
}

export async function getReport(week) {
  return (await store().get(reportKey(week), { type: 'json' })) || null;
}

async function readIndex() {
  return (await store().get(INDEX_KEY, { type: 'json' })) || { weeks: [] };
}

async function addToIndex(week) {
  const s = store();
  const index = await readIndex();
  if (!index.weeks.includes(week)) {
    index.weeks.push(week);
  }
  await s.setJSON(INDEX_KEY, index);
}

async function removeFromIndex(week) {
  const s = store();
  const index = await readIndex();
  index.weeks = index.weeks.filter((w) => w !== week);
  await s.setJSON(INDEX_KEY, index);
}

// Publishing overwrites that week's report if re-uploaded, per spec.
export async function saveReport(week, reportDoc) {
  await store().setJSON(reportKey(week), reportDoc);
  await addToIndex(week);
}

export async function deleteReport(week) {
  await store().delete(reportKey(week));
  await removeFromIndex(week);
}

// Newest first (numeric week descending).
export async function listReportWeeks() {
  const index = await readIndex();
  return [...index.weeks].sort((a, b) => Number(b) - Number(a));
}

export async function getLatestReport() {
  const weeks = await listReportWeeks();
  if (weeks.length === 0) return null;
  return getReport(weeks[0]);
}

export async function appendSendLog(week, logEntry) {
  const report = await getReport(week);
  if (!report) throw new Error(`Cannot log send: report ${week} not found.`);
  report.sendLog = report.sendLog || [];
  report.sendLog.push(logEntry);
  await store().setJSON(reportKey(week), report);
  return report;
}
