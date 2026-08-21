import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtPct, fmtChg, fmtNumber, deltaClass } from '../lib/format.js';

// Curated subset of the ~19 metric groups ABI Studio exports per item —
// mirrors the brand-level KPI cards' choices (sales, growth, units,
// in-stock, selling breadth) rather than surfacing all 19 at item grain.
const DISPLAY_METRICS = [
  { key: 'POS $', label: 'POS $', format: fmtMoney },
  { key: 'POS $ %Chg vs LY', label: 'vs LY', format: fmtChg, isDelta: true },
  { key: 'POS Qty', label: 'Units', format: (v) => fmtNumber(v, 0) },
  { key: 'Instock %', label: 'In-Stock %', format: (v) => fmtPct(v, 1) },
  { key: 'U/S/W (Valid Store)', label: 'Units/Store/Wk', format: (v) => fmtNumber(v, 1) },
  { key: '% of Stores Selling', label: '% Stores Selling', format: (v) => fmtPct(v, 1) },
];

const PERIOD_LABELS = {
  LWk: 'Last Week',
  L4Wk: 'Last 4 Weeks',
  L13Wk: 'Last 13 Weeks',
  L26Wk: 'Last 26 Weeks',
  L52Wk: 'Last 52 Weeks',
  YTD: 'Year to Date',
};

function metricValue(item, metricKey, period) {
  return item.metrics[metricKey]?.[period] ?? null;
}

function topItemNbrsByPosDollars(items, period, n) {
  return [...items]
    .filter((it) => metricValue(it, 'POS $', period) !== null)
    .sort((a, b) => metricValue(b, 'POS $', period) - metricValue(a, 'POS $', period))
    .slice(0, n)
    .map((it) => it.itemNbr);
}

export default function ItemPerformancePanel({ itemPerformance }) {
  const { items, periods, grandTotal } = itemPerformance || {};
  const defaultPeriod = periods?.includes('L4Wk') ? 'L4Wk' : periods?.[0];
  const [period, setPeriod] = useState(defaultPeriod);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set(items ? topItemNbrsByPosDollars(items, defaultPeriod, 5) : []));

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.itemDesc.toLowerCase().includes(q));
  }, [items, search]);

  const selectedItems = useMemo(
    () => (items || []).filter((it) => selected.has(it.itemNbr)),
    [items, selected],
  );

  if (!itemPerformance || !items || items.length === 0) {
    return (
      <div className="item-performance-panel">
        <h3>Item Performance</h3>
        <p className="panel-subtitle">Not included in this week's upload.</p>
      </div>
    );
  }

  function toggleItem(itemNbr) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemNbr)) next.delete(itemNbr);
      else next.add(itemNbr);
      return next;
    });
  }

  return (
    <div className="item-performance-panel">
      <h3>Item Performance</h3>
      <div className="item-performance-controls">
        <label className="item-period-select">
          Period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => (
              <option key={p} value={p}>{PERIOD_LABELS[p] || p}</option>
            ))}
          </select>
        </label>
        <input
          type="text"
          className="item-search"
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="item-picker">
        {filteredItems.map((item) => (
          <label key={item.itemNbr} className="item-picker-row">
            <input
              type="checkbox"
              checked={selected.has(item.itemNbr)}
              onChange={() => toggleItem(item.itemNbr)}
            />
            {item.itemDesc}
          </label>
        ))}
        {filteredItems.length === 0 && <div className="geo-list-empty">No items match "{search}".</div>}
      </div>

      <div className="item-table-wrapper">
        <table className="item-table">
          <thead>
            <tr>
              <th>Item</th>
              {DISPLAY_METRICS.map((m) => <th key={m.key}>{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {selectedItems.length === 0 && (
              <tr><td colSpan={DISPLAY_METRICS.length + 1} className="geo-list-empty">Select one or more items above.</td></tr>
            )}
            {selectedItems.map((item) => (
              <tr key={item.itemNbr}>
                <td>{item.itemDesc}</td>
                {DISPLAY_METRICS.map((m) => {
                  const value = metricValue(item, m.key, period);
                  return (
                    <td key={m.key} className={m.isDelta ? deltaClass(value) : ''}>
                      {value === null ? '—' : m.format(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {grandTotal && (
              <tr className="item-table-total-row">
                <td>Brand Total</td>
                {DISPLAY_METRICS.map((m) => {
                  const value = metricValue(grandTotal, m.key, period);
                  return (
                    <td key={m.key} className={m.isDelta ? deltaClass(value) : ''}>
                      {value === null ? '—' : m.format(value)}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
