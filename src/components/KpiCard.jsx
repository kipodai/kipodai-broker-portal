import React from 'react';
import { fmtChg, deltaClass } from '../lib/format.js';

export default function KpiCard({ label, value, chgVsLY }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {chgVsLY !== undefined && (
        <div className={`kpi-delta ${deltaClass(chgVsLY)}`}>
          {chgVsLY === null ? 'vs LY: —' : `${fmtChg(chgVsLY)} vs LY`}
        </div>
      )}
    </div>
  );
}
