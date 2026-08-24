import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseUploadedFiles } from '../server/parser.js';
import { computeMetrics } from '../server/metrics.js';

const FIXTURES_DIR = path.resolve(process.cwd(), 'fixtures');

function findFixture(substringOptions) {
  const files = fs.readdirSync(FIXTURES_DIR);
  const match = files.find((f) => substringOptions.some((s) => f.includes(s)));
  if (!match) throw new Error(`No fixture file found matching any of: ${substringOptions.join(', ')}`);
  return { filename: match, buffer: fs.readFileSync(path.join(FIXTURES_DIR, match)) };
}

function realParsed() {
  const files = [
    findFixture(['Weekly_Trends', 'Weekly Trends']),
    findFixture(['Trend_Analysis', 'Trend Analysis']),
    findFixture(['Geo_Performance', 'Geo Performance']),
  ];
  return parseUploadedFiles(files);
}

// --- Synthetic fixtures for isolated metrics-logic tests (bypasses the
// parser entirely — these are already "parsed row" shaped objects). ---

function makeWeekRow(week, overrides = {}) {
  return {
    'WM Week': String(week),
    'POS $': 10000,
    'POS $ LY': 10000,
    'POS Qty': 1000,
    'POS Qty LY': 1000,
    'U/S/W (Valid Store)': 5,
    'U/S/W LY (Valid Store)': 5,
    'Traited Store Count': 110,
    'Traited Store Count LY': 110,
    'Valid Store Count': 105,
    'Valid Store Count LY': 105,
    'POS Store Count': 100,
    'POS Store Count LY': 100,
    'Avg Retail': 3.5,
    'Avg Retail LY': 3.5,
    'Instock %': 0.99,
    'Instock % LY': 0.99,
    'Repl.Instock %': 0.99,
    'Store Wks OH': 4.0,
    'Warehouse Wks OH': 4.0,
    'MUMD $': 100,
    'MUMD $ LY': 100,
    'MUMD Qty': 10,
    'MUMD Qty LY': 10,
    ...overrides,
  };
}

function baselineWeeks(count, overridesByWeek = {}) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const week = 202601 + i;
    rows.push(makeWeekRow(week, overridesByWeek[week] || {}));
  }
  return rows;
}

function makeOtifRow(week, overrides = {}) {
  return {
    Week: String(week),
    'On Time %': 0.97,
    'On Time % LY': 0.96,
    'In Full %': 0.97,
    'In Full % LY': 0.96,
    'Collect Ready %': 0.98,
    'Collect Ready % LY': 0.98,
    'Over Filled %': 0.01,
    'Over Filled % LY': 0.01,
    ...overrides,
  };
}

// Independently recomputes which weeks, within the trailing 13-week window
// ending at the data's own max week, satisfy both the instock-drop and
// POS-decline conditions — using the exact same thresholds as
// server/metrics.js. This intentionally does NOT hardcode week numbers: the
// fixtures are regenerated weekly (see WEEKLY_RUNBOOK.md) and "current week"
// moves forward every time, so any hardcoded week range goes stale. See
// DECISIONS.md "Phase 2 — Metrics engine" for why this replaced an earlier,
// coincidentally-passing version of this test.
function expectedCorrelationWeeks(weeklyTrends) {
  const sorted = [...weeklyTrends].sort((a, b) => Number(a['WM Week']) - Number(b['WM Week']));
  const window = sorted.slice(-13);
  const instockLow = new Set(window.filter((r) => r['Instock %'] !== null && r['Instock %'] < 0.95).map((r) => r['WM Week']));
  const posSteep = new Set(window.filter((r) => {
    if (r['POS $'] === null || r['POS $ LY'] === null || r['POS $ LY'] === 0) return false;
    return (r['POS $'] - r['POS $ LY']) / r['POS $ LY'] <= -0.15;
  }).map((r) => r['WM Week']));
  return [...instockLow].filter((w) => posSteep.has(w));
}

describe('real fixture data — known sample facts', () => {
  it('the historical 202610-202612 instock collapse pattern from the spec is present in the raw data', () => {
    // Regression check on parsing correctness, independent of whether this
    // historical dip still falls inside the *current* trailing-13-week
    // correlation window (it may not, once the fixture rolls forward).
    const parsed = realParsed();
    const dipWeeks = parsed.weeklyTrends.filter((r) => ['202610', '202611', '202612'].includes(r['WM Week']));
    expect(dipWeeks.length).toBe(3);
    for (const row of dipWeeks) {
      expect(row['Instock %']).toBeLessThan(0.95);
    }
    const week202612 = dipWeeks.find((r) => r['WM Week'] === '202612');
    expect(week202612['Instock %']).toBeLessThan(0.75);
    for (const row of dipWeeks) {
      const chg = (row['POS $'] - row['POS $ LY']) / row['POS $ LY'];
      expect(chg).toBeLessThan(-0.20);
      expect(chg).toBeGreaterThan(-0.40);
    }
  });

  it('fires the supply-driven correlation alert for whatever the current trailing-13-week overlap actually is', () => {
    const parsed = realParsed();
    const metrics = computeMetrics(parsed);
    const expectedWeeks = expectedCorrelationWeeks(parsed.weeklyTrends);

    // The fixture must actually exercise the overlap case (sanity check on
    // the fixture itself, not just the code) — if this ever fails because a
    // fresh weekly export no longer has an active supply-driven dip, that's
    // real information: replace with a fixture that does, per the spec's
    // "use it as the test case" instruction.
    expect(expectedWeeks.length).toBeGreaterThan(0);

    const correlationAlert = metrics.alerts.find((a) => a.key === 'supply_driven_correlation');
    expect(correlationAlert).toBeDefined();
    expect(correlationAlert.message.toLowerCase()).toContain('supply-driven');
    expect(correlationAlert.weeks.slice().sort()).toEqual(expectedWeeks.slice().sort());
  });

  it('produces a full metrics shape with no NaN/undefined leaking into alert messages', () => {
    const parsed = realParsed();
    const metrics = computeMetrics(parsed);
    expect(metrics.currentWeek).toMatch(/^\d{6}$/);
    expect(Array.isArray(metrics.alerts)).toBe(true);
    for (const alert of metrics.alerts) {
      expect(alert.message).not.toMatch(/NaN|undefined|null/);
    }
    expect(metrics.geography.top5States.length).toBeGreaterThan(0);
    expect(metrics.geography.grandTotal).not.toBeNull();
  });
});

describe('supply-driven correlation — false positive guard', () => {
  it('does NOT fire when POS drops without an instock drop', () => {
    const weeks = baselineWeeks(16, {
      202616: { 'POS $': 6000 }, // -40% vs LY, instock untouched at 0.99
    });
    const metrics = computeMetrics({
      weeklyTrends: weeks,
      trendAnalysis: [],
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(metrics.alerts.find((a) => a.key === 'supply_driven_correlation')).toBeUndefined();
    // the plain POS decline flag should still fire independently
    expect(metrics.alerts.find((a) => a.key === 'pos_decline_flag')).toBeDefined();
  });

  it('DOES fire when instock and POS decline overlap in the same recent week', () => {
    const weeks = baselineWeeks(16, {
      202616: { 'POS $': 6500, 'Instock %': 0.70 },
    });
    const metrics = computeMetrics({
      weeklyTrends: weeks,
      trendAnalysis: [],
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(metrics.alerts.find((a) => a.key === 'supply_driven_correlation')).toBeDefined();
  });
});

describe('KPI math', () => {
  it('computes L1W and L4W POS $ vs LY correctly', () => {
    const weeks = baselineWeeks(8, {
      202608: { 'POS $': 12000, 'POS $ LY': 10000 },
    });
    const metrics = computeMetrics({
      weeklyTrends: weeks,
      trendAnalysis: [],
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(metrics.kpi.l1wPosDollarsChgVsLY).toBeCloseTo(0.20, 5);
    // L4W = weeks 202605-202608: TY = 10000*3 + 12000 = 42000, LY = 40000
    expect(metrics.kpi.l4wPosDollars).toBe(42000);
    expect(metrics.kpi.l4wPosDollarsChgVsLY).toBeCloseTo(0.05, 5);
  });

  it('flags weeks on hand outside the 2-6 band', () => {
    const low = computeMetrics({
      weeklyTrends: baselineWeeks(4, { 202604: { 'Store Wks OH': 1.2 } }),
      trendAnalysis: [],
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(low.weeksOnHand.band).toBe('low');
    expect(low.alerts.find((a) => a.key === 'wks_oh_low')).toBeDefined();

    const heavy = computeMetrics({
      weeklyTrends: baselineWeeks(4, { 202604: { 'Store Wks OH': 7.5 } }),
      trendAnalysis: [],
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(heavy.weeksOnHand.band).toBe('heavy');
    expect(heavy.alerts.find((a) => a.key === 'wks_oh_heavy')).toBeDefined();
  });

  it('flags MUMD above 3% of L4W POS $', () => {
    const weeks = baselineWeeks(4, {
      202601: { 'MUMD $': 500 },
      202602: { 'MUMD $': 500 },
      202603: { 'MUMD $': 500 },
      202604: { 'MUMD $': 500 },
    }); // 2000 MUMD / 40000 POS = 5%
    const metrics = computeMetrics({
      weeklyTrends: weeks,
      trendAnalysis: [],
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(metrics.mumd.l4wMumdPctOfSales).toBeCloseTo(0.05, 5);
    expect(metrics.alerts.find((a) => a.key === 'mumd_pct_watch')).toBeDefined();
  });

  it('detects U/S/W momentum negative two periods running', () => {
    // 12 weeks: first 4 highest, next 4 middle, last 4 lowest -> both
    // period-over-period comparisons (L4W vs P4W, P4W vs P4W-prior) negative.
    const overrides = {};
    for (let i = 0; i < 4; i++) overrides[202601 + i] = { 'U/S/W (Valid Store)': 8 };
    for (let i = 0; i < 4; i++) overrides[202605 + i] = { 'U/S/W (Valid Store)': 6 };
    for (let i = 0; i < 4; i++) overrides[202609 + i] = { 'U/S/W (Valid Store)': 4 };
    const weeks = baselineWeeks(12, overrides);
    const metrics = computeMetrics({
      weeklyTrends: weeks,
      trendAnalysis: [],
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(metrics.usw.momentumNegativeTwoPeriods).toBe(true);
    expect(metrics.alerts.find((a) => a.key === 'usw_momentum_watch')).toBeDefined();
  });
});

describe('OTIF alerts', () => {
  it('flags In Full % below 95% and a >=3pt drop vs prior week', () => {
    const weeks = baselineWeeks(4);
    const otif = [
      makeOtifRow(202601, { 'In Full %': 0.97, 'On Time %': 0.97 }),
      makeOtifRow(202602, { 'In Full %': 0.90, 'On Time %': 0.93 }),
    ];
    const metrics = computeMetrics({
      weeklyTrends: weeks,
      trendAnalysis: otif,
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(metrics.alerts.find((a) => a.key === 'otif_in_full_flag')).toBeDefined();
    expect(metrics.alerts.find((a) => a.key === 'otif_in_full_drop_watch')).toBeDefined();
  });

  it('watches On Time % below 95% even when In Full % is fine', () => {
    const weeks = baselineWeeks(4);
    const otif = [makeOtifRow(202601, { 'On Time %': 0.90, 'In Full %': 0.99 })];
    const metrics = computeMetrics({
      weeklyTrends: weeks,
      trendAnalysis: otif,
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(metrics.alerts.find((a) => a.key === 'otif_on_time_watch')).toBeDefined();
    expect(metrics.alerts.find((a) => a.key === 'otif_in_full_flag')).toBeUndefined();
  });

  it('treats blank LY OTIF cells as null, not zero, without crashing', () => {
    const weeks = baselineWeeks(4);
    const otif = [makeOtifRow(202601, { 'On Time % LY': null, 'In Full % LY': null })];
    const metrics = computeMetrics({
      weeklyTrends: weeks,
      trendAnalysis: otif,
      geoPerformance: { states: [], grandTotal: null },
    });
    expect(metrics.otif.l1wOnTimePct).toBe(0.97);
  });
});

describe('geography rankings', () => {
  it('excludes states below the $500 POS $ floor from growth/decline rankings but keeps them out of top5 rules', () => {
    const states = [
      { State: 'TX', 'POS $': 50000, 'POS $ %Chg vs LY': 0.30 },
      { State: 'CA', 'POS $': 45000, 'POS $ %Chg vs LY': 0.25 },
      { State: 'NY', 'POS $': 20000, 'POS $ %Chg vs LY': -0.15 },
      { State: 'WY', 'POS $': 100, 'POS $ %Chg vs LY': 5.0 }, // huge growth, below floor
    ];
    const metrics = computeMetrics({
      weeklyTrends: baselineWeeks(4),
      trendAnalysis: [],
      geoPerformance: { states, grandTotal: { State: 'Grand Total (US)', 'POS $': 115100 } },
    });
    expect(metrics.geography.top5States.map((s) => s.State)).toEqual(['TX', 'CA', 'NY', 'WY']);
    expect(metrics.geography.fastestGrowing3.some((s) => s.State === 'WY')).toBe(false);
    expect(metrics.geography.fastestGrowing3[0].State).toBe('TX');
    expect(metrics.geography.decliners3.some((s) => s.State === 'NY')).toBe(true);
    expect(metrics.geography.statePerformance).toEqual(states);
  });
});
