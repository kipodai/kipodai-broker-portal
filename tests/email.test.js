import { describe, expect, it } from 'vitest';
import { buildReportEmailHtml } from '../server/email.js';

function makeReport() {
  return {
    week: '202628',
    narrative: { text: 'Sales momentum is improving.' },
    metrics: {
      currentWeek: '202628',
      kpi: {
        l1wPosDollars: 12500, l1wPosDollarsChgVsLY: 0.1,
        l4wPosDollars: 48000, l4wPosDollarsChgVsLY: -0.03,
        l4wAvgUSW: 4.2, l4wAvgUSWChgVsLY: 0.05,
        l1wInstockPct: 0.98, l1wInFullPct: 0.96, l1wPosStoreCount: 315,
      },
      alerts: [{ severity: 'watch', message: 'Monitor store coverage.' }],
      mainChartSeries: [
        { week: '202627', posDollars: 11000, posDollarsLY: 10000, instockPct: 0.97 },
        { week: '202628', posDollars: 12500, posDollarsLY: 11000, instockPct: 0.98 },
      ],
      geography: {
        statePerformance: [
          { State: 'TX', 'POS $': 5000, 'POS $ %Chg vs LY': 0.1 },
          { State: 'CA', 'POS $': 4000, 'POS $ %Chg vs LY': -0.02 },
        ],
      },
      otif: { series13w: [{ week: '202628', onTimePct: 0.98, inFullPct: 0.96 }] },
      itemPerformance: {
        periods: ['L4Wk'],
        items: [{
          itemNbr: '1', itemDesc: 'Original <Berry>',
          metrics: {
            'POS $': { L4Wk: 1000 }, 'POS $ %Chg vs LY': { L4Wk: 0.04 },
            'Instock %': { L4Wk: 0.99 }, 'U/S/W (Valid Store)': { L4Wk: 3.2 },
          },
        }],
        grandTotal: {
          metrics: {
            'POS $': { L4Wk: 1000 }, 'POS $ %Chg vs LY': { L4Wk: 0.04 },
            'Instock %': { L4Wk: 0.99 }, 'U/S/W (Valid Store)': { L4Wk: 3.2 },
          },
        },
      },
    },
  };
}

describe('complete report email', () => {
  it('renders every report section and the full item table', () => {
    const html = buildReportEmailHtml({ report: makeReport(), portalUrl: 'https://portal.example/report/202628' });
    expect(html).toContain('Complete weekly report');
    expect(html).toContain('Key signals');
    expect(html).toContain('What needs attention');
    expect(html).toContain('Sales and availability');
    expect(html).toContain('Sales trend detail');
    expect(html).toContain('Geography');
    expect(html).toContain('Fulfilment rhythm');
    expect(html).toContain('Item performance');
    expect(html).toContain('TX');
    expect(html).toContain('CA');
    expect(html).toContain('Original &lt;Berry&gt;');
    expect(html).toContain('Brand Total');
  });

  it('handles reports without optional geography, supply, or item data', () => {
    const report = makeReport();
    report.metrics.geography = {};
    report.metrics.otif = {};
    report.metrics.itemPerformance = null;
    const html = buildReportEmailHtml({ report, portalUrl: 'https://portal.example/report/202628' });
    expect(html).toContain('No state-level sales data available.');
    expect(html).toContain('No supply-chain trend data available.');
    expect(html).toContain('Item-level performance was not included');
  });

  it('does not fail when older reports omit alerts or a velocity value', () => {
    const report = makeReport();
    report.metrics.alerts = undefined;
    report.metrics.kpi.l4wAvgUSW = undefined;
    const html = buildReportEmailHtml({ report, portalUrl: 'https://portal.example/report/202628' });
    expect(html).toContain('No flags this week.');
    expect(html).toContain('Units / Store / Week');
    expect(html).not.toMatch(/undefined|NaN/);
  });
});
