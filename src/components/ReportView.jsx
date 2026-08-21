import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import KpiCard from './KpiCard.jsx';
import MainChart from './MainChart.jsx';
import AlertsPanel from './AlertsPanel.jsx';
import GeographyPanel from './GeographyPanel.jsx';
import SupplyChainStrip from './SupplyChainStrip.jsx';
import SendEmailDialog from './SendEmailDialog.jsx';
import { api } from '../lib/api.js';
import { fmtMoney, fmtPct, fmtWeek, fmtNumber } from '../lib/format.js';
import { CLIENT_BRAND_NAME, BROKER_NAME } from '../../shared/constants.js';
import kipodaiLogo from '../../logos/kipodai.png';

export default function ReportView({ report, role, onDeleted, preview = false }) {
  const navigate = useNavigate();
  const { metrics, narrative } = report;
  const [emailConfig, setEmailConfig] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sendLog, setSendLog] = useState(report.sendLog || []);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSendLog(report.sendLog || []);
  }, [report]);

  useEffect(() => {
    if (role === 'admin' && !preview) {
      api.getEmailConfig().then(setEmailConfig).catch(() => setEmailConfig({ configured: false, recipients: [] }));
    }
  }, [role, preview]);

  async function handleConfirmSend(recipients) {
    setSending(true);
    setSendError(null);
    try {
      const result = await api.sendEmail(report.week, recipients);
      if (!result.sent) {
        setSendError('Email is not configured (RESEND_API_KEY missing).');
      } else {
        setSendLog(result.sendLog || []);
        setShowDialog(false);
      }
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete the report for week ${report.week}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.deleteReport(report.week);
      onDeleted?.();
      navigate('/archive', { replace: true });
    } catch (err) {
      window.alert(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="report-page">
      <header className="report-header">
        <div>
          <h1>{CLIENT_BRAND_NAME}</h1>
          <p className="report-meta">{fmtWeek(metrics.currentWeek)} · Generated {new Date(report.generatedAt).toLocaleDateString()}</p>
        </div>
        {role === 'admin' && !preview && (
          <div className="report-admin-actions">
            <button type="button" onClick={() => setShowDialog(true)}>Send report</button>
            <button type="button" className="danger-button" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
        {preview && <span className="preview-badge">Preview — not yet published</span>}
      </header>

      <section className="exec-summary">
        <p>{narrative.text}</p>
      </section>

      <section className="kpi-grid">
        <KpiCard label="L1W Sales" value={fmtMoney(metrics.kpi.l1wPosDollars)} chgVsLY={metrics.kpi.l1wPosDollarsChgVsLY} />
        <KpiCard label="L4W Sales" value={fmtMoney(metrics.kpi.l4wPosDollars)} chgVsLY={metrics.kpi.l4wPosDollarsChgVsLY} />
        <KpiCard label="Units / Store / Week" value={fmtNumber(metrics.kpi.l4wAvgUSW, 1)} chgVsLY={metrics.kpi.l4wAvgUSWChgVsLY} />
        <KpiCard label="In-Stock %" value={fmtPct(metrics.kpi.l1wInstockPct)} />
        <KpiCard label="In Full % (OTIF)" value={fmtPct(metrics.kpi.l1wInFullPct)} />
        <KpiCard label="Selling Stores" value={fmtNumber(metrics.kpi.l1wPosStoreCount)} />
      </section>

      <section>
        <MainChart series={metrics.mainChartSeries} />
      </section>

      <section>
        <AlertsPanel alerts={metrics.alerts} />
      </section>

      <section>
        <GeographyPanel geography={metrics.geography} />
      </section>

      <section>
        <SupplyChainStrip otif={metrics.otif} />
      </section>

      {role === 'admin' && !preview && sendLog.length > 0 && (
        <section className="send-history">
          <h3>Send history</h3>
          <ul>
            {sendLog.map((entry, i) => (
              <li key={i}>
                {new Date(entry.timestamp).toLocaleString()} — {entry.recipients.join(', ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="report-footer">
        <div>Prepared by {BROKER_NAME}</div>
        <div className="powered-by">
          <img src={kipodaiLogo} alt="Kipod AI" className="powered-by-logo" />
          <span>Powered by Kipod AI</span>
        </div>
      </footer>

      {showDialog && emailConfig && (
        emailConfig.configured ? (
          <SendEmailDialog
            recipients={emailConfig.recipients}
            sending={sending}
            error={sendError}
            onCancel={() => setShowDialog(false)}
            onConfirm={handleConfirmSend}
          />
        ) : (
          <div className="modal-backdrop">
            <div className="modal-card">
              <p>Email is not configured. Set RESEND_API_KEY, EMAIL_FROM_ADDRESS, and CLIENT_EMAIL_RECIPIENTS to enable sending.</p>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowDialog(false)}>Close</button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
