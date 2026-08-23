import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import { api } from '../lib/api.js';
import { CLIENT_BRAND_NAME } from '../../shared/constants.js';
import shiftRetailGroupLogo from '../../logos/Shift Retail Group - Black.jpg';

function navLinkClass({ isActive }) {
  return isActive ? 'active-nav-link' : undefined;
}

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
          <NavLink to="/portal" className={navLinkClass}>Latest Report</NavLink>
          <NavLink to="/archive" className={navLinkClass}>Archive</NavLink>
          {role === 'admin' && <NavLink to="/admin/upload" className={navLinkClass}>Upload</NavLink>}
          {role === 'admin' && <NavLink to="/admin/settings" className={navLinkClass}>Settings</NavLink>}
          <span className="role-badge">{role}</span>
          <button type="button" className="link-button" onClick={handleLogout}>Log out</button>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
