import React from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { fmtMoney, fmtChg, deltaClass } from '../lib/format.js';
import { useIsMobile } from '../lib/useIsMobile.js';

export default function GeographyPanel({ geography }) {
  const isMobile = useIsMobile();
  const { top5States, fastestGrowing3, decliners3 } = geography;
  const chartData = [...top5States].reverse().map((s) => ({ state: s.State, posDollars: s['POS $'] }));
  const tickFontSize = isMobile ? 10 : 11;

  return (
    <div className="geography-panel">
      <h3>Geography</h3>
      <div className="geography-grid">
        <div className="geography-chart">
          <p className="panel-subtitle">Top 5 states by sales</p>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: isMobile ? 8 : 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: tickFontSize }} />
              <YAxis type="category" dataKey="state" tick={{ fontSize: tickFontSize + 1 }} width={isMobile ? 32 : 40} />
              <Tooltip formatter={(v) => fmtMoney(v)} />
              <Bar dataKey="posDollars" fill="#1f6feb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="geography-lists">
          <div>
            <p className="panel-subtitle">Fastest growing</p>
            <ul className="geo-list">
              {fastestGrowing3.length === 0 && <li className="geo-list-empty">Not enough data.</li>}
              {fastestGrowing3.map((s) => (
                <li key={s.State}>
                  <span>{s.State}</span>
                  <span className={deltaClass(s['POS $ %Chg vs LY'])}>{fmtChg(s['POS $ %Chg vs LY'])}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="panel-subtitle">Declining</p>
            <ul className="geo-list">
              {decliners3.length === 0 && <li className="geo-list-empty">Not enough data.</li>}
              {decliners3.map((s) => (
                <li key={s.State}>
                  <span>{s.State}</span>
                  <span className={deltaClass(s['POS $ %Chg vs LY'])}>{fmtChg(s['POS $ %Chg vs LY'])}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
