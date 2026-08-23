import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { fmtWeek } from '../lib/format.js';
import { useIsMobile } from '../lib/useIsMobile.js';

export default function SupplyChainStrip({ otif }) {
  const isMobile = useIsMobile();
  const data = (otif?.series13w || []).map((pt) => ({
    week: pt.week,
    onTimePct: pt.onTimePct !== null && pt.onTimePct !== undefined ? pt.onTimePct * 100 : null,
    inFullPct: pt.inFullPct !== null && pt.inFullPct !== undefined ? pt.inFullPct * 100 : null,
  }));

  const tickFontSize = isMobile ? 9 : 11;
  const tickInterval = isMobile ? 1 : 0;

  return (
    <div className="chart-card">
      <h3>Supply Chain — On Time &amp; In Full</h3>
      {data.length === 0 ? (
        <p className="panel-subtitle">No supply chain data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={isMobile ? 200 : 180}>
          <LineChart data={data} margin={{ top: 10, right: isMobile ? 4 : 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#edeef1" />
            <XAxis dataKey="week" tick={{ fontSize: tickFontSize, fill: '#676d7a' }} interval={tickInterval} stroke="#d3d7de" />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: tickFontSize, fill: '#676d7a' }} width={isMobile ? 30 : 40} stroke="#d3d7de" />
            <Tooltip
              formatter={(v) => (v === null ? '—' : `${v.toFixed(1)}%`)}
              labelFormatter={(week) => fmtWeek(week)}
              contentStyle={{ borderRadius: 8, border: '1px solid #e3e6eb', fontSize: 13, boxShadow: '0 4px 10px rgba(18,21,28,0.08)' }}
            />
            <Legend wrapperStyle={{ fontSize: isMobile ? 11 : 13 }} />
            <Line type="monotone" dataKey="onTimePct" name="On Time %" stroke="#2a78d6" dot={false} strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="inFullPct" name="In Full %" stroke="#1baf7a" dot={false} strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
