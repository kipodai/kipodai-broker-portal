import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import { api } from '../lib/api.js';
import ReportView from '../components/ReportView.jsx';

export default function ReportPage() {
  const { week } = useParams();
  const { role } = useSession();
  const [state, setState] = useState({ loading: true, report: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, report: null, error: null });
    api.getReport(week)
      .then((data) => { if (!cancelled) setState({ loading: false, report: data.report, error: null }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, report: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [week]);

  if (state.loading) return <div className="page-loading">Loading report…</div>;
  if (state.error) return <div className="page-empty">{state.error}</div>;
  if (!state.report) return <div className="page-empty">No report available yet.</div>;

  return <ReportView report={state.report} role={role} />;
}
