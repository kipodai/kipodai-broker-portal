import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {
  parseUploadedFiles,
  parseWeeklyTrends,
  parseTrendAnalysis,
  parseGeoPerformance,
  ParseValidationError,
} from '../server/parser.js';

const FIXTURES_DIR = path.resolve(process.cwd(), 'fixtures');

function findFixture(substringOptions) {
  const files = fs.readdirSync(FIXTURES_DIR);
  const match = files.find((f) => substringOptions.some((s) => f.includes(s)));
  if (!match) throw new Error(`No fixture file found matching any of: ${substringOptions.join(', ')}`);
  return { filename: match, buffer: fs.readFileSync(path.join(FIXTURES_DIR, match)) };
}

function realFixtures() {
  return [
    findFixture(['Weekly_Trends', 'Weekly Trends']),
    findFixture(['Trend_Analysis', 'Trend Analysis']),
    findFixture(['Geo_Performance', 'Geo Performance']),
  ];
}

function makeXlsxBuffer(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const HEADERS_A = [
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

function fullRowA(overrides = {}) {
  const row = {};
  for (const h of HEADERS_A) row[h] = h === 'WM Week' ? 202601 : 1;
  return { ...row, ...overrides };
}

describe('real fixture files (malformed stylesheet XML)', () => {
  it('parses all three real sample files without throwing', () => {
    const [a, b, c] = realFixtures();
    expect(() => parseUploadedFiles([a, b, c])).not.toThrow();
  });

  it('Weekly_Trends: yields ~52 weekly rows with normalized week strings', () => {
    const [a] = realFixtures();
    const rows = parseWeeklyTrends(a.buffer);
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows.length).toBeLessThanOrEqual(60);
    for (const row of rows) {
      expect(row['WM Week']).toMatch(/^\d{6}$/);
    }
  });

  it('Trend_Analysis: skips the preamble row and treats blank LY as null, never 0', () => {
    const [, b] = realFixtures();
    const rows = parseTrendAnalysis(b.buffer);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.Week).toMatch(/^\d{6}$/);
      if (row['On Time % LY'] !== null) {
        expect(typeof row['On Time % LY']).toBe('number');
      }
    }
    // At least one blank LY cell should surface as null, not 0, in real data.
    expect(rows.some((r) => r['On Time % LY'] === null || r['In Full % LY'] === null)).toBe(true);
  });

  it('Geo_Performance: excludes Grand Total from state rankings but captures it as the period total', () => {
    const [, , c] = realFixtures();
    const { states, grandTotal } = parseGeoPerformance(c.buffer);
    expect(grandTotal).not.toBeNull();
    expect(grandTotal.State.startsWith('Grand Total')).toBe(true);
    expect(states.every((s) => !s.State.startsWith('Grand Total'))).toBe(true);
    expect(states.length).toBeGreaterThan(0);
  });
});

describe('Grand Total matching is case-insensitive', () => {
  it('excludes "grand total" regardless of casing', () => {
    const aoa = [
      ['State', 'POS $', 'POS $ %Chg vs LY'],
      ['TX', 50000, 0.1],
      ['grand total (us)', 50000, 0.1],
    ];
    const buffer = makeXlsxBuffer(aoa);
    const { states, grandTotal } = parseGeoPerformance(buffer);
    expect(grandTotal).not.toBeNull();
    expect(states.some((s) => s.State.toLowerCase().startsWith('grand total'))).toBe(false);
    expect(states).toHaveLength(1);
  });
});

describe('week normalization', () => {
  it('normalizes float-like week strings (202528.0 -> "202528")', () => {
    const aoa = [HEADERS_A, HEADERS_A.map((h) => (h === 'WM Week' ? '202528.0' : 1))];
    const buffer = makeXlsxBuffer(aoa);
    const rows = parseWeeklyTrends(buffer);
    expect(rows[0]['WM Week']).toBe('202528');
  });
});

describe('column reordering resilience', () => {
  it('parses correctly when Weekly_Trends columns are reordered', () => {
    const reordered = [...HEADERS_A].reverse();
    const dataRow = fullRowA({ 'POS $': 12345, 'WM Week': 202601 });
    const aoa = [reordered, reordered.map((h) => dataRow[h])];
    const buffer = makeXlsxBuffer(aoa);
    const rows = parseWeeklyTrends(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]['WM Week']).toBe('202601');
    expect(rows[0]['POS $']).toBe(12345);
  });
});

describe('malformed / missing input fails loudly', () => {
  it('throws ParseValidationError when a required header is missing (blank inserted where a header is expected)', () => {
    const headersWithBlank = HEADERS_A.map((h) => (h === 'Instock %' ? '' : h));
    const dataRow = fullRowA();
    const aoa = [headersWithBlank, headersWithBlank.map((h) => (h ? dataRow[h] : 999))];
    const buffer = makeXlsxBuffer(aoa);
    expect(() => parseWeeklyTrends(buffer)).toThrow(ParseValidationError);
    try {
      parseWeeklyTrends(buffer);
    } catch (err) {
      expect(err.message).toContain('Instock %');
    }
  });

  it('throws when fewer than 3 files are provided', () => {
    const [a, b] = realFixtures();
    expect(() => parseUploadedFiles([a, b])).toThrow(ParseValidationError);
  });

  it('throws a clear message when a file type is missing entirely', () => {
    const [a, b] = realFixtures();
    const duplicateA = { filename: 'copy_of_weekly.xlsx', buffer: a.buffer };
    expect(() => parseUploadedFiles([a, b, duplicateA])).toThrow(ParseValidationError);
  });

  it('rejects Weekly_Trends with fewer than 4 weeks of data', () => {
    const dataRow = fullRowA();
    const aoa = [HEADERS_A, HEADERS_A.map((h) => dataRow[h])];
    const buffer = makeXlsxBuffer(aoa);
    const shortFile = { filename: 'Weekly_Trends_short.xlsx', buffer };
    const [, b, c] = realFixtures();
    expect(() => parseUploadedFiles([shortFile, b, c])).toThrow(/at least 4/);
  });
});

describe('filename drift falls back to header detection', () => {
  it('classifies files correctly even when filenames use spaces instead of underscores', () => {
    // The real fixtures already exercise this (see realFixtures()), since
    // ABI Studio exports space-separated names like "Weekly Trends", not
    // "Weekly_Trends". This test pins that behavior explicitly.
    const [a, b, c] = realFixtures();
    const renamed = [
      { filename: 'export 1.xlsx', buffer: a.buffer },
      { filename: 'export 2.xlsx', buffer: b.buffer },
      { filename: 'export 3.xlsx', buffer: c.buffer },
    ];
    expect(() => parseUploadedFiles(renamed)).not.toThrow();
  });
});
