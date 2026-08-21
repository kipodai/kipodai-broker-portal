// Pure parsing module for the three weekly ABI Studio exports, plus an
// optional 4th item-level export.
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

// File D (item-level "Sales_Performance") is optional — a 4th file, added
// alongside the original three. Its column set is a two-row compound header
// (metric name x period), so it needs bespoke parsing rather than the
// single-header-row helpers above. Only these 3 identity columns are
// required; the periodized metric columns are captured dynamically by
// whatever's actually present, same "parse by header name" tolerance as
// File C, since the metric/period set has already changed once (a YTD
// period was added) between when this file type was first scoped and when
// the real export arrived.
const REQUIRED_ID_HEADERS_D = ['Prime Item Nbr', 'Prime Item Desc', 'UPC'];

const FILENAME_SUBSTRINGS = {
  weeklyTrends: 'Weekly_Trends',
  trendAnalysis: 'Trend_Analysis',
  geoPerformance: 'Geo_Performance',
  itemPerformance: 'Sales_Performance',
};

const DISPLAY_NAMES = {
  weeklyTrends: 'Weekly_Trends',
  trendAnalysis: 'Trend_Analysis',
  geoPerformance: 'Geo_Performance',
  itemPerformance: 'Sales_Performance',
};

const HEADER_ANCHORS = {
  weeklyTrends: 'WM Week',
  trendAnalysis: 'Week',
  geoPerformance: 'State',
  itemPerformance: 'Prime Item Nbr',
};

// The 4th file is optional; these three are not.
const REQUIRED_TYPES = ['weeklyTrends', 'trendAnalysis', 'geoPerformance'];

function cellToString(cell) {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

// `data` is any Uint8Array (a Node Buffer qualifies, since Buffer extends
// Uint8Array) — using { type: 'array' } rather than { type: 'buffer' } keeps
// this portable to runtimes with no Buffer global (e.g. Cloudflare Workers).
function sheetToMatrix(data) {
  const workbook = XLSX.read(data, { type: 'array' });
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

// Shared across Geo_Performance (State column) and Sales_Performance
// (Prime Item Nbr column) — both files' last row is a "Grand Total (...)"
// summary rather than a real state/item, and casing isn't guaranteed.
function isGrandTotalLabel(label) {
  return typeof label === 'string' && label.toLowerCase().startsWith('grand total');
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

  const grandTotal = parsedRows.find((row) => isGrandTotalLabel(row.State)) || null;
  const states = parsedRows.filter((row) => !isGrandTotalLabel(row.State));

  return { states, grandTotal };
}

// Sales_Performance: item-level export with a two-row compound header —
// row 1 has 19 metric names, each merged across a block of period columns
// (LWk, L4Wk, L13Wk, L26Wk, L52Wk, YTD as of the first real export; not
// hardcoded, since this list already changed once before the file arrived).
// Row 2 repeats the period label under each metric. SheetJS flattens merged
// cells to a value only in the top-left cell of the merge and '' for the
// rest, so the metric-name row needs forward-filling to recover which
// metric each column belongs to.
export function parseItemPerformance(buffer) {
  const matrix = sheetToMatrix(buffer);
  const headerRowIdx = findHeaderRowIndex(matrix, HEADER_ANCHORS.itemPerformance);
  if (headerRowIdx === -1) {
    throw new ParseValidationError(
      'Sales_Performance file: could not find the header row (expected a "Prime Item Nbr" column in the first few rows).',
      { file: 'Sales_Performance' },
    );
  }

  const groupRow = matrix[headerRowIdx] || [];
  const periodRow = matrix[headerRowIdx + 1] || [];

  let lastGroup = '';
  const columns = groupRow.map((cell, i) => {
    const group = cellToString(cell);
    if (group !== '') lastGroup = group;
    return { index: i, group: lastGroup, period: cellToString(periodRow[i]) };
  });

  const idColumns = columns.filter((c) => c.period === '');
  const metricColumns = columns.filter((c) => c.period !== '');
  const findIdCol = (name) => idColumns.find((c) => c.group === name);

  const missingIdHeaders = REQUIRED_ID_HEADERS_D.filter((h) => !findIdCol(h));
  if (missingIdHeaders.length > 0) {
    throw new ParseValidationError(
      `Sales_Performance: missing expected column(s): ${missingIdHeaders.join(', ')}`,
      { file: 'Sales_Performance', detail: { missing: missingIdHeaders } },
    );
  }

  const itemNbrCol = findIdCol('Prime Item Nbr').index;
  const itemDescCol = findIdCol('Prime Item Desc').index;
  const upcCol = findIdCol('UPC').index;

  const periods = [];
  for (const col of metricColumns) {
    if (!periods.includes(col.period)) periods.push(col.period);
  }

  const parsedRows = [];
  for (let r = headerRowIdx + 2; r < matrix.length; r++) {
    const raw = matrix[r];
    if (isBlankRow(raw)) continue;
    const itemNbr = cellToString(raw[itemNbrCol]);
    if (itemNbr === '') continue;

    const metrics = {};
    for (const col of metricColumns) {
      if (!metrics[col.group]) metrics[col.group] = {};
      metrics[col.group][col.period] = coerceNumber(raw[col.index]);
    }

    parsedRows.push({
      itemNbr,
      itemDesc: cellToString(raw[itemDescCol]),
      upc: cellToString(raw[upcCol]),
      metrics,
    });
  }

  const grandTotal = parsedRows.find((row) => isGrandTotalLabel(row.itemNbr)) || null;
  const items = parsedRows.filter((row) => !isGrandTotalLabel(row.itemNbr));

  return { items, grandTotal, periods };
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

// Parses the uploaded files together. `files` is an array of
// { filename: string, buffer: Uint8Array } — either the 3 required weekly
// files, or those 3 plus an optional 4th item-level Sales_Performance file.
// Throws ParseValidationError with a human-readable message on any
// validation failure — callers must never publish a partial report from a
// caught error.
export function parseUploadedFiles(files) {
  if (!Array.isArray(files) || (files.length !== 3 && files.length !== 4)) {
    throw new ParseValidationError(
      `Expected 3 files (Weekly_Trends, Trend_Analysis, Geo_Performance), optionally plus a 4th item-level Sales_Performance file — received ${files?.length ?? 0}.`,
    );
  }

  const byType = {};
  for (const file of files) {
    let type = classifyByFilename(file.filename);
    if (!type) type = classifyByHeaderContent(file.buffer);
    if (!type) {
      throw new ParseValidationError(
        `Could not identify "${file.filename}" as ${Object.values(DISPLAY_NAMES).join(', ')} — check the filename and header row.`,
        { file: file.filename },
      );
    }
    if (byType[type]) {
      throw new ParseValidationError(
        `Received two files that both look like ${DISPLAY_NAMES[type]} (e.g. "${byType[type].filename}" and "${file.filename}") — upload one of each type.`,
        { file: file.filename },
      );
    }
    byType[type] = file;
  }

  const missingTypes = REQUIRED_TYPES.filter((t) => !byType[t]);
  if (missingTypes.length > 0) {
    throw new ParseValidationError(
      `Missing required file(s): ${missingTypes.map((t) => DISPLAY_NAMES[t]).join(', ')}. All three weekly files must be uploaded together.`,
      { detail: { missingTypes } },
    );
  }

  const weeklyTrends = parseWeeklyTrends(byType.weeklyTrends.buffer);
  const trendAnalysis = parseTrendAnalysis(byType.trendAnalysis.buffer);
  const geoPerformance = parseGeoPerformance(byType.geoPerformance.buffer);
  const itemPerformance = byType.itemPerformance ? parseItemPerformance(byType.itemPerformance.buffer) : null;

  if (weeklyTrends.length < 4) {
    throw new ParseValidationError(
      `Weekly_Trends: found only ${weeklyTrends.length} week(s) of data — need at least 4 to compute L4W/P4W metrics.`,
      { file: 'Weekly_Trends' },
    );
  }

  return { weeklyTrends, trendAnalysis, geoPerformance, itemPerformance };
}
