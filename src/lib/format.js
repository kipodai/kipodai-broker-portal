export function fmtMoney(v) {
  if (v === null || v === undefined) return '—';
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

export function fmtPct(v, digits = 1) {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtChg(v, digits = 1) {
  if (v === null || v === undefined) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

export function fmtNumber(v, digits = 0) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtWeek(week) {
  if (!week) return '—';
  const year = week.slice(0, 4);
  const wk = week.slice(4);
  return `FY${year} Week ${Number(wk)}`;
}

export function deltaClass(v) {
  if (v === null || v === undefined) return '';
  return v >= 0 ? 'delta-positive' : 'delta-negative';
}
