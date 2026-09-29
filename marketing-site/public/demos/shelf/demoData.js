// Synthetic demo data only. Clover Provisions, Maple Row Market and every item
// below are fictional. Nothing here comes from a real supplier, retailer or
// syndicated source. Item IDs, categories, pack sizes and velocities follow
// the reference prototype; names are original brand-style names.
//
// The rows below are the raw "inputs". buildDemoInput() turns them into the
// four typed sources compute.js expects (pos, itemMaster, category, planogram),
// so the demo exercises the same path a real upload would.

export const DEMO_LABEL = 'Demo with synthetic data';

const WEEKS_L13 = 13;

// v13/v1: units per store per week. price: shelf retail. realized: average
// realized price as a fraction of shelf (promotions), so POS-only mode shows a
// realized price that visibly differs from the shelf tag.
// yoyD/yoyU: last-13-week dollars/units vs last year. null LY stores = new item.
// dShare/uShare/dShareLY: category share. fac/facCat/lin/linCat/skuCat: planogram.
const ROWS = [
  { id: '418022', name: 'Golden Ridge Rolled Oats', short: 'Oats', oz: 42, cat: 'Hot cereal', kind: 'canister', color: '#C8923E',
    price: 4.29, realized: 0.97, v13: 11.9, v1: 11.2, st: 2310, stLY: 2290, yoyD: 0.031, yoyU: 0.018,
    dShare: 0.184, uShare: 0.149, dShareLY: 0.180, fac: 3, facCat: 38, lin: 18, linCat: 132, skuCat: 14 },
  { id: '418039', name: 'Larkspur Medium Roast Coffee', short: 'Coffee', oz: 12, cat: 'Coffee', kind: 'bag', color: '#5A3825',
    price: 6.49, realized: 0.98, v13: 9.5, v1: 10.4, st: 2280, stLY: 2105, yoyD: 0.124, yoyU: 0.090,
    dShare: 0.098, uShare: 0.112, dShareLY: 0.089, fac: 2, facCat: 52, lin: 9, linCat: 180, skuCat: 22 },
  { id: '418047', name: 'Hearthstone Honey Wheat Bread', short: 'Bread', oz: 24, cat: 'Bakery', kind: 'loaf', color: '#D9A441',
    price: 2.99, realized: 0.94, v13: 17.9, v1: 16.1, st: 1985, stLY: 2195, yoyD: -0.070, yoyU: -0.086,
    dShare: 0.121, uShare: 0.135, dShareLY: 0.134, fac: 4, facCat: 46, lin: 20, linCat: 168, skuCat: 18 },
  { id: '418055', name: 'Bellavia Penne Rigate', short: 'Pasta', oz: 16, cat: 'Dry pasta', kind: 'box', color: '#2E6DB4',
    price: 1.29, realized: 0.97, v13: 24.7, v1: 25.9, st: 2395, stLY: 2380, yoyD: 0.088, yoyU: 0.061,
    dShare: 0.216, uShare: 0.248, dShareLY: 0.210, fac: 3, facCat: 40, lin: 12, linCat: 120, skuCat: 16 },
  { id: '418063', name: 'Orchard Lane Buttermilk Ranch', short: 'Ranch', oz: 16, cat: 'Dressings', kind: 'bottle', color: '#6FA34A',
    price: 2.79, realized: 0.99, v13: 16.5, v1: 16.9, st: 2340, stLY: 2330, yoyD: 0.042, yoyU: 0.025,
    dShare: 0.113, uShare: 0.120, dShareLY: 0.112, fac: 3, facCat: 44, lin: 10, linCat: 132, skuCat: 20 },
  { id: '418071', name: 'Cantina Sol Roasted Salsa', short: 'Salsa', oz: 16, cat: 'Refrigerated salsa', kind: 'tub', color: '#C0392B',
    price: 3.49, realized: 0.95, v13: 21.6, v1: 23.8, st: 2360, stLY: 2120, yoyD: 0.210, yoyU: 0.172,
    dShare: 0.197, uShare: 0.181, dShareLY: 0.173, fac: 2, facCat: 28, lin: 8, linCat: 84, skuCat: 12 },
  { id: '418088', name: 'Sweetwater Oatmeal Cookies', short: 'Cookies', oz: 14, cat: 'Cookies', kind: 'tray', color: '#8E5AA8',
    price: 3.19, realized: 0.93, v13: 7.6, v1: 6.9, st: 1870, stLY: 1880, yoyD: -0.024, yoyU: -0.041,
    dShare: 0.042, uShare: 0.046, dShareLY: 0.047, fac: 4, facCat: 60, lin: 22, linCat: 210, skuCat: 26 },
  { id: '418096', name: 'Tuscan Fold Flatbread Pizza', short: 'Flatbread', oz: 14.4, cat: 'Frozen pizza', kind: 'pizzabox', color: '#D2692B',
    price: 4.99, realized: 0.98, v13: 13.7, v1: 14.2, st: 1320, stLY: 1150, yoyD: 0.149, yoyU: 0.110,
    dShare: 0.089, uShare: 0.074, dShareLY: 0.078, fac: 2, facCat: 48, lin: 10, linCat: 200, skuCat: 24 },
  // New this year: no last-year stores or sales, so YoY shows "New" and the
  // item is left out of the growth decomposition.
  { id: '418104', name: 'Fern & Field Garden Pesto', short: 'Pesto', oz: 7, cat: 'Refrigerated sauces', kind: 'tub', color: '#4E8B3A',
    price: 5.99, realized: 0.96, v13: 9.8, v1: 10.1, st: 640, stLY: 0, yoyD: null, yoyU: null,
    dShare: 0.038, uShare: 0.041, dShareLY: null, fac: 2, facCat: 30, lin: 8, linCat: 96, skuCat: 14 },
];

export function buildDemoInput() {
  const pos = {
    meta: { supplier: 'Clover Provisions', retailer: 'Maple Row Market', weekEnding: '2026-09-26' },
    retailerStores: 2400,
    items: ROWS.map((r) => {
      const unitsL13 = Math.round(r.v13 * r.st * WEEKS_L13);
      const unitsL1 = Math.round(r.v1 * r.st);
      const avg = r.price * r.realized;
      const isNew = r.stLY === 0;
      return {
        id: r.id,
        name: r.name,
        short: r.short,
        category: r.cat,
        stores: r.st,
        storesLY: r.stLY,
        l13: { units: unitsL13, dollars: Math.round(unitsL13 * avg * 100) / 100 },
        l13LY: isNew
          ? { units: 0, dollars: 0 }
          : {
              units: Math.round(unitsL13 / (1 + r.yoyU)),
              dollars: Math.round((unitsL13 * avg * 100) / (1 + r.yoyD)) / 100,
            },
        l1: { units: unitsL1, dollars: Math.round(unitsL1 * avg * 100) / 100 },
      };
    }),
  };
  const itemMaster = ROWS.map((r) => ({
    id: r.id,
    packOz: r.oz,
    shelfPrice: r.price,
    image: { kind: r.kind, color: r.color },
  }));
  const category = ROWS.map((r) => ({
    id: r.id,
    dollarShare: r.dShare,
    unitShare: r.uShare,
    dollarShareLY: r.dShareLY,
  }));
  const planogram = ROWS.map((r) => ({
    id: r.id,
    facings: r.fac,
    categoryFacings: r.facCat,
    linearIn: r.lin,
    categoryLinearIn: r.linCat,
    categorySkus: r.skuCat,
  }));
  return { pos, itemMaster, category, planogram };
}

// Which of the four sources are "connected" at each tier of the demo toggle.
export const TIERS = [
  { value: 1, label: 'POS only', sources: ['pos'] },
  { value: 2, label: 'POS + item master', sources: ['pos', 'itemMaster'] },
  { value: 3, label: '+ category data', sources: ['pos', 'itemMaster', 'category'] },
  { value: 4, label: '+ planogram', sources: ['pos', 'itemMaster', 'category', 'planogram'] },
];

export function inputForTier(tierValue, full = buildDemoInput()) {
  const tier = TIERS.find((t) => t.value === Number(tierValue)) ?? TIERS[TIERS.length - 1];
  const out = {};
  for (const key of tier.sources) out[key] = full[key];
  return out;
}
