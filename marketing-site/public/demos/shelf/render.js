// Layer 3 of 3: presentation only. Formats and lays out the metrics object.
// It computes nothing about the business: every value shown here was produced
// by compute.js / takeaways.js. The only arithmetic is layout: turning a 0-1
// share into a CSS percentage width. Row sorting compares metric values.

import { fmtP, fmtShare, fmtPts, fmtX, fmtD, fmtN, fmtInt, fmtDec, cls, esc, plural } from './format.js';
import { packageSvg } from './packageArt.js';

const NA = 'n/a';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const needs = (what) => `<span class="locked">Needs ${what}</span>`;
const minor = (text, c = '') => `<span class="minor${c ? ` ${c}` : ''}">${text}</span>`;
const show = (v, f) => (v === null || v === undefined ? NA : f(v));

// "2026-09-26" -> "Sep 26, 2026". String parsing only, no time zones involved.
function fmtWeek(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m || !MONTHS[Number(m[2]) - 1]) return iso ? String(iso) : '';
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// ---------- columns ----------
const COLUMNS = [
  { key: 'name', label: 'Item', first: true },
  { key: 'price', label: 'Shelf tag' },
  { key: 'stores', label: 'Stores' },
  { key: 'velocity', label: 'Units / store / wk' },
  { key: 'dollarsPerStorePerWeek', label: '$ / store / wk' },
  { key: 'dollars', label: 'Dollars' },
  { key: 'dollarsYoY', label: '$ vs. LY' },
  { key: 'unitsYoY', label: 'Units vs. LY' },
  { key: 'momentum', label: 'Last wk vs. 13-wk' },
  { key: 'dollarShare', label: 'Category $ share', needs: 'category' },
];

const SORT_VALUE = {
  name: (i) => i.name,
  price: (i) => (i.master && i.master.shelfPrice !== null ? i.master.shelfPrice : i.realizedPrice),
  stores: (i) => i.stores,
  velocity: (i) => i.velocity,
  dollarsPerStorePerWeek: (i) => i.dollarsPerStorePerWeek,
  dollars: (i) => i.dollars,
  dollarsYoY: (i) => i.dollarsYoY,
  unitsYoY: (i) => i.unitsYoY,
  momentum: (i) => i.momentum,
  dollarShare: (i) => (i.share ? i.share.dollarShare : null),
};

// Null values sort last in both directions.
function sortItems(items, key, dir) {
  const get = SORT_VALUE[key] || SORT_VALUE.dollars;
  return items
    .map((it, n) => ({ it, n, v: get(it) }))
    .sort((a, b) => {
      const an = a.v === null || a.v === undefined;
      const bn = b.v === null || b.v === undefined;
      if (an || bn) return an === bn ? a.n - b.n : an ? 1 : -1;
      const c = typeof a.v === 'string' ? a.v.localeCompare(b.v, 'en', { numeric: true }) : a.v - b.v;
      return c === 0 ? a.n - b.n : c * dir;
    })
    .map((x) => x.it);
}

// ---------- header pieces ----------
function renderMeta(metrics) {
  const el = document.getElementById('meta-line');
  if (!el) return;
  const meta = metrics.meta || {};
  const n = metrics.summary.itemCount;
  const parts = [];
  if (meta.supplier && meta.retailer) parts.push(`<b>${esc(meta.supplier)}</b> at <b>${esc(meta.retailer)}</b>`);
  parts.push(`${fmtInt(n)} ${plural(n, 'item', 'items')}`);
  if (meta.weekEnding) parts.push(`week ending ${esc(fmtWeek(meta.weekEnding))}`);
  el.innerHTML = parts.join(', ');
}

function renderHeadline(headline) {
  const el = document.getElementById('headline');
  if (!el) return;
  if (!headline) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<p class="headline-text">${esc(headline.text)}</p><details class="calc"><summary>How this was computed</summary><p>${esc(headline.calc)}</p></details>`;
}

function renderKpis(metrics) {
  const { kpis } = metrics;
  const l1 = metrics.window === 'l1';
  const lbl = l1 ? 'last week' : 'last 13 weeks';
  const excl = kpis.excludedFromYoyCount;
  const exclText = excl > 0 ? `, excl. ${fmtInt(excl)} ${plural(excl, 'item', 'items')} with no prior-year base` : '';
  const yoy = (v) => show(v, fmtP);
  const dpSub = [`${show(kpis.distributionPointsChange, fmtP)} vs. last year`];
  if (kpis.possiblePoints) dpSub.push(`of ${fmtInt(kpis.possiblePoints)} possible`);

  const tiles = [
    { v: show(kpis.dollars, fmtD), l: `Dollars, ${lbl}` },
    { v: show(kpis.units, fmtN), l: `Units, ${lbl}` },
    { v: yoy(kpis.dollarsYoY), l: 'Dollars vs. last year', c: cls(kpis.dollarsYoY), n: `13-week basis, like-for-like${exclText}` },
    { v: yoy(kpis.unitsYoY), l: 'Units vs. last year', c: cls(kpis.unitsYoY), n: `13-week basis, like-for-like${exclText}` },
    {
      v: show(kpis.distributionPoints, fmtInt),
      l: 'Distribution points (stores selling, summed across items)',
      n: dpSub.join(', '),
      nc: cls(kpis.distributionPointsChange),
    },
    { v: fmtInt(kpis.itemCount), l: 'Items authorized', n: `${fmtInt(kpis.heroCount)} hero ${plural(kpis.heroCount, 'item', 'items')}` },
  ];
  const el = document.getElementById('kpis');
  if (!el) return;
  el.innerHTML = tiles
    .map(
      (t) =>
        `<div class="kpi"><div class="v${t.c ? ` ${t.c}` : ''}">${esc(t.v)}</div><div class="l">${esc(t.l)}</div>${t.n ? `<div class="d${t.nc || t.c ? ` ${t.nc || t.c}` : ''}">${esc(t.n)}</div>` : ''}</div>`,
    )
    .join('');
}

// ---------- table ----------
function yoyCell(item, value) {
  if (item.yoyStatus === 'new') return 'New';
  if (item.yoyStatus === 'missing' || value === null) return NA;
  return fmtP(value);
}

function itemCell(item, sources) {
  const image = item.master ? packageSvg(item.master.image) : '';
  const missing = sources.itemMaster ? 'No image' : 'Needs item master';
  const thumb = image ? `<div class="thumb">${image}</div>` : `<div class="thumb none">${missing}</div>`;
  const sub = [];
  if (item.master && item.master.packOz !== null) {
    sub.push(`${fmtDec(item.master.packOz, Number.isInteger(item.master.packOz) ? 0 : 1)} oz`);
  }
  sub.push(esc(item.category), `#${esc(item.id)}`);
  return `<td class="first"><div class="item">${thumb}<div><div class="iname">${esc(item.name)}${item.hero ? '<span class="hero">Hero</span>' : ''}</div><div class="isub">${sub.join(', ')}</div></div></div></td>`;
}

function priceCell(item, sources) {
  if (item.master) {
    if (item.master.shelfPrice === null) return `<td>${NA}</td>`;
    const perOz = item.master.pricePerOzCents === null ? '' : `<span class="u">${esc(fmtDec(item.master.pricePerOzCents, 1))} cents per oz</span>`;
    return `<td><span class="tagp"><span class="p">${esc(fmtD(item.master.shelfPrice))}</span>${perOz}</span></td>`;
  }
  if (sources.itemMaster) return `<td>${NA}</td>`;
  if (item.realizedPrice === null) return `<td>${NA}</td>`;
  return `<td>$${esc(fmtDec(item.realizedPrice, 2))}${minor('avg. realized, not shelf')}</td>`;
}

function shareCell(item, sources) {
  if (!item.share) return `<td>${sources.category ? NA : needs('category data')}</td>`;
  const s = item.share;
  const main = show(s.dollarShare, fmtShare);
  const chg = s.shareChange === null ? NA : `${fmtPts(s.shareChange)} vs. LY`;
  return `<td>${esc(main)}${minor(esc(chg), s.shareChange === null ? '' : cls(s.shareChange))}</td>`;
}

function renderTable(metrics, ui) {
  const tbl = document.getElementById('tbl');
  if (!tbl) return;
  const { sources } = metrics;
  const head = COLUMNS.map((c) => {
    const off = c.needs === 'category' && !sources.category;
    const active = !off && ui.sortKey === c.key;
    const aria = active ? ` aria-sort="${ui.sortDir < 0 ? 'descending' : 'ascending'}"` : '';
    return `<th scope="col"${c.first ? ' class="first"' : ''}${aria}><button type="button" data-sort="${c.key}"${off ? ' disabled' : ''}>${esc(c.label)}</button></th>`;
  }).join('');
  tbl.querySelector('thead').innerHTML = `<tr>${head}</tr>`;

  const rows = sortItems(metrics.items, ui.sortKey, ui.sortDir);
  tbl.querySelector('tbody').innerHTML = rows
    .map((i) => {
      const cell = (text, c = '') => `<td${c ? ` class="${c}"` : ''}>${esc(text)}</td>`;
      const storesSub =
        i.yoyStatus === 'new' ? 'New' : i.yoyStatus === 'missing' || i.storesChange === null ? NA : `${fmtP(i.storesChange)} vs. LY`;
      const storesC = i.yoyStatus === 'ok' ? cls(i.storesChange) : '';
      const yD = yoyCell(i, i.dollarsYoY);
      const yU = yoyCell(i, i.unitsYoY);
      return `<tr>${itemCell(i, sources)}${priceCell(i, sources)}<td>${esc(show(i.stores, fmtInt))}${minor(esc(storesSub), storesC)}</td>${cell(show(i.velocity, (v) => fmtDec(v, 1)))}${cell(show(i.dollarsPerStorePerWeek, (v) => `$${fmtDec(v, 2)}`))}<td>${esc(show(i.dollars, fmtD))}${minor(`${esc(show(i.mixShare, (v) => fmtShare(v, 0)))} of supplier $, ${fmtInt(metrics.definitions.windowWeeks.l13)}-wk`)}</td>${cell(yD, i.yoyStatus === 'ok' ? cls(i.dollarsYoY) : '')}${cell(yU, i.yoyStatus === 'ok' ? cls(i.unitsYoY) : '')}${cell(show(i.momentum, fmtP), cls(i.momentum))}${shareCell(i, sources)}</tr>`;
    })
    .join('');
}

// ---------- shelf ----------
function shelfEmpty(sources) {
  const extra = sources.category ? '' : ' Category sales data is also needed for the sales bar.';
  return `<div class="empty"><b>Needs planogram: connect one to compare shelf space with sales.</b>Upload one file per category set with three columns: item, facings, and linear inches for every brand on the shelf.${esc(extra)}</div>`;
}

function verdictOf(item) {
  if (item.spaceStatus === 'no-linear-space') return { x: 'No linear space', t: '', c: 'down' };
  if (item.spaceStatus === 'missing-item-data') return { x: NA, t: '', c: '' };
  if (item.spaceStatus === 'missing-category') return { x: 'Needs category data', t: '', c: '' };
  if (item.idxDollars === null) return { x: NA, t: '', c: '' };
  const above = item.spaceVerdict === 'above';
  return {
    x: fmtX(item.idxDollars),
    t: `${above ? 'More sales than shelf' : 'Less sales than shelf'}${item.idxUnits === null ? '' : `<br>${esc(fmtX(item.idxUnits))} on units`}`,
    c: above ? 'up' : 'down',
  };
}

function bay(item, sources) {
  const sp = item.space;
  const v = verdictOf(item);
  let strip = '';
  let bar = '';
  let labels = '';
  if (sp) {
    const lin = sp.linearShare === null ? 0 : sp.linearShare * 100;
    const art = packageSvg(item.master && item.master.image) || '<span class="pk-empty"></span>';
    const mine = Array.from({ length: sp.facings || 0 }, () => `<div>${art}</div>`).join('');
    const rest = Array.from({ length: sp.otherFacings || 0 }, () => '<i></i>').join('');
    const aria = `${item.short}: ${show(sp.facings, fmtInt)} of ${show(sp.categoryFacings, fmtInt)} facings, ${show(sp.linearShare, (x) => fmtShare(x, 1))} of linear shelf`;
    strip = `<div class="shelf" role="img" aria-label="${esc(aria)}"><div class="hp" style="width:${lin.toFixed(2)}%">${mine}</div><div class="rest">${rest}</div></div>`;
    labels = `<span>Shelf ${esc(show(sp.linearShare, (x) => fmtShare(x, 1)))} of linear, ${esc(show(sp.facings, fmtInt))}/${esc(show(sp.categoryFacings, fmtInt))} facings, ${esc(show(sp.skuShare, (x) => fmtShare(x, 0)))} of SKUs</span>`;
  } else {
    strip = `<div class="shelf-none">${NA}</div>`;
  }
  const sh = item.share;
  if (sources.category && sh && sh.dollarShare !== null && item.spaceStatus !== 'missing-category') {
    const tick = sh.unitShare === null ? '' : `<div class="u" style="left:${(sh.unitShare * 100).toFixed(2)}%"></div>`;
    bar = `<div class="salesbar" aria-hidden="true"><div class="d" style="width:${(sh.dollarShare * 100).toFixed(2)}%"></div>${tick}</div>`;
    labels += `<span>Sales ${esc(fmtShare(sh.dollarShare, 1))} $${sh.unitShare === null ? '' : `, ${esc(fmtShare(sh.unitShare, 1))} units`}</span>`;
  }
  return `<div class="bay"><div class="cat">${esc(item.short)}<span>${esc(item.category)}</span></div><div class="strip">${strip}${bar}<div class="barlabels">${labels}</div></div><div class="verdict"><div class="x ${v.c}">${esc(v.x)}</div><div class="t">${v.t}</div></div></div>`;
}

function renderShelf(metrics) {
  const el = document.getElementById('shelfwrap');
  if (!el) return;
  if (!metrics.sources.planogram) {
    el.innerHTML = shelfEmpty(metrics.sources);
    return;
  }
  const rows = metrics.items
    .map((it, n) => ({ it, n }))
    .sort((a, b) => {
      const av = a.it.idxDollars;
      const bv = b.it.idxDollars;
      if (av === null || bv === null) return av === bv ? a.n - b.n : av === null ? 1 : -1;
      return bv - av || a.n - b.n;
    })
    .map((x) => x.it);
  const legend = `<div class="legend"><span><i class="k-slot"></i>Other brands' facings</span><span><i class="k-sales"></i>Category dollar share</span><span><i class="k-tick"></i>Category unit share</span></div>`;
  el.innerHTML = `${legend}<div class="shelves">${rows.map((i) => bay(i, metrics.sources)).join('')}</div>`;
}

// ---------- takeaways ----------
function renderTakes(takeaways) {
  const el = document.getElementById('takes');
  if (!el) return;
  if (!takeaways || !takeaways.length) {
    el.innerHTML = '<li class="take"><div class="kind"></div><div><p class="tb">No takeaways for the loaded data.</p></div></li>';
    return;
  }
  el.innerHTML = takeaways
    .map(
      (t) =>
        `<li class="take"><div class="kind">${esc(t.kind)}</div><div><h3 class="tt">${esc(t.title)}</h3><p class="tb">${esc(t.body)}</p><details class="calc"><summary>How this was computed</summary><p>${esc(t.calc)}</p></details></div></li>`,
    )
    .join('');
}

// ---------- sources ----------
const SOURCES = [
  { key: 'pos', name: 'POS', text: "Items, units, dollars, stores selling, velocity, and year-over-year change. Comes from the retailer's weekly export." },
  { key: 'itemMaster', name: 'Item master', text: 'Images, pack size, and shelf retail, which make price per ounce possible. Uploaded once, updated when items change.' },
  { key: 'category', name: 'Category data', text: 'Share of category in dollars and units. Needs syndicated data or retailer category totals.' },
  { key: 'planogram', name: 'Planogram', text: "Share of SKUs, facings, and linear shelf. Needs the retailer's planogram or a store audit." },
];

function renderSources(metrics, ui) {
  const el = document.getElementById('sources');
  if (el) {
    el.innerHTML = SOURCES.map((s) => {
      const on = metrics.sources[s.key];
      return `<div class="src${on ? '' : ' off'}"><span class="st${on ? ' up' : ''}">${on ? 'Connected' : 'Not connected'}</span><b>${esc(s.name)}</b><p>${esc(s.text)}</p></div>`;
    }).join('');
  }
  const hint = document.getElementById('tier-hint');
  if (hint) hint.textContent = '';
}

export function renderAll({ metrics, headline, takeaways, ui }) {
  renderMeta(metrics);
  renderHeadline(headline);
  renderKpis(metrics);
  renderTable(metrics, ui);
  renderShelf(metrics);
  renderTakes(takeaways);
  renderSources(metrics, ui);
}
