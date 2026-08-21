import React, { useState } from 'react';

export default function SendEmailDialog({ recipients, onCancel, onConfirm, sending, error }) {
  const [selected, setSelected] = useState(() => new Set(recipients));

  function toggle(recipient) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(recipient)) next.delete(recipient);
      else next.add(recipient);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h3>Send report to</h3>
        <ul className="recipient-list">
          {recipients.map((r) => (
            <li key={r}>
              <label>
                <input type="checkbox" checked={selected.has(r)} onChange={() => toggle(r)} />
                {r}
              </label>
            </li>
          ))}
        </ul>
        {error && <div className="login-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={sending}>Cancel</button>
          <button
            type="button"
            onClick={() => onConfirm([...selected])}
            disabled={sending || selected.size === 0}
          >
            {sending ? 'Sending…' : `Send to ${selected.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}
