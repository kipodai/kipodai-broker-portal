import { describe, it, expect } from 'vitest';
import { generateNarrative } from '../server/narrative.js';

function baseMetrics(overrides = {}) {
  return {
    currentWeek: '202628',
    kpi: {
      l1wPosDollars: 10000,
      l1wPosDollarsLY: 10000,
      l1wPosDollarsChgVsLY: 0,
      l4wPosDollars: 40000,
      l4wPosDollarsLY: 40000,
      l4wPosDollarsChgVsLY: 0,
      l4wAvgUSW: 5,
      l4wAvgUSWLY: 5,
      l4wAvgUSWChgVsLY: 0,
      l1wInstockPct: 0.98,
      l1wInFullPct: 0.97,
      l1wPosStoreCount: 100,
      l1wPosStoreCountLY: 100,
    },
    alerts: [],
    ...overrides,
  };
}

describe('template narrative — supply-driven correlation phrasing', () => {
  it('does NOT call it "this decline" when L1W sales are actually up (recovered dip)', async () => {
    // Reproduces the real-fixture bug: correlation window found a dip in a
    // prior week, but the current week has since recovered and is up.
    const metrics = baseMetrics({
      kpi: { ...baseMetrics().kpi, l1wPosDollarsChgVsLY: 0.614 },
      alerts: [{
        severity: 'flag',
        key: 'supply_driven_correlation',
        message: 'The sales decline lines up with weeks where in-stock also dropped — this looks supply-driven, not demand-driven.',
        weeks: ['202617', '202618'],
      }],
    });
    const { text } = await generateNarrative(metrics, { apiKey: null });
    expect(text).toContain('up');
    expect(text.toLowerCase()).not.toContain('this decline');
    expect(text.toLowerCase()).toContain('recovered');
  });

  it('DOES call it "this decline" when L1W sales are actually down and the alert covers the current week', async () => {
    const metrics = baseMetrics({
      kpi: { ...baseMetrics().kpi, l1wPosDollarsChgVsLY: -0.30 },
      alerts: [{
        severity: 'flag',
        key: 'supply_driven_correlation',
        message: 'x',
        weeks: ['202628'],
      }],
    });
    const { text } = await generateNarrative(metrics, { apiKey: null });
    expect(text.toLowerCase()).toContain('this decline');
    expect(text.toLowerCase()).toContain('supply');
  });
});

describe('template narrative — edge cases', () => {
  it('never emits null/undefined/NaN and stays non-empty with zero alerts', async () => {
    const metrics = baseMetrics();
    const { text } = await generateNarrative(metrics, { apiKey: null });
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/i);
    expect(text.toLowerCase()).toContain('no significant flags');
  });

  it('never emits null/undefined/NaN with every KPI null', async () => {
    const metrics = baseMetrics({
      kpi: {
        l1wPosDollars: null, l1wPosDollarsLY: null, l1wPosDollarsChgVsLY: null,
        l4wPosDollars: null, l4wPosDollarsLY: null, l4wPosDollarsChgVsLY: null,
        l4wAvgUSW: null, l4wAvgUSWLY: null, l4wAvgUSWChgVsLY: null,
        l1wInstockPct: null, l1wInFullPct: null, l1wPosStoreCount: null, l1wPosStoreCountLY: null,
      },
    });
    const { text } = await generateNarrative(metrics, { apiKey: null });
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/i);
  });

  it('handles every alert firing at once without crashing or exceeding a sane length', async () => {
    const metrics = baseMetrics({
      alerts: [
        { severity: 'flag', key: 'instock_flag', message: 'In-stock is 80%, below the 95% service threshold.' },
        { severity: 'flag', key: 'pos_decline_flag', message: 'Sales are down 20% vs last year this week.' },
        { severity: 'watch', key: 'usw_momentum_watch', message: 'Units sold per store per week has declined for two periods running.' },
        { severity: 'flag', key: 'otif_in_full_flag', message: 'In Full % is 90%, below the 95% service threshold.' },
        { severity: 'watch', key: 'wks_oh_low', message: 'Store weeks on hand is 1.2, below the 2-week buffer.' },
        { severity: 'watch', key: 'mumd_pct_watch', message: 'Markdowns are 5% of sales.' },
        { severity: 'flag', key: 'supply_driven_correlation', message: 'x', weeks: ['202628'] },
      ],
    });
    const { text } = await generateNarrative(metrics, { apiKey: null });
    expect(text).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/i);
    expect(text.split(/\s+/).length).toBeLessThan(150);
  });

  it('falls back to template when ANTHROPIC_API_KEY is unset (no network call attempted)', async () => {
    const metrics = baseMetrics();
    const result = await generateNarrative(metrics, { apiKey: undefined });
    expect(result.source).toBe('template');
  });
});
