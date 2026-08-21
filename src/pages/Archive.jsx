import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtWeek } from '../lib/format.js';

export default function Archive() {
  const [state, setState] = useState({ loading: true, weeks: [], error: null });

  useEffect(() => {
    api.listReports()
      .then((data) => setState({ loading: false, weeks: data.weeks, error: null }))
      .catch((err) => setState({ loading: false, weeks: [], error: err.message }));
  }, []);

  if (state.loading) return <div className="page-loading">Loading archive…</div>;
  if (state.error) return <div className="page-empty">{state.error}</div>;

  return (
    <div className="archive-page">
      <h1>Report Archive</h1>
      {state.weeks.length === 0 ? (
        <p className="page-empty">No reports published yet.</p>
      ) : (
        <ul className="archive-list">
          {state.weeks.map((week) => (
            <li key={week}>
              <Link to={`/report/${week}`}>{fmtWeek(week)}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
