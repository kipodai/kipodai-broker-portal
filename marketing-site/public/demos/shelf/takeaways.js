// Layer 2 of 3: deterministic takeaways. A pure function over the metrics
// object from compute.js. No LLM, no randomness, no DOM.
//
// Rules:
//  - Every rule reads only the metrics object. A rule whose source is missing
//    (or whose subject does not exist) returns nothing; it is skipped, not faked.
//  - Every number in the text is produced through the citer, which records the
//    metrics path it was read from. The same variables build the visible copy
//    and the "How this was computed" string, so they cannot drift apart, and
//    the test suite re-derives each cited number from the metrics object.
//  - Grammar is chosen from counts we hold (plural()), never by inspecting an
//    item name. Item names only appear as objects or modifiers ("Salsa sales
//    are ...", "Sales of Salsa are ..."), never as the subject of a verb.

import { fmtP, fmtAbsP, fmtShare, fmtPts, fmtX, fmtD, fmtN, fmtInt, fmtDec, list, plural } from './format.js';

export function getPath(obj, path) {
  return path.split('.').reduce((acc, seg) => {
    if (acc === null || acc === undefined) return undefined;
    const h = seg.indexOf('#');
    if (h === -1) return acc[seg];
    const rows = acc[seg.slice(0, h)];
    const id = decodeURIComponent(seg.slice(h + 1));
    return Array.isArray(rows) ? rows.find((r) => String(r.id) === id) : undefined;
  }, obj);
}

// Ids are percent-encoded inside a path so an id containing "." or "#" cannot break it.
const P = (item, field) => `items#${encodeURIComponent(String(item.id)).replace(/\./g, '%2E')}.${field}`;
const cmpId = (a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true });

// Thrown when a rule tries to cite a metric that is null or not finite. A rule
// that cannot cite everything it says is skipped, never faked or half-written.
class CitationError extends Error {}
const attempt = (fn) => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof CitationError) return null;
    throw e;
  }
};

function makeCiter(metrics) {
  const cites = [];
  const read = (path) => {
    const v = getPath(metrics, path);
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new CitationError(`takeaways: ${path} is not a number`);
    return v;
  };
  const cite = (format, abs = false) => (path, ...args) => {
    const v = read(path);
    const token = format(abs ? Math.abs(v) : v, ...args);
    cites.push({ token, path, abs });
    return token;
  };
  return {
    cites,
    pct: cite(fmtP),          // signed:  +12.4%
    absPct: cite(fmtAbsP, true), // unsigned: 12.4%  (direction is stated in words)
    share: cite(fmtShare),    // a share: 62%
    pts: cite(fmtPts),        // +0.4 pts
    x: cite(fmtX),            // 1.3×
    usd: cite(fmtD),
    n: cite(fmtN),
    int: cite(fmtInt),
    absInt: cite(fmtInt, true),
    dec: cite(fmtDec),
  };
}

const heroItems = (m) =>
  m.items.filter((i) => i.hero).sort((a, b) => b.dollarsL13 - a.dollarsL13 || cmpId(a, b));
const itemById = (m, id) => (id === null ? undefined : m.items.find((i) => i.id === id));
const L13 = 'definitions.windowWeeks.l13';
const KIND_LABELS = { 'store-loss': 'store loss', 'demand-loss': 'demand loss' };
const KIND_LABEL = new Proxy(KIND_LABELS, {
  get: (t, k) => {
    if (!Object.hasOwn(t, k)) throw new CitationError(`takeaways: unknown decline kind ${String(k)}`);
    return t[k];
  },
});

export const buildHeadline = (m) => attempt(() => headlineRule(m));

function headlineRule(m) {
  const s = m.summary;
  if (!s.heroCount || s.heroShare === null) return null;
  const c = makeCiter(m);
  const heroes = heroItems(m);
  let text = `${c.share('summary.heroShare', 0)} of dollars come from ${c.int('summary.heroCount')} ${plural(s.heroCount, 'item', 'items')}: ${list(heroes.map((h) => h.short))}.`;
  let calc = `Hero set covers ${c.share('summary.heroShare', 1)} of last ${c.int(L13)} weeks dollars across ${c.int('summary.itemCount')} ${plural(s.itemCount, 'item', 'items')}.`;

  const d = itemById(m, s.topDeclinerId);
  if (d) {
    if (d.declineKind === 'store-loss') {
      const shoppersHeld = d.perStoreDollarsYoY === null || d.perStoreDollarsYoY >= 0;
      text += shoppersHeld
        ? ` Sales of ${d.short} are down because of lost stores, not lost shoppers.`
        : ` Sales of ${d.short} are down mostly because of lost stores.`;
    } else {
      text += ` Sales of ${d.short} are falling in the stores that still carry it.`;
    }
    calc += ` Largest decline: ${d.short} ${c.pct(P(d, 'dollarsYoY'))} vs. last year, classified as ${KIND_LABEL[d.declineKind]}.`;
  }
  return { text, calc, cites: c.cites };
}

function concentration(m) {
  const s = m.summary;
  if (!s.heroCount || s.heroShare === null) return null;
  const c = makeCiter(m);
  const heroes = heroItems(m);
  const lead = m.items
    .filter((i) => i.velocityL13 !== null)
    .sort((a, b) => b.velocityL13 - a.velocityL13 || cmpId(a, b))[0];

  const title = `${c.int('summary.heroCount')} of ${c.int('summary.itemCount')} ${plural(s.itemCount, 'item', 'items')} ${plural(s.heroCount, 'accounts for', 'account for')} ${c.share('summary.heroShare', 0)} of dollars.`;
  let body = `Hero items: ${list(heroes.map((h) => h.short))}.`;
  if (lead && !lead.hero) {
    body += ` Top unit velocity: ${lead.short} at ${c.dec(P(lead, 'velocityL13'))} units per store per week, an item outside the hero set by dollars, so it adds unit volume more than dollars.`;
  }
  const calc = `Items ranked by last ${c.int(L13)} weeks dollars; hero set = fewest items whose cumulative share reaches ${c.share('definitions.heroCoverage', 0)}; equal dollars are ranked by item ID. ${heroes.map((h) => `${h.short} ${c.share(P(h, 'mixShare'), 1)}`).join(', ')}.`;
  return { kind: 'Concentration', title, body, calc, cites: c.cites };
}

function growth(m) {
  const g = itemById(m, m.summary.topGrowerId);
  if (!g) return null;
  const c = makeCiter(m);
  const s = g.growthFromStores;
  const up = c.absPct(P(g, 'dollarsYoY'));

  let title;
  if (s !== null && s > 0 && s <= 1) {
    title = `${g.short} sales are up ${up}; approx. ${c.share(P(g, 'growthFromStores'), 0)} of that came from net new stores.`;
  } else if (s !== null && s > 1) {
    title = `${g.short} sales are up ${up}; added stores alone explain more than all of it (approx. ${c.share(P(g, 'growthFromStores'), 0)}) because dollars per store fell.`;
  } else if (s !== null && s < 0) {
    title = `${g.short} sales are up ${up} even though the item lost stores.`;
  } else if (s === 0) {
    title = `${g.short} sales are up ${up} with no change in store count.`;
  } else {
    title = `${g.short} sales are up ${up}.`;
  }

  let closing;
  if (g.storesChange > 0 && g.perStoreDollarsYoY > 0) closing = 'Growth from both sources is sturdier than growth from distribution alone.';
  else if (g.storesChange > 0) closing = 'Growth is coming from distribution only; dollars per store are not growing.';
  else closing = 'Growth is coming from higher dollars per store, not from distribution.';
  const body = `Stores went from ${c.int(P(g, 'storesLY'))} to ${c.int(P(g, 'stores'))}, and dollars per store changed ${c.pct(P(g, 'perStoreDollarsYoY'))}. ${closing}`;

  let calc = `Dollars vs. last year ${c.pct(P(g, 'dollarsYoY'))}; store count vs. last year ${c.pct(P(g, 'storesChange'))}; dollars per store vs. last year ${c.pct(P(g, 'perStoreDollarsYoY'))} (this year's dollars per store over last year's, shown as a change).`;
  if (s !== null) {
    calc += ` Approx. share from stores = ln(store ratio) ÷ ln(dollar ratio) = ${c.share(P(g, 'growthFromStores'), 1)}. This log decomposition is one defensible method, not the only one; new and no-prior-year items are excluded.`;
  }
  return { kind: 'Growth driver', title, body, calc, cites: c.cites };
}

function declines(m) {
  return m.items
    .filter((i) => i.declineKind)
    .sort((a, b) => a.dollarsYoY - b.dollarsYoY || cmpId(a, b))
    .map((d) => attempt(() => {
      const c = makeCiter(m);
      const down = c.absPct(P(d, 'dollarsYoY'));
      let title;
      let body;
      if (d.declineKind === 'store-loss') {
        const lost = Math.abs(d.storesDelta);
        title = `${d.short} sales are down ${down} because the item lost ${c.absInt(P(d, 'storesDelta'))} ${plural(lost, 'store', 'stores')}.`;
        if (d.stores === 0) body = 'The item is no longer selling in any store, so distribution is the only lever.';
        else if (d.perStoreDollarsYoY >= 0) body = `Dollars per store are ${c.pct(P(d, 'perStoreDollarsYoY'))} vs. last year, so shoppers who can find it are still buying. Winning back distribution is the fix, not promotion.`;
        else body = `Dollars per store are also ${c.pct(P(d, 'perStoreDollarsYoY'))} vs. last year, but the store loss is the larger drag. Recover distribution first.`;
      } else {
        title = `${d.short} sales are down ${down} in the stores that still carry the item.`;
        body = `Store count changed ${c.pct(P(d, 'storesChange'))}, so this is a demand problem, not a distribution problem. Look at price gaps and competitor activity before the next line review.`;
      }
      const calc = `Dollars vs. last year ${c.pct(P(d, 'dollarsYoY'))}; store count vs. last year ${c.pct(P(d, 'storesChange'))}${d.perStoreDollarsYoY === null ? '' : `; dollars per store vs. last year ${c.pct(P(d, 'perStoreDollarsYoY'))}`}. Rule: store loss when the store count fell by more than dollars per store changed, otherwise demand loss. Result: ${KIND_LABEL[d.declineKind]}.`;
      return { kind: 'Decline', title, body, calc, cites: c.cites };
    }))
    .filter(Boolean); // each decline is attempted on its own; a bad one is skipped alone
}

function momentum(m) {
  const cand = m.items
    .filter((i) => i.momentum !== null)
    .sort((a, b) => b.momentum - a.momentum || cmpId(a, b));
  if (cand.length < 2) return null;
  const hi = cand[0];
  const lo = cand[cand.length - 1];
  if (hi.momentum === lo.momentum) return null;
  const c = makeCiter(m);
  const dir = (i) => (i.momentum >= 0 ? 'above' : 'below');
  const title = `Last week, ${hi.short} ran ${c.absPct(P(hi, 'momentum'))} ${dir(hi)} its ${c.int(L13)}-week pace and ${lo.short} ran ${c.absPct(P(lo, 'momentum'))} ${dir(lo)}.`;
  const body = 'One week is noisy. Watch whether both hold for a second week before acting.';
  const calc = `Last week's units per store per week over the ${c.int(L13)}-week average, shown as a change. ${hi.short}: ${c.dec(P(hi, 'velocityL1'))} over ${c.dec(P(hi, 'velocityL13'))}. ${lo.short}: ${c.dec(P(lo, 'velocityL1'))} over ${c.dec(P(lo, 'velocityL13'))}. Highest and lowest shown.`;
  return { kind: 'Momentum', title, body, calc, cites: c.cites };
}

function categoryShare(m) {
  if (!m.sources.category) return null;
  const cand = m.items
    .filter((i) => i.share && i.share.shareChange !== null)
    .sort((a, b) => b.share.shareChange - a.share.shareChange || cmpId(a, b));
  const sg = cand[0];
  if (!sg || sg.share.shareChange <= 0) return null;
  const c = makeCiter(m);
  const title = `${sg.short} gained the most category share: ${c.pts(P(sg, 'share.shareChange'))} to ${c.share(P(sg, 'share.dollarShare'))}.`;
  const body = 'A rising share means the item grew faster than its category, so the gain did not come from category growth alone. That is a strong story for a buyer.';
  const calc = `Category dollar share this year (${c.share(P(sg, 'share.dollarShare'))}) minus last year (${c.share(P(sg, 'share.dollarShareLY'))}), from category data.`;
  return { kind: 'Share', title, body, calc, cites: c.cites };
}

function shelf(m) {
  if (!m.sources.category || !m.sources.planogram) return null;
  const cand = m.items
    .filter((i) => i.idxDollars !== null)
    .sort((a, b) => b.idxDollars - a.idxDollars || cmpId(a, b));
  if (!cand.length) return null;
  const best = cand[0];
  const worst = cand[cand.length - 1];
  const out = [];
  const facingWord = (i) => plural(i.space.facings, 'facing', 'facings');
  const holds = (i) => plural(i.space.facings, 'holds', 'hold');

  const askable = best.spaceVerdict === 'above';
  // Ask and risk are attempted independently: one failing to cite skips only itself.
  const ask = askable && attempt(() => {
    const c = makeCiter(m);
    const title = `${best.short} at ${c.x(P(best, 'idxDollars'))} its share of shelf: the strongest case for more facings at the next reset.`;
    let body = `Its ${c.int(P(best, 'space.facings'))} ${facingWord(best)} ${holds(best)} ${c.share(P(best, 'space.linearShare'))} of linear space and produce${best.space.facings === 1 ? 's' : ''} ${c.share(P(best, 'share.dollarShare'))} of category dollars.`;
    if (best.idxUnits !== null) {
      body += ` On units it is ${c.x(P(best, 'idxUnits'))}, so the case ${best.idxUnits >= 1 ? 'holds on volume, not just price.' : 'rests more on price than on volume.'}`;
    }
    const calc = `Dollar share ÷ linear share = ${c.share(P(best, 'share.dollarShare'))} ÷ ${c.share(P(best, 'space.linearShare'))}. Unit basis uses unit share instead. Highest of ${c.int('summary.spaceItemCount')} ${plural(m.summary.spaceItemCount, 'item', 'items')}.`;
    return { kind: 'Shelf ask', title, body, calc, cites: c.cites };
  });
  if (ask) out.push(ask);

  const risk = worst.spaceVerdict === 'below' && attempt(() => {
    const c = makeCiter(m);
    const title = `${worst.short} at only ${c.x(P(worst, 'idxDollars'))} its share of shelf: the most exposed item at line review.`;
    let body = `Its ${c.int(P(worst, 'space.facings'))} ${facingWord(worst)} and ${c.share(P(worst, 'space.linearShare'))} of linear space produce ${c.share(P(worst, 'share.dollarShare'))} of category dollars. Offer to give back a facing before the buyer takes one`;
    body += askable && best.id !== worst.id ? `, and trade it toward ${best.short}.` : '.';
    const calc = `Dollar share ÷ linear share = ${c.share(P(worst, 'share.dollarShare'))} ÷ ${c.share(P(worst, 'space.linearShare'))}. Unit basis uses unit share instead. Lowest of ${c.int('summary.spaceItemCount')} ${plural(m.summary.spaceItemCount, 'item', 'items')}.`;
    return { kind: 'Shelf risk', title, body, calc, cites: c.cites };
  });
  if (risk) out.push(risk);
  return out;
}

export function buildTakeaways(metrics) {
  if (!metrics || !metrics.items || !metrics.items.length) return [];
  return [concentration, growth, declines, momentum, categoryShare, shelf].flatMap((rule) => attempt(() => rule(metrics)) ?? []);
}
