import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import { api } from '../lib/api.js';
import { CLIENT_BRAND_NAME } from '../../shared/constants.js';

export default function Login() {
  const { authenticated, loading, refresh } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && authenticated) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.login(password);
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Broker Portal</h1>
        <p className="login-subtitle">{CLIENT_BRAND_NAME}</p>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={submitting || !password}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
