import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { fmtWeek } from '../lib/format.js';

export default function SupplyChainStrip({ otif }) {
  const data = (otif?.series13w || []).map((pt) => ({
    week: pt.week,
    onTimePct: pt.onTimePct !== null && pt.onTimePct !== undefined ? pt.onTimePct * 100 : null,
    inFullPct: pt.inFullPct !== null && pt.inFullPct !== undefined ? pt.inFullPct * 100 : null,
  }));

  return (
    <div className="chart-card">
      <h3>Supply Chain — On Time &amp; In Full</h3>
      {data.length === 0 ? (
        <p className="panel-subtitle">No supply chain data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={40} />
            <Tooltip formatter={(v) => (v === null ? '—' : `${v.toFixed(1)}%`)} labelFormatter={(week) => fmtWeek(week)} />
            <Legend />
            <Line type="monotone" dataKey="onTimePct" name="On Time %" stroke="#1f6feb" dot={false} strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="inFullPct" name="In Full %" stroke="#2e9e6b" dot={false} strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
