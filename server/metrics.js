// Pure metrics engine. Takes the parsed output of server/parser.js and
// produces the deterministic metrics JSON stored in the report document.
// No I/O, no Date.now() — fully deterministic and unit-testable.

const GEO_FLOOR = 500; // minimum period POS $ to qualify for growth/decline rankings
const INSTOCK_FLAG_THRESHOLD = 0.95;
const INSTOCK_WATCH_THRESHOLD = 0.98;
const POS_DECLINE_FLAG_THRESHOLD = -0.10; // L1W POS $ vs LY
const POS_STEEP_DECLINE_THRESHOLD = -0.15; // used only for the supply-vs-demand correlation callout
const OTIF_IN_FULL_FLAG_THRESHOLD = 0.95;
const OTIF_DROP_POINTS_THRESHOLD = 0.03; // 3 percentage points
const WKS_OH_LOW = 2.0;
const WKS_OH_HEAVY = 6.0;
const MUMD_PCT_FLAG_THRESHOLD = 0.03;

function sum(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0);
}

function avg(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function pctChange(ty, ly) {
  if (ty === null || ty === undefined || ly === null || ly === undefined || ly === 0) return null;
  return (ty - ly) / ly;
}

function whBand(value) {
  if (value === null || value === undefined) return null;
  if (value < WKS_OH_LOW) return 'low';
  if (value > WKS_OH_HEAVY) return 'heavy';
  return 'normal';
}

function sortByWeekAsc(rows, weekKey) {
  return [...rows].sort((a, b) => Number(a[weekKey]) - Number(b[weekKey]));
}

function computeWeeklyTrendsMetrics(weeklyTrends) {
  const sorted = sortByWeekAsc(weeklyTrends, 'WM Week');
  const currentWeek = sorted[sorted.length - 1]['WM Week'];

  const l1w = sorted[sorted.length - 1];
  const l4w = sorted.slice(-4);
  const p4w = sorted.slice(-8, -4);
  const p4wPrior = sorted.slice(-12, -8);

  const l1wPosDollars = l1w['POS $'];
  const l1wPosDollarsLY = l1w['POS $ LY'];
  const l1wPosDollarsChgVsLY = pctChange(l1wPosDollars, l1wPosDollarsLY);

  const l4wPosDollars = sum(l4w, 'POS $');
  const l4wPosDollarsLY = sum(l4w, 'POS $ LY');
  const l4wPosDollarsChgVsLY = pctChange(l4wPosDollars, l4wPosDollarsLY);

  const l4wAvgUSW = avg(l4w, 'U/S/W (Valid Store)');
  const l4wAvgUSWLY = avg(l4w, 'U/S/W LY (Valid Store)');
  const l4wAvgUSWChgVsLY = pctChange(l4wAvgUSW, l4wAvgUSWLY);
  const p4wAvgUSW = p4w.length === 4 ? avg(p4w, 'U/S/W (Valid Store)') : null;
  const p4wPriorAvgUSW = p4wPrior.length === 4 ? avg(p4wPrior, 'U/S/W (Valid Store)') : null;
  const uswMomentumVsP4W = pctChange(l4wAvgUSW, p4wAvgUSW);
  const uswMomentumPriorPeriod = pctChange(p4wAvgUSW, p4wPriorAvgUSW);
  const uswMomentumNegativeTwoPeriods = uswMomentumVsP4W !== null && uswMomentumPriorPeriod !== null
    && uswMomentumVsP4W < 0 && uswMomentumPriorPeriod < 0;

  const l1wInstockPct = l1w['Instock %'];
  const l1wReplInstockPct = l1w['Repl.Instock %'];

  const l1wPosStoreCount = l1w['POS Store Count'];
  const l1wValidStoreCount = l1w['Valid Store Count'];
  const sellingStoreGap = (l1wValidStoreCount !== null && l1wPosStoreCount !== null)
    ? l1wValidStoreCount - l1wPosStoreCount
    : null;
  const l1wPosStoreCountLY = l1w['POS Store Count LY'];
  const l1wValidStoreCountLY = l1w['Valid Store Count LY'];
  const sellingStoreGapLY = (l1wValidStoreCountLY !== null && l1wPosStoreCountLY !== null)
    ? l1wValidStoreCountLY - l1wPosStoreCountLY
    : null;

  const l1wStoreWksOH = l1w['Store Wks OH'];

  const l4wMumdDollars = sum(l4w, 'MUMD $');
  const l4wMumdPctOfSales = (l4wMumdDollars !== null && l4wPosDollars) ? l4wMumdDollars / l4wPosDollars : null;

  const last52 = sorted.slice(-52);
  const mainChartSeries = last52.map((row) => ({
    week: row['WM Week'],
    posDollars: row['POS $'],
    posDollarsLY: row['POS $ LY'],
    posDollarsChgVsLY: pctChange(row['POS $'], row['POS $ LY']),
    instockPct: row['Instock %'],
  }));

  const last13 = sorted.slice(-13).map((row) => ({
    week: row['WM Week'],
    instockPct: row['Instock %'],
    replInstockPct: row['Repl.Instock %'],
  }));

  return {
    currentWeek,
    kpi: {
      l1wPosDollars,
      l1wPosDollarsLY,
      l1wPosDollarsChgVsLY,
      l4wPosDollars,
      l4wPosDollarsLY,
      l4wPosDollarsChgVsLY,
      l4wAvgUSW,
      l4wAvgUSWLY,
      l4wAvgUSWChgVsLY,
      l1wInstockPct,
      l1wPosStoreCount,
      l1wPosStoreCountLY,
    },
    instock: {
      l1wInstockPct,
      l1wReplInstockPct,
      series13w: last13,
    },
    storeCounts: {
      l1wPosStoreCount,
      l1wValidStoreCount,
      sellingStoreGap,
      l1wPosStoreCountLY,
      l1wValidStoreCountLY,
      sellingStoreGapLY,
    },
    weeksOnHand: {
      l1wStoreWksOH,
      band: whBand(l1wStoreWksOH),
    },
    mumd: {
      l4wMumdDollars,
      l4wMumdPctOfSales,
    },
    usw: {
      l4wAvgUSW,
      l4wAvgUSWLY,
      vsLY: l4wAvgUSWChgVsLY,
      vsP4W: uswMomentumVsP4W,
      momentumNegativeTwoPeriods: uswMomentumNegativeTwoPeriods,
    },
    mainChartSeries,
    // internal (not part of the public report shape) — used by alert generation
    _sortedWeeklyTrends: sorted,
  };
}

function computeOtifMetrics(trendAnalysis) {
  if (!trendAnalysis || trendAnalysis.length === 0) {
    return {
      l1wOnTimePct: null,
      l1wInFullPct: null,
      priorWeekOnTimePct: null,
      priorWeekInFullPct: null,
      onTimeDropPoints: null,
      inFullDropPoints: null,
      series13w: [],
    };
  }
  const sorted = sortByWeekAsc(trendAnalysis, 'Week');
  const l1w = sorted[sorted.length - 1];
  const priorWeek = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  const l1wOnTimePct = l1w['On Time %'];
  const l1wInFullPct = l1w['In Full %'];
  const priorWeekOnTimePct = priorWeek ? priorWeek['On Time %'] : null;
  const priorWeekInFullPct = priorWeek ? priorWeek['In Full %'] : null;

  const onTimeDropPoints = (l1wOnTimePct !== null && priorWeekOnTimePct !== null)
    ? priorWeekOnTimePct - l1wOnTimePct
    : null;
  const inFullDropPoints = (l1wInFullPct !== null && priorWeekInFullPct !== null)
    ? priorWeekInFullPct - l1wInFullPct
    : null;

  const series13w = sorted.slice(-13).map((row) => ({
    week: row.Week,
    onTimePct: row['On Time %'],
    inFullPct: row['In Full %'],
  }));

  return {
    l1wOnTimePct,
    l1wInFullPct,
    priorWeekOnTimePct,
    priorWeekInFullPct,
    onTimeDropPoints,
    inFullDropPoints,
    series13w,
  };
}

function computeGeoMetrics(geoPerformance) {
  const { states, grandTotal } = geoPerformance;

  const top5States = [...states]
    .filter((s) => s['POS $'] !== null)
    .sort((a, b) => b['POS $'] - a['POS $'])
    .slice(0, 5);

  const qualifying = states.filter((s) => s['POS $'] !== null && s['POS $'] >= GEO_FLOOR
    && s['POS $ %Chg vs LY'] !== null && s['POS $ %Chg vs LY'] !== undefined);

  const fastestGrowing3 = [...qualifying]
    .sort((a, b) => b['POS $ %Chg vs LY'] - a['POS $ %Chg vs LY'])
    .slice(0, 3);

  const decliners3 = [...qualifying]
    .sort((a, b) => a['POS $ %Chg vs LY'] - b['POS $ %Chg vs LY'])
    .slice(0, 3);

  return { top5States, fastestGrowing3, decliners3, grandTotal };
}

// The correlation callout: weeks where Instock % dropped below the flag
// threshold overlapping weeks of steep POS decline vs LY, within the most
// recent 13 weeks. Both thresholds sit comfortably below/above the real
// sample dip (instock ~74%, POS -22% to -34%) so they don't misfire on
// ordinary noise, but a synthetic POS-drop-only week (instock unaffected)
// produces an empty intersection and no alert.
function computeSupplyDrivenCorrelation(sortedWeeklyTrends) {
  const window = sortedWeeklyTrends.slice(-13);
  const instockLowWeeks = new Set(
    window.filter((r) => r['Instock %'] !== null && r['Instock %'] < INSTOCK_FLAG_THRESHOLD).map((r) => r['WM Week']),
  );
  const posSteepDeclineWeeks = new Set(
    window
      .filter((r) => {
        const chg = pctChange(r['POS $'], r['POS $ LY']);
        return chg !== null && chg <= POS_STEEP_DECLINE_THRESHOLD;
      })
      .map((r) => r['WM Week']),
  );
  const overlap = [...instockLowWeeks].filter((w) => posSteepDeclineWeeks.has(w));
  return { fires: overlap.length > 0, weeks: overlap };
}

function generateAlerts({ weeklyMetrics, otifMetrics, sortedWeeklyTrends }) {
  const alerts = [];
  const { kpi, weeksOnHand } = weeklyMetrics;

  if (kpi.l1wInstockPct !== null) {
    if (kpi.l1wInstockPct < INSTOCK_FLAG_THRESHOLD) {
      alerts.push({
        severity: 'flag',
        key: 'instock_flag',
        message: `In-stock is ${(kpi.l1wInstockPct * 100).toFixed(1)}%, below the 95% service threshold.`,
      });
    } else if (kpi.l1wInstockPct < INSTOCK_WATCH_THRESHOLD) {
      alerts.push({
        severity: 'watch',
        key: 'instock_watch',
        message: `In-stock is ${(kpi.l1wInstockPct * 100).toFixed(1)}%, below the 98% target.`,
      });
    }
  }

  if (kpi.l1wPosDollarsChgVsLY !== null && kpi.l1wPosDollarsChgVsLY < POS_DECLINE_FLAG_THRESHOLD) {
    alerts.push({
      severity: 'flag',
      key: 'pos_decline_flag',
      message: `Sales are down ${Math.abs(kpi.l1wPosDollarsChgVsLY * 100).toFixed(1)}% vs last year this week.`,
    });
  }

  if (weeklyMetrics.usw.momentumNegativeTwoPeriods) {
    alerts.push({
      severity: 'watch',
      key: 'usw_momentum_watch',
      message: 'Units sold per store per week has declined for two periods running.',
    });
  }

  if (otifMetrics.l1wInFullPct !== null && otifMetrics.l1wInFullPct < OTIF_IN_FULL_FLAG_THRESHOLD) {
    alerts.push({
      severity: 'flag',
      key: 'otif_in_full_flag',
      message: `In Full % is ${(otifMetrics.l1wInFullPct * 100).toFixed(1)}%, below the 95% service threshold.`,
    });
  }
  if (otifMetrics.l1wOnTimePct !== null && otifMetrics.l1wOnTimePct < OTIF_IN_FULL_FLAG_THRESHOLD) {
    alerts.push({
      severity: 'watch',
      key: 'otif_on_time_watch',
      message: `On Time % is ${(otifMetrics.l1wOnTimePct * 100).toFixed(1)}%, below the 95% service threshold.`,
    });
  }
  if (otifMetrics.inFullDropPoints !== null && otifMetrics.inFullDropPoints >= OTIF_DROP_POINTS_THRESHOLD) {
    alerts.push({
      severity: 'watch',
      key: 'otif_in_full_drop_watch',
      message: `In Full % dropped ${(otifMetrics.inFullDropPoints * 100).toFixed(1)} points vs the prior week.`,
    });
  }
  if (otifMetrics.onTimeDropPoints !== null && otifMetrics.onTimeDropPoints >= OTIF_DROP_POINTS_THRESHOLD) {
    alerts.push({
      severity: 'watch',
      key: 'otif_on_time_drop_watch',
      message: `On Time % dropped ${(otifMetrics.onTimeDropPoints * 100).toFixed(1)} points vs the prior week.`,
    });
  }

  if (weeksOnHand.band === 'low') {
    alerts.push({
      severity: 'watch',
      key: 'wks_oh_low',
      message: `Store weeks on hand is ${weeksOnHand.l1wStoreWksOH.toFixed(1)}, below the 2-week buffer — restock risk.`,
    });
  } else if (weeksOnHand.band === 'heavy') {
    alerts.push({
      severity: 'watch',
      key: 'wks_oh_heavy',
      message: `Store weeks on hand is ${weeksOnHand.l1wStoreWksOH.toFixed(1)}, above the 6-week band — excess inventory risk.`,
    });
  }

  if (weeklyMetrics.mumd.l4wMumdPctOfSales !== null && weeklyMetrics.mumd.l4wMumdPctOfSales > MUMD_PCT_FLAG_THRESHOLD) {
    alerts.push({
      severity: 'watch',
      key: 'mumd_pct_watch',
      message: `Markdowns are ${(weeklyMetrics.mumd.l4wMumdPctOfSales * 100).toFixed(1)}% of the last 4 weeks of sales, above the 3% guideline.`,
    });
  }

  const correlation = computeSupplyDrivenCorrelation(sortedWeeklyTrends);
  if (correlation.fires) {
    alerts.push({
      severity: 'flag',
      key: 'supply_driven_correlation',
      message: 'The sales decline lines up with weeks where in-stock also dropped — this looks supply-driven, not demand-driven.',
      weeks: correlation.weeks,
    });
  }

  return alerts;
}

// Main entry point. `parsed` is the return value of parseUploadedFiles().
export function computeMetrics(parsed) {
  const { weeklyTrends, trendAnalysis, geoPerformance } = parsed;

  const weeklyMetrics = computeWeeklyTrendsMetrics(weeklyTrends);
  const otifMetrics = computeOtifMetrics(trendAnalysis);
  const geoMetrics = computeGeoMetrics(geoPerformance);

  const alerts = generateAlerts({
    weeklyMetrics,
    otifMetrics,
    sortedWeeklyTrends: weeklyMetrics._sortedWeeklyTrends,
  });

  // Strip the internal working field before returning the public shape.
  const { _sortedWeeklyTrends, ...publicWeeklyMetrics } = weeklyMetrics;

  return {
    currentWeek: weeklyMetrics.currentWeek,
    kpi: {
      ...publicWeeklyMetrics.kpi,
      l1wInFullPct: otifMetrics.l1wInFullPct,
    },
    instock: publicWeeklyMetrics.instock,
    storeCounts: publicWeeklyMetrics.storeCounts,
    weeksOnHand: publicWeeklyMetrics.weeksOnHand,
    mumd: publicWeeklyMetrics.mumd,
    usw: publicWeeklyMetrics.usw,
    mainChartSeries: publicWeeklyMetrics.mainChartSeries,
    otif: otifMetrics,
    geography: geoMetrics,
    alerts,
  };
}
