import { json } from './_shared/http.js';
import { requireRole, ROLES } from '../../server/auth.js';
import { parseUploadedFiles, ParseValidationError } from '../../server/parser.js';
import { computeMetrics } from '../../server/metrics.js';
import { generateNarrative } from '../../server/narrative.js';
import { saveReport, getReport } from '../../server/storage.js';

// mode=preview: validate + compute + generate narrative, return without
// storing. mode=publish: same, then store (overwriting that week if it
// already exists). The admin UI calls this twice with the same files —
// once to preview, once (after explicit confirmation) to publish.
export default async (req) => {
  const secret = process.env.SESSION_SECRET;
  const auth = requireRole(req.headers.get('cookie'), secret, [ROLES.ADMIN]);
  if (!auth.ok) return json(auth.status, { error: auth.error });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return json(400, { error: 'Expected multipart/form-data with a "files" field containing 3 or 4 files.' });
  }

  const mode = formData.get('mode') === 'publish' ? 'publish' : 'preview';
  const fileEntries = formData.getAll('files');
  if (fileEntries.length !== 3 && fileEntries.length !== 4) {
    return json(400, { error: `Expected 3 files, or 4 including the optional item-level file, received ${fileEntries.length}.` });
  }

  const files = [];
  for (const entry of fileEntries) {
    if (typeof entry === 'string' || !entry.arrayBuffer) {
      return json(400, { error: 'Malformed file upload — expected file parts.' });
    }
    files.push({ filename: entry.name, buffer: Buffer.from(await entry.arrayBuffer()) });
  }

  let parsed;
  try {
    parsed = parseUploadedFiles(files);
  } catch (err) {
    if (err instanceof ParseValidationError) {
      return json(422, { error: err.message, file: err.file });
    }
    return json(500, { error: 'Unexpected error while parsing the uploaded files.' });
  }

  const metrics = computeMetrics(parsed);
  const narrative = await generateNarrative(metrics, { apiKey: process.env.ANTHROPIC_API_KEY });

  if (mode === 'preview') {
    return json(200, { mode, metrics, narrative });
  }

  const existing = await getReport(metrics.currentWeek);
  const report = {
    week: metrics.currentWeek,
    metrics,
    narrative,
    generatedAt: new Date().toISOString(),
    sendLog: existing?.sendLog || [],
  };
  await saveReport(metrics.currentWeek, report);

  return json(200, { mode, report });
};
