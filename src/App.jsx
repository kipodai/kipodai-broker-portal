import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider, useSession } from './context/SessionContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ReportPage from './pages/ReportPage.jsx';
import Archive from './pages/Archive.jsx';
import AdminUpload from './pages/AdminUpload.jsx';

function ProtectedRoute({ children, adminOnly = false }) {
  const { loading, authenticated, role } = useSession();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  if (adminOnly && role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={(
          <ProtectedRoute>
            <Layout>
              <ReportPage />
            </Layout>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/report/:week"
        element={(
          <ProtectedRoute>
            <Layout>
              <ReportPage />
            </Layout>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/archive"
        element={(
          <ProtectedRoute>
            <Layout>
              <Archive />
            </Layout>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin/upload"
        element={(
          <ProtectedRoute adminOnly>
            <Layout>
              <AdminUpload />
            </Layout>
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <AppRoutes />
    </SessionProvider>
  );
}
