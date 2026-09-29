// Layer 1 of 3: pure metrics. No DOM, no framework, no imports.
//
// Input (every source optional except that POS drives everything):
//   pos: {
//     meta?: { supplier, retailer, weekEnding },
//     retailerStores?: number,
//     items: [{ id, name, short?, category, stores, storesLY,
//               l13: { units, dollars }, l13LY: { units, dollars },
//               l1:  { units, dollars } }]
//   }
//   itemMaster?: [{ id, packOz, shelfPrice, image? }]
//   category?:   [{ id, dollarShare, unitShare, dollarShareLY? }]
//   planogram?:  [{ id, facings, categoryFacings, linearIn, categoryLinearIn, categorySkus }]
//
// A blank or absent prior-year value means "no data", never zero. A prior-year
// value that is explicitly 0 means the item is new. Missing sources yield
// nulls, never zeros or invented values.
//
// Output: one metrics object (see the return statement).

// Definitions, not data thresholds. Window lengths are display constants; the
// hero coverage is the definition of "hero" (fewest items whose cumulative
// last-13-week dollars reach it). Every item in the hero set is derived from
// the loaded data.
export const DEFINITIONS = Object.freeze({
  heroCoverage: 0.5,
  windowWeeks: Object.freeze({ l1: 1, l13: 13 }),
});

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ratio = (a, b) => (a === null || b === null || b === 0 ? null : a / b);
const change = (cur, prior) => {
  const r = ratio(cur, prior);
  return r === null ? null : r - 1;
};
const sum = (xs) => xs.reduce((a, x) => a + x, 0);
// Total of the values we actually have; null (not 0) when we have none.
const sumKnown = (xs) => {
  const known = xs.filter((x) => x !== null && x !== undefined);
  return known.length ? sum(known) : null;
};
const byId = (rows) => new Map((Array.isArray(rows) ? rows : []).map((r) => [String(r.id), r]));
const cmpId = (a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true });

function itemMetrics(it, ctx) {
  const { w, master, cat, plan } = ctx;
  const id = String(it.id);
  const stores = num(it.stores);
  const storesLY = num(it.storesLY);
  const l13 = it.l13 || {};
  const l1 = it.l1 || {};
  const ly = it.l13LY || {};
  const cur = ctx.window === 'l1' ? l1 : l13;

  const units = num(cur.units);
  const dollars = num(cur.dollars);
  const unitsL13 = num(l13.units);
  const dollarsL13 = num(l13.dollars);
  const unitsLY = num(ly.units);
  const dollarsLY = num(ly.dollars);

  // 'missing': no prior-year data supplied. 'new': prior year explicitly zero
  // (no stores or no sales), so a percentage would divide by zero.
  let yoyStatus = 'ok';
  if (storesLY === null || dollarsLY === null) yoyStatus = 'missing';
  else if (storesLY === 0 || dollarsLY === 0) yoyStatus = 'new';
  const ok = yoyStatus === 'ok';

  const storesChange = ok && stores !== null ? stores / storesLY - 1 : null;
  const dollarsYoY = ok ? change(dollarsL13, dollarsLY) : null;
  const unitsYoY = ok ? change(unitsL13, unitsLY) : null;
  const perStoreDollarsYoY =
    ok && stores > 0 && dollarsL13 !== null ? dollarsL13 / stores / (dollarsLY / storesLY) - 1 : null;

  const velocity = stores > 0 && units !== null ? units / (stores * w) : null;
  const velocityL13 = stores > 0 && unitsL13 !== null ? unitsL13 / (stores * DEFINITIONS.windowWeeks.l13) : null;
  const velocityL1 = stores > 0 && num(l1.units) !== null ? l1.units / (stores * DEFINITIONS.windowWeeks.l1) : null;

  // Store loss vs demand loss: the larger drag wins. A net gain in stores can
  // never be the cause of a decline; a delisted item (no stores) is store loss.
  let declineKind = null;
  if (ok && dollarsYoY !== null && dollarsYoY < 0) {
    if (stores === 0) declineKind = 'store-loss';
    else declineKind = storesChange < 0 && perStoreDollarsYoY !== null && storesChange < perStoreDollarsYoY
      ? 'store-loss' : 'demand-loss';
  }

  // Approximate log decomposition of growth into distribution vs per-store.
  // Only defined for growing items that kept some stores.
  const growthFromStores =
    ok && dollarsYoY !== null && dollarsYoY > 0 && storesChange !== null && storesChange > -1
      ? Math.log(1 + storesChange) / Math.log(1 + dollarsYoY)
      : null;

  const m = master.get(id);
  const c = cat.get(id);
  const p = plan.get(id);

  // ratio() returns null for a missing value or a zero denominator, so a
  // missing planogram number is never turned into a zero share.
  const linearShare = p ? ratio(num(p.linearIn), num(p.categoryLinearIn)) : null;
  const dollarShare = c ? num(c.dollarShare) : null;
  const unitShare = c ? num(c.unitShare) : null;
  let spaceStatus = 'ok';
  if (!ctx.sources.planogram && !ctx.sources.category) spaceStatus = 'missing-both';
  else if (!ctx.sources.planogram) spaceStatus = 'missing-planogram';
  else if (!ctx.sources.category) spaceStatus = 'missing-category';
  else if (linearShare === null || dollarShare === null) spaceStatus = 'missing-item-data';
  else if (linearShare === 0) spaceStatus = 'no-linear-space';
  const spaceOk = spaceStatus === 'ok';
  const idxDollars = spaceOk ? dollarShare / linearShare : null;
  const idxUnits = spaceOk && unitShare !== null ? unitShare / linearShare : null;

  return {
    id,
    name: it.name ?? id,
    short: it.short || it.name || id,
    category: it.category,
    stores,
    storesLY,
    storesChange,
    storesDelta: ok && stores !== null ? stores - storesLY : null,
    yoyStatus,
    units,
    dollars,
    unitsL13,
    dollarsL13,
    unitsLY,
    dollarsLY,
    velocity,
    velocityL13,
    velocityL1,
    dollarsPerStorePerWeek: stores > 0 && dollars !== null ? dollars / (stores * w) : null,
    realizedPrice: ratio(dollars, units),
    mixShare: null, // filled once the total is known
    hero: false,
    dollarsYoY,
    unitsYoY,
    perStoreDollarsYoY,
    momentum: change(velocityL1, velocityL13),
    declineKind,
    growthFromStores,
    master: m
      ? {
          packOz: num(m.packOz),
          shelfPrice: num(m.shelfPrice),
          pricePerOzCents: num(m.packOz) > 0 && num(m.shelfPrice) !== null ? (m.shelfPrice / m.packOz) * 100 : null,
          image: m.image ?? null,
        }
      : null,
    share: c
      ? {
          dollarShare,
          unitShare,
          dollarShareLY: num(c.dollarShareLY),
          shareChange: dollarShare !== null && num(c.dollarShareLY) !== null ? dollarShare - c.dollarShareLY : null,
        }
      : null,
    space: p
      ? {
          facings: num(p.facings),
          categoryFacings: num(p.categoryFacings),
          // Other brands' facings on the same shelf, for drawing the strip.
          otherFacings:
            num(p.facings) !== null && num(p.categoryFacings) !== null && p.categoryFacings >= p.facings
              ? p.categoryFacings - p.facings
              : null,
          // A share above 100% means the planogram is inconsistent: unknown, not shown.
          facingShare: num(p.facings) <= num(p.categoryFacings) ? ratio(num(p.facings), num(p.categoryFacings)) : null,
          linearShare,
          skuShare: ratio(1, num(p.categorySkus)), // each planogram row is one SKU
        }
      : null,
    spaceStatus,
    idxDollars,
    idxUnits,
    spaceVerdict: idxDollars === null ? null : idxDollars >= 1 ? 'above' : 'below',
  };
}

export function computeShelf(input, { window = 'l13', heroCoverage = DEFINITIONS.heroCoverage } = {}) {
  input = input ?? {};
  const pos = input.pos || {};
  // Rows that are not objects or have no id are ignored. A repeated id keeps
  // its first row and is reported in summary.duplicateIds rather than being
  // silently merged (every per-item citation resolves by id).
  const rawItems = [];
  const duplicateIds = [];
  const seenIds = new Set();
  for (const it of Array.isArray(pos.items) ? pos.items : []) {
    if (!it || typeof it !== 'object' || it.id === undefined || it.id === null) continue;
    const id = String(it.id);
    if (seenIds.has(id)) {
      if (!duplicateIds.includes(id)) duplicateIds.push(id);
      continue;
    }
    seenIds.add(id);
    rawItems.push(it);
  }
  const has = (a) => Array.isArray(a) && a.length > 0;
  const sources = {
    pos: rawItems.length > 0,
    itemMaster: has(input.itemMaster),
    category: has(input.category),
    planogram: has(input.planogram),
  };
  const w = DEFINITIONS.windowWeeks[window] ?? DEFINITIONS.windowWeeks.l13;
  const ctx = {
    window: DEFINITIONS.windowWeeks[window] ? window : 'l13',
    w,
    sources,
    master: byId(input.itemMaster),
    cat: byId(input.category),
    plan: byId(input.planogram),
  };

  const items = rawItems.map((it) => itemMetrics(it, ctx));

  // Hero set: fewest items whose cumulative last-13-week dollars reach the
  // coverage. Equal dollars are ranked by item id so the set is deterministic.
  const totalL13 = sum(items.map((i) => i.dollarsL13 ?? 0));
  const ranked = items.filter((i) => i.dollarsL13 !== null).sort((a, b) => b.dollarsL13 - a.dollarsL13 || cmpId(a, b));
  const heroIds = [];
  let cum = 0;
  if (totalL13 > 0) {
    for (const i of ranked) {
      if (cum / totalL13 >= heroCoverage) break;
      cum += i.dollarsL13;
      heroIds.push(i.id);
    }
  }
  for (const i of items) {
    i.hero = heroIds.includes(i.id);
    i.mixShare = totalL13 > 0 && i.dollarsL13 !== null ? i.dollarsL13 / totalL13 : null;
  }

  // Like-for-like: only items with a real prior-year base enter the YoY KPIs
  // and the decomposition. New / missing-LY items are counted, not divided.
  const comparable = items.filter((i) => i.yoyStatus === 'ok');
  const unitComparable = comparable.filter((i) => i.unitsYoY !== null);
  const lyDollars = sum(comparable.map((i) => i.dollarsLY));
  const lyUnits = sum(unitComparable.map((i) => i.unitsLY));
  const cmpDollars = sum(comparable.map((i) => i.dollarsL13));
  const cmpUnits = sum(unitComparable.map((i) => i.unitsL13));
  const withStoresLY = items.filter((i) => i.storesLY !== null && i.stores !== null);
  const points = sum(withStoresLY.map((i) => i.stores));
  const pointsLY = sum(withStoresLY.map((i) => i.storesLY));
  const retailerStores = num(pos.retailerStores);

  const decliners = items.filter((i) => i.declineKind).sort((a, b) => a.dollarsYoY - b.dollarsYoY || cmpId(a, b));
  const growers = comparable.filter((i) => i.dollarsYoY > 0).sort((a, b) => b.dollarsYoY - a.dollarsYoY || cmpId(a, b));

  return {
    meta: pos.meta ?? null,
    window: ctx.window,
    weeks: w,
    definitions: { heroCoverage, windowWeeks: { ...DEFINITIONS.windowWeeks } },
    sources,
    missing: { itemMaster: !sources.itemMaster, category: !sources.category, planogram: !sources.planogram },
    items,
    summary: {
      itemCount: items.length,
      heroIds,
      heroCount: heroIds.length,
      heroShare: totalL13 > 0 && heroIds.length ? cum / totalL13 : null,
      totalDollarsL13: items.length ? totalL13 : null,
      topDeclinerId: decliners[0]?.id ?? null,
      topGrowerId: growers[0]?.id ?? null,
      duplicateIds,
      spaceItemCount: items.filter((i) => i.idxDollars !== null).length,
      newItemCount: items.filter((i) => i.yoyStatus === 'new').length,
      noPriorYearCount: items.filter((i) => i.yoyStatus === 'missing').length,
    },
    kpis: {
      dollars: sumKnown(items.map((i) => i.dollars)),
      units: sumKnown(items.map((i) => i.units)),
      dollarsYoY: change(cmpDollars, lyDollars || null),
      unitsYoY: change(cmpUnits, lyUnits || null),
      comparableCount: comparable.length,
      excludedFromYoyCount: items.length - comparable.length, // new + no-prior-year items
      // Total distribution points = sum of stores selling across items (an
      // average would hide an item dropping out). Compared to LY over the
      // items that have LY store data.
      distributionPoints: sumKnown(items.map((i) => i.stores)),
      distributionPointsChange: change(points, pointsLY || null),
      possiblePoints: retailerStores && items.length ? retailerStores * items.length : null,
      itemCount: items.length,
      heroCount: heroIds.length,
    },
  };
}
