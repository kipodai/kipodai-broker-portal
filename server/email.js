// Report email: self-contained HTML with inline styles, main chart as an
// inline SVG built from the metrics JSON (no server-side chart rendering
// dependency), and a prominent "View full report" CTA. The portal is the
// visual experience; the email is the digest — exec summary, KPI table,
// alerts, link only.

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
  const height = 140;
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

  return `
<svg width="${width}" height="${height + padding * 2}" viewBox="0 0 ${width} ${height + padding * 2}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="POS dollars, this year vs last year">
  <g transform="translate(0,${padding})">
    <path d="${lyPath}" fill="none" stroke="#b0b7c3" stroke-width="2" />
    <path d="${tyPath}" fill="none" stroke="#1f6feb" stroke-width="2.5" />
  </g>
</svg>`.trim();
}

export function buildReportEmailHtml({ report, portalUrl }) {
  const { metrics, narrative } = report;

  const kpiRows = [
    ['L1W Sales', fmtMoney(metrics.kpi.l1wPosDollars), fmtChg(metrics.kpi.l1wPosDollarsChgVsLY)],
    ['L4W Sales', fmtMoney(metrics.kpi.l4wPosDollars), fmtChg(metrics.kpi.l4wPosDollarsChgVsLY)],
    ['Units / Store / Week', metrics.kpi.l4wAvgUSW !== null ? metrics.kpi.l4wAvgUSW.toFixed(1) : '—', fmtChg(metrics.kpi.l4wAvgUSWChgVsLY)],
    ['In-Stock %', fmtPct(metrics.kpi.l1wInstockPct), ''],
    ['In Full % (OTIF)', fmtPct(metrics.kpi.l1wInFullPct), ''],
    ['Selling Stores', metrics.kpi.l1wPosStoreCount ?? '—', ''],
  ];

  const kpiRowsHtml = kpiRows.map(([label, value, chg]) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#555;">${escapeHtml(label)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111;text-align:right;">${escapeHtml(String(value))}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:${chg.startsWith('+') ? '#2e7d32' : '#b71c1c'};text-align:right;">${escapeHtml(chg)}</td>
    </tr>`).join('');

  const alertsHtml = metrics.alerts.length === 0
    ? '<p style="color:#2e7d32;margin:0;font-size:13px;">No flags this week.</p>'
    : metrics.alerts.map((a) => `<div style="padding:8px 12px;margin-bottom:6px;border-radius:4px;background:${a.severity === 'flag' ? '#fdecea' : '#fff8e1'};color:${a.severity === 'flag' ? '#b71c1c' : '#8d6e00'};font-size:13px;">${escapeHtml(a.message)}</div>`).join('');

  const chartSvg = buildMainChartSvg(metrics.mainChartSeries);

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111;">
  <h1 style="font-size:18px;margin:0 0 4px;">${escapeHtml(CLIENT_BRAND_NAME)} — Week ${escapeHtml(metrics.currentWeek)}</h1>
  <p style="font-size:13px;color:#666;margin:0 0 16px;">Weekly performance summary</p>

  <p style="font-size:14px;line-height:1.5;margin:0 0 16px;">${escapeHtml(narrative.text)}</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    ${kpiRowsHtml}
  </table>

  <div style="margin-bottom:16px;">${alertsHtml}</div>

  <div style="margin-bottom:16px;">${chartSvg}</div>

  <a href="${portalUrl}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;">View full report →</a>

  <p style="font-size:11px;color:#999;margin-top:24px;">Prepared by ${escapeHtml(BROKER_NAME)}.</p>
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
