// Pure parsing module for the three weekly ABI Studio exports.
// No Netlify runtime dependency — importable directly by Vitest and by
// netlify/functions/upload.js.
//
// SheetJS (xlsx) is mandated over strict parsers because two of the three
// real source files carry malformed stylesheet XML (invalid aRGB color
// values) that crashes strict parsers. SheetJS ignores styles entirely.

import * as XLSX from 'xlsx';

export class ParseValidationError extends Error {
  constructor(message, { file = null, detail = null } = {}) {
    super(message);
    this.name = 'ParseValidationError';
    this.file = file;
    this.detail = detail;
  }
}

const EXPECTED_HEADERS_A = [
  'WM Week', 'POS $', 'POS $ LY', 'POS $ %Chg vs LY', 'POS Qty', 'POS Qty LY',
  'POS Qty %Chg vs LY', 'U/S/W (Valid Store)', 'U/S/W LY (Valid Store)',
  'U/S/W %Chg vs LY (Valid Store)', '$/S/W (Valid Store)', '$/S/W LY (Valid Store)',
  '$/S/W %Chg vs LY (Valid Store)', 'Traited Store Count', 'Traited Store Count LY',
  'Traited Str Cnt %Chg vs LY', 'Valid Store Count', 'Valid Store Count LY',
  'Valid Str Cnt %Chg vs LY', 'POS Store Count', 'POS Store Count LY',
  'POS Str Cnt %Chg vs LY', 'U/S/W (POS Stores)', 'U/S/W LY (POS Stores)',
  'U/S/W %Chg vs LY (POS Stores)', '$/S/W (POS Stores)', '$/S/W LY (POS Stores)',
  '$/S/W %Chg vs LY (POS Stores)', 'Avg Retail', 'Avg Retail LY', 'Avg Retail %Chg vs LY',
  'Instock %', 'Instock % LY', 'Instock % Chg', 'Repl.Instock %', 'Repl.Instock % LY',
  'Repl.Instock %Chg vs LY', 'Store Wks OH', 'Store Wks OH LY', 'Store Wks OH %Chg vs LY',
  'Warehouse Wks OH', 'Warehouse Wks OH LY', 'Whse Wks OH %Chg vs LY', 'MUMD $', 'MUMD $ LY',
  'MUMD Sales %Chg vs LY', 'MUMD Qty', 'MUMD Qty LY', 'MUMD Qty %Chg vs LY',
];

const EXPECTED_HEADERS_B = [
  'Week', 'On Time %', 'On Time % LY', 'In Full %', 'In Full % LY',
  'Collect Ready %', 'Collect Ready % LY', 'Over Filled %', 'Over Filled % LY',
];

// File C's column set can vary ("possibly more") — only State is mandatory.
const REQUIRED_HEADERS_C = ['State'];

const FILENAME_SUBSTRINGS = {
  weeklyTrends: 'Weekly_Trends',
  trendAnalysis: 'Trend_Analysis',
  geoPerformance: 'Geo_Performance',
};

const HEADER_ANCHORS = {
  weeklyTrends: 'WM Week',
  trendAnalysis: 'Week',
  geoPerformance: 'State',
};

function cellToString(cell) {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

function sheetToMatrix(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
}

// Finds the row that contains `anchorHeader` as one of its cells, searching
// only the first few rows (headers are on row 1 or row 2 in every known
// format; this bound also stops a stray data value from matching by luck).
function findHeaderRowIndex(matrix, anchorHeader) {
  const searchDepth = Math.min(matrix.length, 5);
  for (let i = 0; i < searchDepth; i++) {
    const row = matrix[i] || [];
    if (row.some((cell) => cellToString(cell) === anchorHeader)) {
      return i;
    }
  }
  return -1;
}

function coerceNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

// Walmart fiscal week format YYYYWW. Values sometimes arrive as float-like
// strings ("202528.0") — truncate to an integer string, never coerce to 0.
function normalizeWeek(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Math.trunc(Number(value));
  if (Number.isNaN(n)) return null;
  return String(n);
}

function isBlankRow(row) {
  return !row || row.every((c) => c === '' || c === null || c === undefined);
}

function rowsFromMatrix(matrix, headerRowIdx) {
  const headers = (matrix[headerRowIdx] || []).map(cellToString);
  const rows = [];
  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const raw = matrix[i];
    if (isBlankRow(raw)) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (!h) return; // ignore unlabeled/empty columns
      obj[h] = raw[idx] !== undefined ? raw[idx] : '';
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function assertHeadersPresent(headers, expected, fileLabel) {
  const missing = expected.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new ParseValidationError(
      `${fileLabel}: missing expected column(s): ${missing.join(', ')}`,
      { file: fileLabel, detail: { missing } },
    );
  }
}

export function parseWeeklyTrends(buffer) {
  const matrix = sheetToMatrix(buffer);
  const headerRowIdx = findHeaderRowIndex(matrix, HEADER_ANCHORS.weeklyTrends);
  if (headerRowIdx === -1) {
    throw new ParseValidationError(
      'Weekly_Trends file: could not find the header row (expected a "WM Week" column in the first few rows).',
      { file: 'Weekly_Trends' },
    );
  }
  const { headers, rows } = rowsFromMatrix(matrix, headerRowIdx);
  assertHeadersPresent(headers, EXPECTED_HEADERS_A, 'Weekly_Trends');

  return rows.map((row) => {
    const out = { 'WM Week': normalizeWeek(row['WM Week']) };
    for (const h of EXPECTED_HEADERS_A) {
      if (h === 'WM Week') continue;
      out[h] = coerceNumber(row[h]);
    }
    return out;
  }).filter((row) => row['WM Week'] !== null);
}

export function parseTrendAnalysis(buffer) {
  const matrix = sheetToMatrix(buffer);
  const headerRowIdx = findHeaderRowIndex(matrix, HEADER_ANCHORS.trendAnalysis);
  if (headerRowIdx === -1) {
    throw new ParseValidationError(
      'Trend_Analysis file: could not find the header row (expected a "Week" column in the first few rows).',
      { file: 'Trend_Analysis' },
    );
  }
  const { headers, rows } = rowsFromMatrix(matrix, headerRowIdx);
  assertHeadersPresent(headers, EXPECTED_HEADERS_B, 'Trend_Analysis');

  return rows.map((row) => {
    const out = { Week: normalizeWeek(row.Week) };
    for (const h of EXPECTED_HEADERS_B) {
      if (h === 'Week') continue;
      out[h] = coerceNumber(row[h]); // blank LY cells correctly become null, never 0
    }
    return out;
  }).filter((row) => row.Week !== null);
}

export function parseGeoPerformance(buffer) {
  const matrix = sheetToMatrix(buffer);
  const headerRowIdx = findHeaderRowIndex(matrix, HEADER_ANCHORS.geoPerformance);
  if (headerRowIdx === -1) {
    throw new ParseValidationError(
      'Geo_Performance file: could not find the header row (expected a "State" column in the first few rows).',
      { file: 'Geo_Performance' },
    );
  }
  const { headers, rows } = rowsFromMatrix(matrix, headerRowIdx);
  assertHeadersPresent(headers, REQUIRED_HEADERS_C, 'Geo_Performance');

  const parsedRows = rows
    .filter((row) => cellToString(row.State) !== '')
    .map((row) => {
      const out = { State: cellToString(row.State) };
      for (const h of headers) {
        if (!h || h === 'State') continue;
        out[h] = coerceNumber(row[h]);
      }
      return out;
    });

  const isGrandTotal = (state) => state.toLowerCase().startsWith('grand total');
  const grandTotal = parsedRows.find((row) => isGrandTotal(row.State)) || null;
  const states = parsedRows.filter((row) => !isGrandTotal(row.State));

  return { states, grandTotal };
}

function classifyByFilename(filename) {
  for (const [type, substring] of Object.entries(FILENAME_SUBSTRINGS)) {
    if (filename.includes(substring)) return type;
  }
  return null;
}

function classifyByHeaderContent(buffer) {
  const matrix = sheetToMatrix(buffer);
  for (const [type, anchor] of Object.entries(HEADER_ANCHORS)) {
    if (findHeaderRowIndex(matrix, anchor) !== -1) {
      // WM Week and Week could both technically match on a loose contains
      // check; anchors are compared for exact cell equality, and 'WM Week'
      // is checked implicitly first since Object.entries order is stable
      // and weeklyTrends is declared first — a Trend_Analysis sheet has no
      // 'WM Week' cell, so this is unambiguous in practice.
      return type;
    }
  }
  return null;
}

// Parses the three uploaded files together. `files` is an array of
// { filename: string, buffer: Buffer }. Throws ParseValidationError with a
// human-readable message on any validation failure — callers must never
// publish a partial report from a caught error.
export function parseUploadedFiles(files) {
  if (!Array.isArray(files) || files.length !== 3) {
    throw new ParseValidationError(
      `Expected exactly 3 files (Weekly_Trends, Trend_Analysis, Geo_Performance) — received ${files?.length ?? 0}.`,
    );
  }

  const byType = {};
  for (const file of files) {
    let type = classifyByFilename(file.filename);
    if (!type) type = classifyByHeaderContent(file.buffer);
    if (!type) {
      throw new ParseValidationError(
        `Could not identify "${file.filename}" as Weekly_Trends, Trend_Analysis, or Geo_Performance — check the filename and header row.`,
        { file: file.filename },
      );
    }
    if (byType[type]) {
      throw new ParseValidationError(
        `Received two files that both look like ${type} (e.g. "${byType[type].filename}" and "${file.filename}") — upload one of each type.`,
        { file: file.filename },
      );
    }
    byType[type] = file;
  }

  const missingTypes = Object.keys(FILENAME_SUBSTRINGS).filter((t) => !byType[t]);
  if (missingTypes.length > 0) {
    throw new ParseValidationError(
      `Missing required file(s): ${missingTypes.join(', ')}. All three files must be uploaded together.`,
      { detail: { missingTypes } },
    );
  }

  const weeklyTrends = parseWeeklyTrends(byType.weeklyTrends.buffer);
  const trendAnalysis = parseTrendAnalysis(byType.trendAnalysis.buffer);
  const geoPerformance = parseGeoPerformance(byType.geoPerformance.buffer);

  if (weeklyTrends.length < 4) {
    throw new ParseValidationError(
      `Weekly_Trends: found only ${weeklyTrends.length} week(s) of data — need at least 4 to compute L4W/P4W metrics.`,
      { file: 'Weekly_Trends' },
    );
  }

  return { weeklyTrends, trendAnalysis, geoPerformance };
}
