import { describe, it, expect } from 'vitest';
import { computeShelf, DEFINITIONS } from '../marketing-site/public/demos/shelf/compute.js';
import { buildDemoInput, inputForTier } from '../marketing-site/public/demos/shelf/demoData.js';

// Minimal POS item. Overrides replace whole nested objects.
const mk = (id, over = {}) => ({
  id,
  name: `Item ${id}`,
  short: `I${id}`,
  category: 'Cat',
  stores: 1000,
  storesLY: 1000,
  l13: { units: 13000, dollars: 13000 },
  l13LY: { units: 13000, dollars: 13000 },
  l1: { units: 1000, dollars: 1000 },
  ...over,
});
const pos = (...items) => ({ pos: { items } });
const item = (m, id) => m.items.find((i) => i.id === id);

// Every number in a metrics object must be finite or null: no NaN, no Infinity.
function assertNoNonFinite(value, path = 'metrics') {
  if (typeof value === 'number') expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
  else if (Array.isArray(value)) value.forEach((v, i) => assertNoNonFinite(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => assertNoNonFinite(v, `${path}.${k}`));
}

describe('hero selection', () => {
  it.each([
    ['single dominant item', [900, 50, 50], ['a'], 0.9],
    ['exactly at coverage stops immediately', [100, 100], ['a'], 0.5],
    ['needs two items', [40, 35, 25], ['a', 'b'], 0.75],
    ['all tied: ranked by id, fewest items', [100, 100, 100], ['a', 'b'], 2 / 3],
    ['one item is the whole set', [500], ['a'], 1],
  ])('%s', (_name, dollars, heroIds, share) => {
    const ids = ['a', 'b', 'c'];
    const m = computeShelf(pos(...dollars.map((d, i) => mk(ids[i], { l13: { units: d, dollars: d } }))));
    expect(m.summary.heroIds).toEqual(heroIds);
    expect(m.summary.heroCount).toBe(heroIds.length);
    expect(m.summary.heroShare).toBeCloseTo(share, 10);
    expect(m.items.filter((i) => i.hero).map((i) => i.id).sort()).toEqual([...heroIds].sort());
  });

  it('a tie is broken by id regardless of input order', () => {
    const rows = ['c', 'a', 'b'].map((id) => mk(id, { l13: { units: 100, dollars: 100 } }));
    const forward = computeShelf(pos(...rows));
    const reversed = computeShelf(pos(...[...rows].reverse()));
    expect(forward.summary.heroIds).toEqual(['a', 'b']);
    expect(reversed.summary.heroIds).toEqual(['a', 'b']);
  });

  it('numeric ids sort numerically, not lexically', () => {
    const rows = ['10', '9', '2'].map((id) => mk(id, { l13: { units: 100, dollars: 100 } }));
    expect(computeShelf(pos(...rows)).summary.heroIds).toEqual(['2', '9']);
  });

  it('hero set is derived from the loaded data, not a fixed list', () => {
    const a = computeShelf(pos(mk('a', { l13: { units: 1, dollars: 900 } }), mk('b', { l13: { units: 1, dollars: 100 } })));
    const b = computeShelf(pos(mk('a', { l13: { units: 1, dollars: 100 } }), mk('b', { l13: { units: 1, dollars: 900 } })));
    expect(a.summary.heroIds).toEqual(['a']);
    expect(b.summary.heroIds).toEqual(['b']);
  });

  it('zero total dollars yields no heroes and a null share, not 0 or NaN', () => {
    const m = computeShelf(pos(mk('a', { l13: { units: 0, dollars: 0 } })));
    expect(m.summary.heroIds).toEqual([]);
    expect(m.summary.heroShare).toBeNull();
    expect(item(m, 'a').mixShare).toBeNull();
  });

  it('mix shares sum to 1', () => {
    const m = computeShelf(buildDemoInput());
    expect(m.items.reduce((a, i) => a + i.mixShare, 0)).toBeCloseTo(1, 10);
  });
});

describe('year over year with no prior-year base', () => {
  it.each([
    ['zero stores last year', { storesLY: 0 }, 'new'],
    ['zero dollars last year', { l13LY: { units: 0, dollars: 0 } }, 'new'],
    ['no last-year stores supplied', { storesLY: undefined }, 'missing'],
    ['no last-year sales supplied', { l13LY: undefined }, 'missing'],
    ['null last-year dollars', { l13LY: { units: null, dollars: null } }, 'missing'],
  ])('%s', (_n, over, status) => {
    const m = computeShelf(pos(mk('a', over), mk('b')));
    const a = item(m, 'a');
    expect(a.yoyStatus).toBe(status);
    expect(a.dollarsYoY).toBeNull();
    expect(a.unitsYoY).toBeNull();
    expect(a.perStoreDollarsYoY).toBeNull();
    expect(a.storesChange).toBeNull();
    expect(a.growthFromStores).toBeNull();
    expect(a.declineKind).toBeNull();
    assertNoNonFinite(m);
  });

  it('new and no-prior-year items are excluded from the like-for-like KPIs and decomposition', () => {
    const m = computeShelf(pos(
      mk('a', { l13: { units: 1100, dollars: 1100 }, l13LY: { units: 1000, dollars: 1000 } }),
      mk('new', { storesLY: 0, l13: { units: 9999, dollars: 9999 }, l13LY: { units: 0, dollars: 0 } }),
    ));
    expect(m.kpis.comparableCount).toBe(1);
    expect(m.kpis.excludedFromYoyCount).toBe(1);
    expect(m.kpis.dollarsYoY).toBeCloseTo(0.1, 10); // only item a
    expect(m.summary.newItemCount).toBe(1);
    expect(m.summary.topGrowerId).toBe('a');
  });

  it('YoY is null (not 0, not Infinity) when nothing is comparable', () => {
    const m = computeShelf(pos(mk('a', { storesLY: 0, l13LY: { units: 0, dollars: 0 } })));
    expect(m.kpis.dollarsYoY).toBeNull();
    expect(m.kpis.unitsYoY).toBeNull();
    assertNoNonFinite(m);
  });

  it('a blank last-year value is "no data", never coerced to zero', () => {
    const m = computeShelf(pos(mk('a', { l13LY: { units: 1000, dollars: undefined } })));
    expect(item(m, 'a').yoyStatus).toBe('missing');
  });
});

describe('store loss vs demand loss', () => {
  // stores LY -> now, last-13-week dollars LY -> now
  it.each([
    ['fewer stores, healthy per-store dollars', 1000, 800, 100, 90, 'store-loss'],
    ['same stores, sales fell', 1000, 1000, 100, 80, 'demand-loss'],
    ['both fell, stores the bigger drag', 1000, 700, 100, 50, 'store-loss'],
    ['both fell, per-store the bigger drag', 1000, 950, 100, 60, 'demand-loss'],
    ['more stores, sales still fell', 1000, 1100, 100, 90, 'demand-loss'],
    ['delisted (no stores left)', 1000, 0, 100, 0, 'store-loss'],
  ])('%s', (_n, sLY, s, dLY, d, kind) => {
    const m = computeShelf(pos(mk('a', {
      storesLY: sLY, stores: s,
      l13: { units: d, dollars: d }, l13LY: { units: dLY, dollars: dLY },
    })));
    expect(item(m, 'a').declineKind).toBe(kind);
    expect(m.summary.topDeclinerId).toBe('a');
  });

  it('growing or flat items are never classified', () => {
    const m = computeShelf(pos(
      mk('up', { l13: { units: 1500, dollars: 1500 }, l13LY: { units: 1000, dollars: 1000 } }),
      mk('flat'),
    ));
    expect(item(m, 'up').declineKind).toBeNull();
    expect(item(m, 'flat').declineKind).toBeNull();
    expect(m.summary.topDeclinerId).toBeNull();
  });

  it('per-store change equals (dollars per store) over (last year dollars per store)', () => {
    const m = computeShelf(pos(mk('a', {
      storesLY: 1000, stores: 800,
      l13: { units: 90, dollars: 90 }, l13LY: { units: 100, dollars: 100 },
    })));
    expect(item(m, 'a').perStoreDollarsYoY).toBeCloseTo((90 / 800) / (100 / 1000) - 1, 12);
    expect(item(m, 'a').storesChange).toBeCloseTo(-0.2, 12);
  });
});

describe('growth decomposition (approximate log method)', () => {
  it.each([
    ['stores drive part of it', 1000, 1100, 1000, 1210, (r) => r > 0 && r < 1],
    ['stores drive all of it and more', 1000, 1500, 1000, 1200, (r) => r > 1],
    ['stores fell, sales rose', 1000, 800, 1000, 1100, (r) => r < 0],
    ['stores unchanged', 1000, 1000, 1000, 1100, (r) => r === 0],
  ])('%s', (_n, sLY, s, dLY, d, expectShape) => {
    const m = computeShelf(pos(mk('a', {
      storesLY: sLY, stores: s, l13: { units: d, dollars: d }, l13LY: { units: dLY, dollars: dLY },
    })));
    const r = item(m, 'a').growthFromStores;
    expect(r).toBeCloseTo(Math.log(s / sLY) / Math.log(d / dLY), 12);
    expect(expectShape(r)).toBe(true);
  });
});

describe('missing source tiers produce nulls, never zeros', () => {
  const full = buildDemoInput();
  it.each([
    [1, { itemMaster: false, category: false, planogram: false }],
    [2, { itemMaster: true, category: false, planogram: false }],
    [3, { itemMaster: true, category: true, planogram: false }],
    [4, { itemMaster: true, category: true, planogram: true }],
  ])('tier %s', (tier, has) => {
    const m = computeShelf(inputForTier(tier, full));
    expect(m.sources).toEqual({ pos: true, ...has });
    expect(m.missing).toEqual({ itemMaster: !has.itemMaster, category: !has.category, planogram: !has.planogram });
    for (const i of m.items) {
      if (has.itemMaster) expect(i.master.shelfPrice).toBeGreaterThan(0);
      else expect(i.master).toBeNull();
      if (has.category) expect(i.share.dollarShare).toBeGreaterThan(0);
      else expect(i.share).toBeNull();
      if (has.planogram) expect(i.space.linearShare).toBeGreaterThan(0);
      else expect(i.space).toBeNull();
      if (has.category && has.planogram) {
        expect(i.spaceStatus).toBe('ok');
        expect(i.idxDollars).toBeGreaterThan(0);
      } else {
        expect(i.idxDollars).toBeNull();
        expect(i.idxUnits).toBeNull();
        expect(i.spaceVerdict).toBeNull();
      }
    }
    assertNoNonFinite(m);
  });

  it('names the missing source when only one of the two shelf inputs is present', () => {
    const onlyPlan = computeShelf({ pos: full.pos, planogram: full.planogram });
    const onlyCat = computeShelf({ pos: full.pos, category: full.category });
    expect(onlyPlan.items[0].spaceStatus).toBe('missing-category');
    expect(onlyPlan.items[0].space.linearShare).not.toBeNull(); // planogram-only shares still computed
    expect(onlyCat.items[0].spaceStatus).toBe('missing-planogram');
  });

  it('POS alone still gives realized price, and item master gives price per ounce', () => {
    const m1 = computeShelf(inputForTier(1, full));
    expect(m1.items[0].realizedPrice).toBeCloseTo(m1.items[0].dollars / m1.items[0].units, 10);
    const m2 = computeShelf(inputForTier(2, full));
    const oats = item(m2, '418022');
    expect(oats.master.pricePerOzCents).toBeCloseTo((4.29 / 42) * 100, 10);
  });

  it('an item absent from a connected source gets nulls for that source', () => {
    const m = computeShelf({ ...pos(mk('a'), mk('b')), category: [{ id: 'a', dollarShare: 0.2, unitShare: 0.2 }] });
    expect(item(m, 'a').share.dollarShare).toBe(0.2);
    expect(item(m, 'b').share).toBeNull();
  });

  it('shareChange is null (not the full share) when last-year share is unknown', () => {
    const m = computeShelf({ ...pos(mk('a')), category: [{ id: 'a', dollarShare: 0.2, unitShare: 0.2 }] });
    expect(item(m, 'a').share.shareChange).toBeNull();
    const m2 = computeShelf({ ...pos(mk('a')), category: [{ id: 'a', dollarShare: 0.2, unitShare: 0.2, dollarShareLY: 0.15 }] });
    expect(item(m2, 'a').share.shareChange).toBeCloseTo(0.05, 12);
  });
});

describe('space-to-sales index', () => {
  const withSpace = (plan, cat = { dollarShare: 0.2, unitShare: 0.1 }) => ({
    ...pos(mk('a')),
    category: [{ id: 'a', ...cat }],
    planogram: [{ id: 'a', facings: 2, categoryFacings: 20, categoryLinearIn: 100, categorySkus: 10, ...plan }],
  });

  it('is share of dollars over share of linear space, plus the unit version', () => {
    const a = item(computeShelf(withSpace({ linearIn: 10 })), 'a');
    expect(a.space.linearShare).toBeCloseTo(0.1, 12);
    expect(a.idxDollars).toBeCloseTo(2, 12);
    expect(a.idxUnits).toBeCloseTo(1, 12);
    expect(a.spaceVerdict).toBe('above');
    expect(a.space.facingShare).toBeCloseTo(0.1, 12);
    expect(a.space.skuShare).toBeCloseTo(0.1, 12);
    expect(a.space.otherFacings).toBe(18); // 20 category facings, 2 are ours
  });

  it('other-brand facings are null (not negative) when the planogram is inconsistent or blank', () => {
    expect(item(computeShelf(withSpace({ linearIn: 10, facings: 25 })), 'a').space.otherFacings).toBeNull();
    expect(item(computeShelf(withSpace({ linearIn: 10, facings: undefined })), 'a').space.otherFacings).toBeNull();
    expect(item(computeShelf(withSpace({ linearIn: 10, facings: 0 })), 'a').space.otherFacings).toBe(20);
  });

  it('parity (1.0x) counts as above; below parity is below', () => {
    expect(item(computeShelf(withSpace({ linearIn: 20 })), 'a').spaceVerdict).toBe('above');
    expect(item(computeShelf(withSpace({ linearIn: 40 })), 'a').spaceVerdict).toBe('below');
  });

  it('zero linear space gives null, a named status, and no Infinity', () => {
    const m = computeShelf(withSpace({ linearIn: 0 }));
    const a = item(m, 'a');
    expect(a.space.linearShare).toBe(0);
    expect(a.idxDollars).toBeNull();
    expect(a.idxUnits).toBeNull();
    expect(a.spaceVerdict).toBeNull();
    expect(a.spaceStatus).toBe('no-linear-space');
    assertNoNonFinite(m);
  });

  it.each([
    ['zero category linear space', { linearIn: 10, categoryLinearIn: 0 }],
    ['missing item linear inches', { linearIn: undefined }],
    ['null item linear inches', { linearIn: null }],
  ])('%s is missing data, not a zero share', (_n, plan) => {
    const a = item(computeShelf(withSpace(plan)), 'a');
    expect(a.space.linearShare).toBeNull();
    expect(a.idxDollars).toBeNull();
    expect(a.spaceStatus).toBe('missing-item-data');
  });

  it('a missing unit share nulls only the unit index', () => {
    const a = item(computeShelf(withSpace({ linearIn: 10 }, { dollarShare: 0.2 })), 'a');
    expect(a.idxDollars).toBeCloseTo(2, 12);
    expect(a.idxUnits).toBeNull();
  });
});

describe('windows and velocity', () => {
  const data = pos(mk('a', {
    stores: 1000,
    l13: { units: 26000, dollars: 52000 },
    l1: { units: 3000, dollars: 6600 },
  }));
  it('L13 reports 13 weeks, L1 reports one', () => {
    const l13 = computeShelf(data, { window: 'l13' });
    const l1 = computeShelf(data, { window: 'l1' });
    expect(l13.weeks).toBe(DEFINITIONS.windowWeeks.l13);
    expect(l1.weeks).toBe(DEFINITIONS.windowWeeks.l1);
    expect(item(l13, 'a').units).toBe(26000);
    expect(item(l1, 'a').units).toBe(3000);
    expect(item(l13, 'a').velocity).toBeCloseTo(26000 / (1000 * 13), 12);
    expect(item(l1, 'a').velocity).toBeCloseTo(3, 12);
    expect(item(l1, 'a').dollarsPerStorePerWeek).toBeCloseTo(6.6, 12);
    expect(item(l1, 'a').realizedPrice).toBeCloseTo(2.2, 12);
  });
  it('YoY, hero and mix always use the 13-week base, whichever window is shown', () => {
    const l13 = computeShelf(buildDemoInput(), { window: 'l13' });
    const l1 = computeShelf(buildDemoInput(), { window: 'l1' });
    expect(l1.summary.heroIds).toEqual(l13.summary.heroIds);
    expect(l1.items.map((i) => i.dollarsYoY)).toEqual(l13.items.map((i) => i.dollarsYoY));
  });
  it('momentum is last-week velocity over 13-week velocity, as a change', () => {
    const a = item(computeShelf(data), 'a');
    expect(a.momentum).toBeCloseTo(3 / 2 - 1, 12);
  });
  it('momentum is null when there is no 13-week velocity to compare against', () => {
    const a = item(computeShelf(pos(mk('a', { l13: { units: 0, dollars: 0 } }))), 'a');
    expect(a.momentum).toBeNull();
  });
  it('an unknown window falls back to L13', () => {
    expect(computeShelf(data, { window: 'bogus' }).window).toBe('l13');
  });
});

describe('KPIs', () => {
  it('distribution points are the sum of stores selling, with the change over last year', () => {
    const m = computeShelf({
      pos: { retailerStores: 2000, items: [mk('a', { stores: 1500, storesLY: 1000 }), mk('b', { stores: 500, storesLY: 1000 })] },
    });
    expect(m.kpis.distributionPoints).toBe(2000);
    expect(m.kpis.distributionPointsChange).toBeCloseTo(0, 12);
    expect(m.kpis.possiblePoints).toBe(4000);
  });
  it('distribution change counts a new item (LY = 0) but skips items with no LY store data', () => {
    const m = computeShelf(pos(
      mk('a', { stores: 100, storesLY: 100 }),
      mk('new', { stores: 100, storesLY: 0 }),
      mk('blank', { stores: 5000, storesLY: undefined }),
    ));
    expect(m.kpis.distributionPoints).toBe(5200); // all items
    expect(m.kpis.distributionPointsChange).toBeCloseTo(200 / 100 - 1, 12); // items with LY data only
  });
  it('possible points are null when the retailer store count is not supplied', () => {
    expect(computeShelf(pos(mk('a'))).kpis.possiblePoints).toBeNull();
  });
});

describe('malformed input is contained, never turned into zeros', () => {
  it('null, undefined and non-object input never throw', () => {
    for (const bad of [null, undefined, 0, '', {}, { pos: null }, { pos: {} }, { pos: { items: null } }]) {
      expect(() => computeShelf(bad)).not.toThrow();
      expect(computeShelf(bad).items).toEqual([]);
    }
  });

  it('a row with no name or short label falls back to its id, never the text "undefined"', () => {
    const m = computeShelf({ pos: { items: [{ id: 'z9', category: 'c', stores: 1, storesLY: 1, l13: { units: 1, dollars: 1 } }] } });
    expect(item(m, 'z9').name).toBe('z9');
    expect(item(m, 'z9').short).toBe('z9');
  });

  it('ignores null, non-object and id-less rows instead of throwing', () => {
    const m = computeShelf({ pos: { items: [null, undefined, 5, 'x', {}, { name: 'no id' }, mk('a')] } });
    expect(m.items.map((i) => i.id)).toEqual(['a']);
  });

  it('a repeated id keeps the first row and is reported, not silently merged', () => {
    const m = computeShelf(pos(
      mk('a', { l13: { units: 1, dollars: 111 } }),
      mk('a', { l13: { units: 1, dollars: 999 } }),
      mk('b'),
    ));
    expect(m.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(item(m, 'a').dollarsL13).toBe(111);
    expect(m.summary.duplicateIds).toEqual(['a']);
    expect(computeShelf(pos(mk('a'))).summary.duplicateIds).toEqual([]);
  });

  it('numeric and string ids for the same item are the same id', () => {
    const m = computeShelf(pos(mk(7), mk('7')));
    expect(m.items).toHaveLength(1);
    expect(m.summary.duplicateIds).toEqual(['7']);
  });

  it('totals skip an unknown value instead of counting it as 0, and are null when nothing is known', () => {
    const m = computeShelf(pos(
      mk('a', { l1: { units: 10, dollars: 100 }, l13: { units: 10, dollars: 100 }, stores: 50 }),
      mk('b', { l1: { units: null, dollars: 'n/a' }, l13: { units: 10, dollars: 100 }, stores: '40' }),
    ), { window: 'l1' });
    expect(m.kpis.dollars).toBe(100);
    expect(m.kpis.units).toBe(10);
    expect(m.kpis.distributionPoints).toBe(50);
    const none = computeShelf(pos(mk('a', { l1: {}, stores: undefined })), { window: 'l1' });
    expect(none.kpis.dollars).toBeNull();
    expect(none.kpis.units).toBeNull();
    expect(none.kpis.distributionPoints).toBeNull();
  });

  it('strings and NaN where numbers belong become null values, not coerced numbers', () => {
    const a = item(computeShelf(pos(mk('a', { stores: '1985', storesLY: NaN, l13: { units: '5', dollars: Infinity } }))), 'a');
    expect(a.stores).toBeNull();
    expect(a.storesLY).toBeNull();
    expect(a.dollarsL13).toBeNull();
    expect(a.yoyStatus).toBe('missing');
  });

  it('a facing share above 100% (inconsistent planogram) is unknown, not shown', () => {
    const m = computeShelf({
      ...pos(mk('a')),
      category: [{ id: 'a', dollarShare: 0.2, unitShare: 0.2 }],
      planogram: [{ id: 'a', facings: 25, categoryFacings: 20, linearIn: 10, categoryLinearIn: 100, categorySkus: 10 }],
    });
    expect(item(m, 'a').space.facingShare).toBeNull();
    expect(item(m, 'a').space.otherFacings).toBeNull();
  });

  it('a planogram row with no matching POS item is ignored', () => {
    const m = computeShelf({
      ...pos(mk('a')),
      planogram: [{ id: 'ghost', facings: 1, categoryFacings: 2, linearIn: 1, categoryLinearIn: 2, categorySkus: 3 }],
    });
    expect(m.items).toHaveLength(1);
    expect(item(m, 'a').space).toBeNull();
  });
});

describe('degenerate datasets', () => {
  it('no input at all: empty items, null KPIs, no sources', () => {
    const m = computeShelf({});
    expect(m.items).toEqual([]);
    expect(m.sources.pos).toBe(false);
    expect(m.kpis.dollars).toBeNull();
    expect(m.kpis.distributionPoints).toBeNull();
    expect(m.summary.heroShare).toBeNull();
    assertNoNonFinite(m);
    expect(() => computeShelf()).not.toThrow();
  });
  it('one item: it is the hero set, 100% of dollars', () => {
    const m = computeShelf(pos(mk('a')));
    expect(m.summary.heroIds).toEqual(['a']);
    expect(m.summary.heroShare).toBe(1);
    expect(item(m, 'a').mixShare).toBe(1);
    assertNoNonFinite(m);
  });
  it('every item declining: no grower, all classified, top decliner is the steepest', () => {
    const down = (id, d) => mk(id, { l13: { units: d, dollars: d }, l13LY: { units: 100, dollars: 100 } });
    const m = computeShelf(pos(down('a', 90), down('b', 50), down('c', 70)));
    expect(m.summary.topGrowerId).toBeNull();
    expect(m.items.every((i) => i.declineKind)).toBe(true);
    expect(m.summary.topDeclinerId).toBe('b');
    assertNoNonFinite(m);
  });
  it('the demo dataset produces finite numbers throughout, in both windows', () => {
    assertNoNonFinite(computeShelf(buildDemoInput(), { window: 'l13' }));
    assertNoNonFinite(computeShelf(buildDemoInput(), { window: 'l1' }));
  });
  it('does not mutate its input', () => {
    const input = buildDemoInput();
    const before = JSON.stringify(input);
    computeShelf(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
