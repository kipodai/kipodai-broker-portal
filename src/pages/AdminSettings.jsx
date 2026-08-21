import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function AdminSettings() {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getRecipients()
      .then((data) => setRecipients(data.recipients))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function save(nextList) {
    setSaving(true);
    setError(null);
    try {
      const data = await api.setRecipients(nextList);
      setRecipients(data.recipients);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleAdd(e) {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    save([...recipients, email]);
    setNewEmail('');
  }

  function handleRemove(email) {
    save(recipients.filter((r) => r !== email));
  }

  if (loading) return <div className="page-loading">Loading settings…</div>;

  return (
    <div className="settings-page">
      <h1>Email Recipients</h1>
      <p className="panel-subtitle">
        These are the only addresses the "Send report" dialog can select from — recipients can
        never be typed in freely at send time. Add or remove pre-approved addresses here.
      </p>

      {error && <div className="login-error">{error}</div>}

      <ul className="recipient-settings-list">
        {recipients.length === 0 && <li className="geo-list-empty">No recipients configured yet.</li>}
        {recipients.map((email) => (
          <li key={email}>
            <span>{email}</span>
            <button type="button" className="danger-button" onClick={() => handleRemove(email)} disabled={saving}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <form className="add-recipient-form" onSubmit={handleAdd}>
        <input
          type="email"
          placeholder="new-recipient@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          disabled={saving}
        />
        <button type="submit" disabled={saving || !newEmail.trim()}>Add</button>
      </form>
    </div>
  );
}
