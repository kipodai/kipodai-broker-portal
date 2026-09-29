import { describe, it, expect } from 'vitest';
import { computeShelf } from '../marketing-site/public/demos/shelf/compute.js';
import { buildTakeaways, buildHeadline, getPath } from '../marketing-site/public/demos/shelf/takeaways.js';
import { buildDemoInput, inputForTier } from '../marketing-site/public/demos/shelf/demoData.js';

const mk = (id, over = {}) => ({
  id, name: `Item ${id}`, short: `Short${id}`, category: 'Cat',
  stores: 1000, storesLY: 1000,
  l13: { units: 13000, dollars: 13000 }, l13LY: { units: 13000, dollars: 13000 }, l1: { units: 1000, dollars: 1000 },
  ...over,
});
const pos = (...items) => ({ pos: { items } });
const kinds = (t) => t.map((x) => x.kind);

// ---------------------------------------------------------------------------
// The important helper: parse every number out of a string and prove each one
// equals the metric the text says it came from.
// ---------------------------------------------------------------------------
const NUMBER = /[+−]?\$?\d+(?:,\d{3})*(?:\.\d+)?(?:[KM%]| pts|×)?/g;

function parseToken(token) {
  let s = token;
  let sign = 1;
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('−')) { sign = -1; s = s.slice(1); }
  let scale = 1;
  if (s.startsWith('$')) s = s.slice(1);
  if (s.endsWith(' pts')) { scale = 100; s = s.slice(0, -4); }
  else if (s.endsWith('%')) { scale = 100; s = s.slice(0, -1); }
  else if (s.endsWith('×')) s = s.slice(0, -1);
  else if (s.endsWith('K')) { scale = 1e-3; s = s.slice(0, -1); }
  else if (s.endsWith('M')) { scale = 1e-6; s = s.slice(0, -1); }
  const decimals = (s.split('.')[1] || '').length;
  const shown = parseFloat(s.replace(/,/g, ''));
  // Value as it should appear in the metrics object, and the rounding slack
  // implied by the digits that were actually printed.
  return { value: (sign * shown) / scale, tolerance: 0.5 * 10 ** -decimals / scale };
}

// Returns a list of problems; empty means every number in `text` is cited and
// matches its metric to the precision shown.
function numberProblems(metrics, text, cites) {
  const problems = [];
  const unused = [...cites];
  for (const token of text.match(NUMBER) ?? []) {
    const at = unused.findIndex((c) => c.token === token);
    if (at === -1) { problems.push(`uncited number "${token}"`); continue; }
    const [cite] = unused.splice(at, 1);
    const metric = getPath(metrics, cite.path);
    if (typeof metric !== 'number' || !Number.isFinite(metric)) { problems.push(`"${token}" cites ${cite.path}, which is ${metric}`); continue; }
    const expected = cite.abs ? Math.abs(metric) : metric;
    const { value, tolerance } = parseToken(token);
    if (Math.abs(value - expected) > tolerance + 1e-12) problems.push(`"${token}" != ${cite.path} (${expected})`);
  }
  return problems;
}

const textsOf = (t) => [['title', t.title], ['body', t.body], ['calc', t.calc]];

function allProblems(metrics) {
  const out = [];
  const head = buildHeadline(metrics);
  if (head) {
    // text and calc share one citer, so they are checked together
    out.push(...numberProblems(metrics, `${head.text} ${head.calc}`, head.cites).map((p) => `headline: ${p}`));
  }
  for (const t of buildTakeaways(metrics)) {
    const both = textsOf(t).map(([, s]) => s).join(' ');
    out.push(...numberProblems(metrics, both, t.cites).map((p) => `${t.kind}: ${p}`));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scenario datasets that reach every branch of the copy.
// ---------------------------------------------------------------------------
const grow = (id, sLY, s, dLY, d, extra = {}) =>
  mk(id, { storesLY: sLY, stores: s, l13: { units: d, dollars: d }, l13LY: { units: dLY, dollars: dLY }, ...extra });

const SCENARIOS = {
  'demo dataset (all tiers)': () => buildDemoInput(),
  'growth from stores and per-store': () => pos(grow('a', 1000, 1100, 1000, 1210), mk('b')),
  'growth where added stores explain more than all of it': () => pos(grow('a', 1000, 1500, 1000, 1200), mk('b')),
  'growth with fewer stores': () => pos(grow('a', 1000, 800, 1000, 1100), mk('b')),
  'growth with unchanged stores': () => pos(grow('a', 1000, 1000, 1000, 1100), mk('b')),
  'growth from stores only': () => pos(grow('a', 1000, 1200, 1000, 1150, { l13: { units: 1150, dollars: 1150 } }), mk('b')),
  'store loss, healthy per-store': () => pos(grow('a', 1000, 800, 100, 90), mk('b')),
  'store loss, per-store also down': () => pos(grow('a', 1000, 700, 100, 50), mk('b')),
  'delisted item': () => pos(grow('a', 1000, 0, 100, 0), mk('b')),
  'demand loss': () => pos(grow('a', 1000, 1000, 100, 80), mk('b')),
  'one item': () => pos(mk('a')),
  'all declining': () => pos(grow('a', 1000, 1000, 100, 90), grow('b', 1000, 900, 100, 50), grow('c', 1000, 1000, 100, 70)),
  'new item present': () => pos(grow('a', 1000, 1000, 1000, 1100), mk('n', { storesLY: 0, l13LY: { units: 0, dollars: 0 } })),
};

describe('every number in every takeaway equals the metric it cites', () => {
  for (const [name, make] of Object.entries(SCENARIOS)) {
    for (const window of ['l13', 'l1']) {
      it(`${name}, ${window}`, () => {
        const input = make();
        const tiers = name.startsWith('demo') ? [1, 2, 3, 4].map((t) => inputForTier(t, input)) : [input];
        for (const inp of tiers) expect(allProblems(computeShelf(inp, { window }))).toEqual([]);
      });
    }
  }

  it('the checker itself catches a wrong number', () => {
    const m = computeShelf(buildDemoInput());
    const t = buildTakeaways(m).find((x) => x.kind === 'Growth driver');
    const both = `${t.title} ${t.body} ${t.calc}`;
    expect(numberProblems(m, both, t.cites)).toEqual([]);
    const tampered = both.replace('21.0%', '22.0%');
    expect(numberProblems(m, tampered, t.cites).length).toBeGreaterThan(0);
  });

  it('the checker catches an uncited number and a mis-pointed citation', () => {
    const m = computeShelf(buildDemoInput());
    const t = buildTakeaways(m)[0];
    expect(numberProblems(m, `${t.title} plus 99`, t.cites).join()).toMatch(/uncited number "99"/);
    const swapped = t.cites.map((c, i) => (i === 0 ? { ...c, path: 'summary.itemCount' } : c));
    expect(numberProblems(m, t.title, swapped).length).toBeGreaterThan(0);
  });

  it('the parser reads signed, grouped, percent, points, multiple and money tokens', () => {
    const text = 'a +12.4% b −7.0% c 2,120 d +2.4 pts e 1.3× f $1.2K g $3.49 h 13-week i 0.0%';
    expect(text.match(NUMBER)).toEqual(['+12.4%', '−7.0%', '2,120', '+2.4 pts', '1.3×', '$1.2K', '$3.49', '13', '0.0%']);
    expect(parseToken('+2.4 pts')).toEqual({ value: 0.024, tolerance: 0.0005 });
    expect(parseToken('$1.2K').value).toBeCloseTo(1200, 6);
  });

  it('every takeaway and headline carries a non-empty calc and at least one citation', () => {
    const m = computeShelf(buildDemoInput());
    for (const t of [buildHeadline(m), ...buildTakeaways(m)]) {
      expect(t.calc.length).toBeGreaterThan(10);
      expect(t.cites.length).toBeGreaterThan(0);
    }
  });

  it('no digits appear in copy except cited numbers (item names carry none)', () => {
    const m = computeShelf(buildDemoInput());
    for (const t of buildTakeaways(m)) {
      const cited = t.cites.length;
      const found = `${t.title} ${t.body} ${t.calc}`.match(NUMBER)?.length ?? 0;
      expect(found).toBe(cited);
    }
  });
});

describe('takeaways are skipped when their source is missing', () => {
  const full = buildDemoInput();
  it.each([
    [1, ['Concentration', 'Growth driver', 'Decline', 'Decline', 'Momentum']],
    [2, ['Concentration', 'Growth driver', 'Decline', 'Decline', 'Momentum']],
    [3, ['Concentration', 'Growth driver', 'Decline', 'Decline', 'Momentum', 'Share']],
    [4, ['Concentration', 'Growth driver', 'Decline', 'Decline', 'Momentum', 'Share', 'Shelf ask', 'Shelf risk']],
  ])('tier %s', (tier, expected) => {
    expect(kinds(buildTakeaways(computeShelf(inputForTier(tier, full))))).toEqual(expected);
  });

  it('a planogram without category data cannot make a shelf takeaway', () => {
    const m = computeShelf({ pos: full.pos, planogram: full.planogram });
    expect(kinds(buildTakeaways(m))).not.toContain('Shelf ask');
    expect(kinds(buildTakeaways(m))).not.toContain('Shelf risk');
  });

  it('category data without a planogram cannot make a shelf takeaway, but still shares', () => {
    const m = computeShelf({ pos: full.pos, category: full.category });
    expect(kinds(buildTakeaways(m))).toContain('Share');
    expect(kinds(buildTakeaways(m))).not.toContain('Shelf ask');
  });

  it('no data yields no takeaways and no headline', () => {
    expect(buildTakeaways(computeShelf({}))).toEqual([]);
    expect(buildTakeaways(null)).toEqual([]);
    expect(buildHeadline(computeShelf({}))).toBeNull();
  });
});

describe('rules choose the right story', () => {
  const first = (m, kind) => buildTakeaways(m).find((t) => t.kind === kind);

  it('store loss vs demand loss picks distinct wording', () => {
    const store = first(computeShelf(SCENARIOS['store loss, healthy per-store']()), 'Decline');
    const demand = first(computeShelf(SCENARIOS['demand loss']()), 'Decline');
    expect(store.title).toMatch(/because the item lost 200 stores/);
    expect(store.body).toMatch(/Winning back distribution/);
    expect(demand.title).toMatch(/in the stores that still carry the item/);
    expect(demand.body).toMatch(/demand problem/);
  });

  it('the growth decomposition is always labelled approx. in the text and the calc', () => {
    const t = first(computeShelf(SCENARIOS['growth from stores and per-store']()), 'Growth driver');
    expect(t.title).toMatch(/approx\./);
    expect(t.calc).toMatch(/Approx\. share/);
    expect(t.calc).toMatch(/log decomposition/);
  });

  it('growth branches differ by where the growth came from', () => {
    const t = (n) => first(computeShelf(SCENARIOS[n]()), 'Growth driver');
    expect(t('growth where added stores explain more than all of it').title).toMatch(/more than all of it/);
    expect(t('growth with fewer stores').title).toMatch(/lost stores/);
    expect(t('growth with unchanged stores').title).toMatch(/no change in store count/);
    expect(t('growth from stores only').body).toMatch(/distribution only/);
  });

  it('a new item gets no growth or decline story (it has no prior-year base) and does not break the copy', () => {
    const m = computeShelf(SCENARIOS['new item present']());
    const stories = buildTakeaways(m).filter((t) => t.kind === 'Growth driver' || t.kind === 'Decline');
    expect(stories.map((t) => t.title).join(' ')).not.toMatch(/Shortn/);
    expect(m.summary.newItemCount).toBe(1);
    expect(m.summary.topGrowerId).toBe('a');
    expect(allProblems(m)).toEqual([]);
  });

  it('no growth takeaway when every item is declining, and every decline is reported', () => {
    const t = buildTakeaways(computeShelf(SCENARIOS['all declining']()));
    expect(kinds(t)).not.toContain('Growth driver');
    expect(kinds(t).filter((k) => k === 'Decline')).toHaveLength(3);
  });

  it('declines are listed steepest first', () => {
    const t = buildTakeaways(computeShelf(SCENARIOS['all declining']())).filter((x) => x.kind === 'Decline');
    expect(t[0].title).toMatch(/^Shortb/);
    expect(t[1].title).toMatch(/^Shortc/);
    expect(t[2].title).toMatch(/^Shorta/);
  });

  it('a lone item makes no momentum takeaway (nothing to compare it with)', () => {
    expect(kinds(buildTakeaways(computeShelf(SCENARIOS['one item']())))).not.toContain('Momentum');
  });

  it('momentum uses the right direction words for a set where everything is above pace', () => {
    const up = (id, l1) => mk(id, { l1: { units: l1, dollars: l1 } });
    const t = first(computeShelf(pos(up('a', 1500), up('b', 1200))), 'Momentum');
    expect(t.title).toMatch(/above its 13-week pace and Shortb ran .* above\./);
  });

  it('shelf ask needs a share-above-parity item; risk needs one below parity', () => {
    const m = computeShelf(buildDemoInput());
    expect(first(m, 'Shelf ask').title).toMatch(/^Pasta/);
    expect(first(m, 'Shelf risk').title).toMatch(/^Cookies/);
    const noneAbove = computeShelf({
      ...pos(mk('a')),
      category: [{ id: 'a', dollarShare: 0.05, unitShare: 0.05 }],
      planogram: [{ id: 'a', facings: 4, categoryFacings: 20, linearIn: 40, categoryLinearIn: 100, categorySkus: 10 }],
    });
    const k = kinds(buildTakeaways(noneAbove));
    expect(k).not.toContain('Shelf ask');
    expect(k).toContain('Shelf risk');
    expect(first(noneAbove, 'Shelf risk').body).not.toMatch(/trade it toward/);
  });

  it('an item with zero linear space is left out of shelf takeaways rather than divided by', () => {
    const m = computeShelf({
      ...pos(mk('a'), mk('b')),
      category: [{ id: 'a', dollarShare: 0.2, unitShare: 0.2 }, { id: 'b', dollarShare: 0.1, unitShare: 0.1 }],
      planogram: [
        { id: 'a', facings: 0, categoryFacings: 20, linearIn: 0, categoryLinearIn: 100, categorySkus: 10 },
        { id: 'b', facings: 2, categoryFacings: 20, linearIn: 10, categoryLinearIn: 100, categorySkus: 10 },
      ],
    });
    const ask = first(m, 'Shelf ask');
    expect(ask.title).toMatch(/^Shortb/);
    expect(ask.calc).toMatch(/Highest of 1 item\./);
    expect(allProblems(m)).toEqual([]);
  });
});

describe('malformed metrics skip a takeaway instead of throwing', () => {
  const corrupt = (mutate) => {
    const input = buildDemoInput();
    mutate(input);
    return computeShelf(input);
  };
  const posItem = (input, id) => input.pos.items.find((i) => i.id === id);
  const BREAD = '418047'; // the declining item
  const SALSA = '418071'; // the top grower
  const PASTA = '418055'; // top of the shelf index

  it.each([
    ['declining item stores are a string', (i) => { posItem(i, BREAD).stores = '1985'; }],
    ['declining item stores are null', (i) => { posItem(i, BREAD).stores = null; }],
    ['top grower stores are NaN', (i) => { posItem(i, SALSA).stores = NaN; }],
    ['top grower last-year stores are missing', (i) => { delete posItem(i, SALSA).storesLY; }],
    ['shelf leader facings are null', (i) => { i.planogram.find((p) => p.id === PASTA).facings = null; }],
    ['shelf leader linear inches are missing', (i) => { delete i.planogram.find((p) => p.id === PASTA).linearIn; }],
    ['category share is missing for one item', (i) => { delete i.category.find((c) => c.id === SALSA).dollarShare; }],
  ])('%s', (_n, mutate) => {
    const m = corrupt(mutate);
    let takeaways;
    let headline;
    expect(() => { takeaways = buildTakeaways(m); headline = buildHeadline(m); }).not.toThrow();
    // Whatever is still said must still be fully cited and correct.
    expect(allProblems(m)).toEqual([]);
    expect(Array.isArray(takeaways)).toBe(true);
    expect(headline === null || typeof headline.text === 'string').toBe(true);
  });

  it('the affected story is dropped while unaffected stories remain', () => {
    const m = corrupt((i) => { posItem(i, BREAD).stores = null; });
    const k = kinds(buildTakeaways(m));
    expect(k).toContain('Concentration');
    expect(k.filter((x) => x === 'Decline')).toHaveLength(1); // Bread skipped, Cookies kept
    const declines = buildTakeaways(m).filter((t) => t.kind === 'Decline').map((t) => t.title).join(' ');
    expect(declines).not.toMatch(/Bread/);
  });

  it('one failing shelf story does not take the other with it', () => {
    const m = corrupt((i) => { i.planogram.find((p) => p.id === PASTA).facings = null; });
    const k = kinds(buildTakeaways(m));
    expect(k).not.toContain('Shelf ask');
    expect(k).toContain('Shelf risk');
  });

  it('item ids containing dots, hashes or percent signs are still citable and verified', () => {
    const ids = ['1.5', '2', 'a#b', '50%.x'];
    const m = computeShelf(pos(
      grow(ids[0], 1000, 1100, 1000, 1210, { short: 'Aa' }), grow(ids[1], 1000, 800, 100, 90, { short: 'Bb' }),
      grow(ids[2], 1000, 1000, 100, 60, { short: 'Cc' }), mk(ids[3], { short: 'Dd' }),
    ));
    const t = buildTakeaways(m);
    expect(kinds(t)).toEqual(expect.arrayContaining(['Concentration', 'Growth driver', 'Decline', 'Momentum']));
    expect(kinds(t).filter((k) => k === 'Decline')).toHaveLength(2);
    expect(allProblems(m)).toEqual([]);
    expect(`${t.map((x) => x.title + x.body + x.calc).join(' ')}`).not.toMatch(/undefined|null|NaN/);
  });

  it('a corrupted decline kind skips that story instead of printing "undefined"', () => {
    const m = computeShelf(SCENARIOS['demand loss']());
    m.items.find((i) => i.declineKind).declineKind = 42;
    const t = buildTakeaways(m);
    expect(kinds(t)).not.toContain('Decline');
    expect(JSON.stringify(t)).not.toMatch(/undefined/);
    expect(JSON.stringify(buildHeadline(m) ?? '')).not.toMatch(/undefined/);
  });

  it('a genuine programming error is not swallowed', () => {
    expect(() => buildTakeaways({ items: [{}], sources: {}, summary: null })).toThrow();
  });
});

describe('copy makes no claim the data cannot support', () => {
  it('does not talk about traffic or say a share gain is "taken from competitors"', () => {
    const all = buildTakeaways(computeShelf(buildDemoInput())).map((t) => `${t.title} ${t.body}`).join(' ');
    expect(all).not.toMatch(/traffic/i);
    expect(all).not.toMatch(/taken from competitors/i);
  });
});

describe('grammar comes from counts, not from item names', () => {
  it.each([
    ['one hero', 'one item', 'accounts for', '1 of 1 item'],
    ['several heroes', 'demo', 'account for', 'items'],
  ])('%s', (_n, which, verb, fragment) => {
    const m = computeShelf(which === 'one item' ? SCENARIOS['one item']() : buildDemoInput());
    const t = buildTakeaways(m)[0];
    expect(t.title).toContain(verb);
    expect(t.title).toContain(fragment);
  });

  it('a name that ends in "s" or looks plural still reads correctly in every position', () => {
    for (const short of ['Cookies', 'Oats', 'Fries', 'Bread', 'Pasta']) {
      const items = [
        grow('a', 1000, 800, 100, 90, { short }),
        grow('b', 1000, 1000, 1000, 1210, { short: 'Other' }),
      ];
      const m = computeShelf(pos(...items));
      // A name is never the subject of a verb. "Sales of X are ..." is fine:
      // the verb agrees with "Sales".
      const asSubject = new RegExp(`(?<!Sales of )\\b${short} (is|are|has|have|earns|earn|makes|make|holds|hold|ran|gained)\\b`);
      for (const t of buildTakeaways(m)) {
        if (t.kind === 'Momentum' || t.kind === 'Share') continue; // "X ran ..." / "X gained ..." are past tense: no agreement
        expect(`${t.title} ${t.body}`).not.toMatch(asSubject);
      }
      expect(buildHeadline(m).text).not.toMatch(asSubject);
    }
  });

  it('is deterministic: same metrics, same words', () => {
    const m = computeShelf(buildDemoInput());
    expect(buildTakeaways(m)).toEqual(buildTakeaways(m));
    expect(buildHeadline(m)).toEqual(buildHeadline(m));
  });

  it('does not depend on input order', () => {
    const input = buildDemoInput();
    const shuffled = { ...input, pos: { ...input.pos, items: [...input.pos.items].reverse() } };
    const norm = (ts) => ts.map(({ kind, title, body, calc }) => ({ kind, title, body, calc }));
    expect(norm(buildTakeaways(computeShelf(shuffled)))).toEqual(norm(buildTakeaways(computeShelf(input))));
  });
});

describe('headline', () => {
  it('states the hero share and names the biggest decliner with its cause', () => {
    const h = buildHeadline(computeShelf(buildDemoInput()));
    expect(h.text).toMatch(/^61% of dollars come from 4 items: Salsa, Coffee, Oats and Ranch\./);
    expect(h.text).toMatch(/Sales of Bread are down because of lost stores, not lost shoppers\./);
  });
  it('does not claim shoppers held up when per-store dollars fell too', () => {
    const h = buildHeadline(computeShelf(SCENARIOS['store loss, per-store also down']()));
    expect(h.text).toMatch(/mostly because of lost stores\./);
    expect(h.text).not.toMatch(/not lost shoppers/);
  });
  it('uses the demand-loss sentence for a demand decline', () => {
    expect(buildHeadline(computeShelf(SCENARIOS['demand loss']())).text).toMatch(/falling in the stores that still carry it/);
  });
  it('is just the concentration line when nothing is declining', () => {
    const h = buildHeadline(computeShelf(pos(grow('a', 1000, 1000, 1000, 1100), grow('b', 1000, 1000, 1000, 1200))));
    expect(h.text).not.toMatch(/Sales of/);
  });
});
