import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { fmtWeek, fmtMoney } from '../lib/format.js';
import { useIsMobile } from '../lib/useIsMobile.js';

export default function MainChart({ series }) {
  const isMobile = useIsMobile();
  const data = (series || []).map((pt) => ({
    week: pt.week,
    posDollars: pt.posDollars,
    posDollarsLY: pt.posDollarsLY,
    instockPct: pt.instockPct !== null && pt.instockPct !== undefined ? pt.instockPct * 100 : null,
  }));

  const tickFontSize = isMobile ? 9 : 11;
  const leftAxisWidth = isMobile ? 34 : 56;
  const rightAxisWidth = isMobile ? 28 : 40;
  // 52 weekly points are unreadable on a narrow screen — force a sparser,
  // evenly-spaced set of labels instead of relying on Recharts' overlap-avoidance.
  const tickInterval = isMobile ? Math.max(Math.ceil(data.length / 5) - 1, 0) : 'preserveStartEnd';

  return (
    <div className="chart-card">
      <h3>Sales vs. Last Year &amp; In-Stock %</h3>
      <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
        <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 4 : 24, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="week" tick={{ fontSize: tickFontSize }} interval={tickInterval} />
          <YAxis yAxisId="left" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: tickFontSize }} width={leftAxisWidth} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: tickFontSize }} width={rightAxisWidth} />
          <Tooltip
            formatter={(value, name) => (name === 'In-Stock %' ? [`${value.toFixed(1)}%`, name] : [fmtMoney(value), name])}
            labelFormatter={(week) => fmtWeek(week)}
          />
          <Legend wrapperStyle={{ fontSize: isMobile ? 11 : 13 }} />
          <Line yAxisId="left" type="monotone" dataKey="posDollars" name="POS $ (this year)" stroke="#1f6feb" dot={false} strokeWidth={2} />
          <Line yAxisId="left" type="monotone" dataKey="posDollarsLY" name="POS $ (last year)" stroke="#b0b7c3" dot={false} strokeWidth={2} strokeDasharray="4 3" />
          <Line yAxisId="right" type="monotone" dataKey="instockPct" name="In-Stock %" stroke="#e08a1e" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
