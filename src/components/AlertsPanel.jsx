import React from 'react';

export default function AlertsPanel({ alerts, title = 'Alerts' }) {
  return (
    <div className="alerts-panel">
      <h3>{title}</h3>
      {(!alerts || alerts.length === 0) ? (
        <div className="alert-none">No flags this week.</div>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.key} className={`alert-item alert-${a.severity}`}>
              <span className="alert-severity">{a.severity === 'flag' ? 'Flag' : 'Watch'}</span>
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
