import React from 'react';
import { Link } from 'react-router-dom';
import kipodaiLogo from '../../logos/kipodai.png';

export default function ClientPortal() {
  return (
    <main className="client-portal-page">
      <nav className="client-portal-nav">
        <Link to="/" className="landing-brand"><img src={kipodaiLogo} alt="KipodAI" /><span>kipodai</span></Link>
        <Link to="/" className="client-back-link">← Back to KipodAI</Link>
      </nav>
      <section className="client-portal-card">
        <p className="eyebrow">Client access</p>
        <h1>Your dashboard, <span>all in one place.</span></h1>
        <p>Your organization’s dashboards are prepared around your business and shared by invitation.</p>
        <a className="landing-button" href="mailto:hello@kipodai.com?subject=KipodAI%20client%20portal%20access">Request portal access <span aria-hidden="true">→</span></a>
        <small>Already a KipodAI client? <a href="mailto:hello@kipodai.com?subject=KipodAI%20client%20portal%20access">Contact KipodAI</a> and we’ll send the right portal link.</small>
      </section>
    </main>
  );
}
