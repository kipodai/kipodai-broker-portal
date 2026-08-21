import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import ReportView from '../components/ReportView.jsx';

export default function AdminUpload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [previewReport, setPreviewReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null);

  function pickFiles(fileList) {
    const arr = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith('.xlsx'));
    setFiles(arr);
    setPreviewReport(null);
    setError(null);
    setPublished(null);
  }

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    pickFiles(e.dataTransfer.files);
  }, []);

  async function handlePreview() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.uploadFiles(files, 'preview');
      setPreviewReport({
        week: data.metrics.currentWeek,
        metrics: data.metrics,
        narrative: data.narrative,
        generatedAt: new Date().toISOString(),
        sendLog: [],
      });
    } catch (err) {
      setError(err.message);
      setPreviewReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const data = await api.uploadFiles(files, 'publish');
      setPublished(data.report.week);
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="upload-page">
      <h1>Upload Weekly Files</h1>
      <p className="panel-subtitle">Drop all three ABI Studio exports (Weekly_Trends, Trend_Analysis, Geo_Performance) at once.</p>

      <div
        className={`dropzone ${dragOver ? 'dropzone-active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept=".xlsx"
          onChange={(e) => pickFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <label htmlFor="file-input" className="dropzone-label">
          {files.length > 0
            ? `${files.length} file(s) selected: ${files.map((f) => f.name).join(', ')}`
            : 'Drag & drop 3 .xlsx files here, or click to browse'}
        </label>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="upload-actions">
        <button type="button" onClick={handlePreview} disabled={files.length !== 3 || loading}>
          {loading ? 'Validating…' : 'Preview'}
        </button>
        {previewReport && !published && (
          <button type="button" onClick={handlePublish} disabled={publishing}>
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        )}
      </div>

      {published && (
        <div className="publish-success">
          <p>Report for week {published} published.</p>
          <button type="button" onClick={() => navigate(`/report/${published}`)}>View published report</button>
        </div>
      )}

      {previewReport && !published && (
        <div className="preview-wrapper">
          <ReportView report={previewReport} role="admin" preview />
        </div>
      )}
    </div>
  );
}
