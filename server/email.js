// Report email: a self-contained, email-safe rendering of every report
// section. Charts are compact inline SVGs built from computed metrics JSON;
// the portal link remains for interactive filtering and archive access.

import { CLIENT_BRAND_NAME, BROKER_NAME } from '../shared/constants.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function fmtMoney(v) {
  if (v === null || v === undefined) return '—';
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

function fmtPct(v, digits = 1) {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtChg(v) {
  if (v === null || v === undefined) return '';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(1)}% vs LY`;
}

function fmtNumber(v, digits = 0) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function tableRows(rows) {
  return rows.map(([label, value, change]) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#455468;">${escapeHtml(label)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#15253a;text-align:right;">${escapeHtml(String(value))}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:${change?.startsWith('+') ? '#147447' : change ? '#b3402a' : '#718096'};text-align:right;">${escapeHtml(change || '')}</td>
    </tr>`).join('');
}

function sectionHeading(title, subtitle = '') {
  return `<div style="margin:26px 0 10px;border-bottom:1px solid #dbe4ed;padding-bottom:7px;"><strong style="font-size:15px;color:#102d4b;">${escapeHtml(title)}</strong>${subtitle ? `<span style="margin-left:8px;font-size:12px;color:#718096;">${escapeHtml(subtitle)}</span>` : ''}</div>`;
}

function buildPath(series, key, { width, height, min, range }) {
  const n = series.length;
  const stepX = n > 1 ? width / (n - 1) : 0;
  let d = '';
  let started = false;
  series.forEach((pt, i) => {
    const v = pt[key];
    if (v === null || v === undefined) {
      started = false;
      return;
    }
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    d += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    started = true;
  });
  return d.trim();
}

export function buildMainChartSvg(mainChartSeries) {
  const width = 560;
  const height = 142;
  const stockHeight = 42;
  const padding = 4;

  const values = [];
  for (const pt of mainChartSeries || []) {
    if (pt.posDollars !== null && pt.posDollars !== undefined) values.push(pt.posDollars);
    if (pt.posDollarsLY !== null && pt.posDollarsLY !== undefined) values.push(pt.posDollarsLY);
  }
  if (values.length === 0) {
    return '<p style="color:#666;font-size:13px;">No sales trend data available.</p>';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const tyPath = buildPath(mainChartSeries, 'posDollars', { width, height, min, range });
  const lyPath = buildPath(mainChartSeries, 'posDollarsLY', { width, height, min, range });
  const stockSeries = (mainChartSeries || []).map((pt) => ({ instock: pt.instockPct === null || pt.instockPct === undefined ? null : pt.instockPct * 100 }));
  const stockPath = buildPath(stockSeries, 'instock', { width, height: stockHeight, min: 0, range: 100 });

  return `
<svg width="${width}" height="${height + stockHeight + 34}" viewBox="0 0 ${width} ${height + stockHeight + 34}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="POS dollars, this year versus last year, and in-stock percentage">
  <g transform="translate(0,${padding})">
    <path d="${lyPath}" fill="none" stroke="#b0b7c3" stroke-width="2" />
    <path d="${tyPath}" fill="none" stroke="#1f6feb" stroke-width="2.5" />
  </g>
  <text x="0" y="${height + 19}" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="#617184">In-stock %</text>
  <g transform="translate(0,${height + 25})"><path d="${stockPath}" fill="none" stroke="#e47543" stroke-width="2.5" /></g>
</svg>`.trim();
}

export function buildSupplyChainSvg(series13w) {
  const width = 560;
  const height = 100;
  const series = (series13w || []).map((pt) => ({
    onTime: pt.onTimePct === null || pt.onTimePct === undefined ? null : pt.onTimePct * 100,
    inFull: pt.inFullPct === null || pt.inFullPct === undefined ? null : pt.inFullPct * 100,
  }));
  if (series.length === 0) return '<p style="color:#718096;font-size:13px;">No supply-chain trend data available.</p>';
  const onTimePath = buildPath(series, 'onTime', { width, height, min: 0, range: 100 });
  const inFullPath = buildPath(series, 'inFull', { width, height, min: 0, range: 100 });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="On-time and in-full supply-chain performance"><path d="${onTimePath}" fill="none" stroke="#1f6feb" stroke-width="2.5"/><path d="${inFullPath}" fill="none" stroke="#15936b" stroke-width="2.5"/></svg>`;
}

function buildGeographyHtml(geography = {}) {
  const stateRows = [...(geography.statePerformance || geography.top5States || [])]
    .sort((a, b) => (b['POS $'] || 0) - (a['POS $'] || 0))
    .map((state) => [state.State, fmtMoney(state['POS $']), fmtChg(state['POS $ %Chg vs LY'])]);
  if (stateRows.length === 0) return '<p style="color:#718096;font-size:13px;">No state-level sales data available.</p>';
  return `<table role="presentation" style="width:100%;border-collapse:collapse;">${tableRows(stateRows)}</table>`;
}

function buildItemPerformanceHtml(itemPerformance) {
  const { items, periods, grandTotal } = itemPerformance || {};
  if (!items || items.length === 0) return '<p style="color:#718096;font-size:13px;">Item-level performance was not included in this upload.</p>';
  const period = periods?.includes('L4Wk') ? 'L4Wk' : periods?.[0];
  const valueFor = (item, metric) => item?.metrics?.[metric]?.[period] ?? null;
  const rows = [...items, ...(grandTotal ? [{ ...grandTotal, itemDesc: 'Brand Total' }] : [])].map((item) => `
    <tr>
      <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#15253a;">${escapeHtml(item.itemDesc || item.itemNbr || 'Item')}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;">${escapeHtml(fmtMoney(valueFor(item, 'POS $')))}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;color:${valueFor(item, 'POS $ %Chg vs LY') >= 0 ? '#147447' : '#b3402a'};">${escapeHtml(fmtChg(valueFor(item, 'POS $ %Chg vs LY')))}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;">${escapeHtml(fmtPct(valueFor(item, 'Instock %')))}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;">${escapeHtml(fmtNumber(valueFor(item, 'U/S/W (Valid Store)'), 1))}</td>
    </tr>`).join('');
  return `<p style="margin:0 0 8px;font-size:12px;color:#718096;">${escapeHtml(period || 'Selected period')}</p><table role="presentation" style="width:100%;border-collapse:collapse;"><thead><tr><th align="left" style="padding:6px 8px;background:#eff5f9;font-size:11px;color:#536579;">Item</th><th align="right" style="padding:6px 8px;background:#eff5f9;font-size:11px;color:#536579;">POS $</th><th align="right" style="padding:6px 8px;background:#eff5f9;font-size:11px;color:#536579;">vs LY</th><th align="right" style="padding:6px 8px;background:#eff5f9;font-size:11px;color:#536579;">In-stock</th><th align="right" style="padding:6px 8px;background:#eff5f9;font-size:11px;color:#536579;">Units/store/wk</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function buildReportEmailHtml({ report, portalUrl }) {
  const { metrics, narrative } = report;
  const alerts = metrics.alerts || [];

  const kpiRows = [
    ['L1W Sales', fmtMoney(metrics.kpi.l1wPosDollars), fmtChg(metrics.kpi.l1wPosDollarsChgVsLY)],
    ['L4W Sales', fmtMoney(metrics.kpi.l4wPosDollars), fmtChg(metrics.kpi.l4wPosDollarsChgVsLY)],
    ['Units / Store / Week', fmtNumber(metrics.kpi.l4wAvgUSW, 1), fmtChg(metrics.kpi.l4wAvgUSWChgVsLY)],
    ['In-Stock %', fmtPct(metrics.kpi.l1wInstockPct), ''],
    ['In Full % (OTIF)', fmtPct(metrics.kpi.l1wInFullPct), ''],
    ['Selling Stores', metrics.kpi.l1wPosStoreCount ?? '—', ''],
  ];

  const kpiRowsHtml = tableRows(kpiRows);

  const alertsHtml = alerts.length === 0
    ? '<p style="color:#2e7d32;margin:0;font-size:13px;">No flags this week.</p>'
    : alerts.map((a) => `<div style="padding:8px 12px;margin-bottom:6px;border-radius:4px;background:${a.severity === 'flag' ? '#fdecea' : '#fff8e1'};color:${a.severity === 'flag' ? '#b71c1c' : '#8d6e00'};font-size:13px;">${escapeHtml(a.message)}</div>`).join('');

  const chartSvg = buildMainChartSvg(metrics.mainChartSeries);
  const salesRows = (metrics.mainChartSeries || []).map((pt) => [
    `Week ${pt.week}`,
    fmtMoney(pt.posDollars),
    fmtMoney(pt.posDollarsLY),
    fmtPct(pt.instockPct),
  ]);
  const supplySvg = buildSupplyChainSvg(metrics.otif?.series13w);
  const supplyRows = (metrics.otif?.series13w || []).map((pt) => [
    `Week ${pt.week}`,
    fmtPct(pt.onTimePct),
    fmtPct(pt.inFullPct),
  ]);

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#15253a;">
  <div style="padding:22px 24px;background:#102d4b;color:#fff;">
    <p style="margin:0 0 7px;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#91dff2;">Weekly retail pulse</p>
    <h1 style="font-size:21px;margin:0 0 4px;">${escapeHtml(CLIENT_BRAND_NAME)} — Week ${escapeHtml(metrics.currentWeek)}</h1>
    <p style="font-size:13px;color:#c8e3ef;margin:0;">Complete weekly report</p>
  </div>

  <div style="padding:20px 24px 2px;"><p style="font-size:14px;line-height:1.6;margin:0;">${escapeHtml(narrative.text)}</p>

  ${sectionHeading('Key signals')}
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    ${kpiRowsHtml}
  </table>

  ${sectionHeading('What needs attention')}
  <div>${alertsHtml}</div>

  ${sectionHeading('Sales and availability')}
  <p style="margin:0 0 7px;font-size:11px;color:#617184;">Blue: this-year POS $ · Gray: last-year POS $ · Orange: in-stock %</p>
  <div>${chartSvg}</div>
  ${salesRows.length ? `<p style="margin:10px 0 7px;font-size:12px;color:#617184;">Sales trend detail (available even when charts are blocked by an email client)</p><table role="presentation" style="width:100%;border-collapse:collapse;">${tableRows(salesRows)}</table>` : ''}

  ${sectionHeading('Geography', 'State sales performance')}
  ${buildGeographyHtml(metrics.geography)}

  ${sectionHeading('Fulfilment rhythm')}
  <p style="margin:0 0 7px;font-size:11px;color:#617184;">Blue: on time · Green: in full</p>
  <div>${supplySvg}</div>
  ${supplyRows.length ? `<table role="presentation" style="width:100%;border-collapse:collapse;">${tableRows(supplyRows)}</table>` : ''}

  ${sectionHeading('Item performance')}
  ${buildItemPerformanceHtml(metrics.itemPerformance)}

  <p style="margin:24px 0 0;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#176fa5;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;font-size:14px;font-weight:600;">Open interactive report →</a></p>

  <p style="font-size:11px;color:#718096;margin:24px 0 0;padding:16px 0 22px;border-top:1px solid #dbe4ed;">Prepared by ${escapeHtml(BROKER_NAME)}.</p></div>
</div>`.trim();
}

// Returns { sent: false, reason: 'not_configured' } when RESEND_API_KEY is
// unset — callers must surface this as UI state, never a silent failure.
export async function sendReportEmail({ report, recipients, apiKey, fromAddress, portalUrl }) {
  if (!apiKey) {
    return { sent: false, reason: 'not_configured' };
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error('No recipients selected.');
  }

  const html = buildReportEmailHtml({ report, portalUrl });
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: recipients,
      subject: `${CLIENT_BRAND_NAME} — Weekly Report — Week ${report.metrics.currentWeek}`,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return { sent: true, id: data.id };
}
