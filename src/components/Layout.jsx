import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import { api } from '../lib/api.js';
import { CLIENT_BRAND_NAME } from '../../shared/constants.js';
import shiftRetailGroupLogo from '../../logos/Shift Retail Group - Black.jpg';

export default function Layout({ children }) {
  const { role, refresh } = useSession();
  const navigate = useNavigate();

  async function handleLogout() {
    await api.logout();
    await refresh();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-title">
          <img src={shiftRetailGroupLogo} alt="Shift Retail Group" className="app-header-logo" />
          <div className="app-header-title-text">
            <span className="app-name">Broker Portal</span>
            <span className="app-brand">{CLIENT_BRAND_NAME}</span>
          </div>
        </div>
        <nav className="app-nav">
          <Link to="/">Latest Report</Link>
          <Link to="/archive">Archive</Link>
          {role === 'admin' && <Link to="/admin/upload">Upload</Link>}
          {role === 'admin' && <Link to="/admin/settings">Settings</Link>}
          <button type="button" className="link-button" onClick={handleLogout}>Log out</button>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
