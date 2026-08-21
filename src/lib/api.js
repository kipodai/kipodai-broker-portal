async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  getSession: () => request('/session'),
  login: (password) => request('/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/logout', { method: 'POST' }),
  listReports: () => request('/list-reports'),
  getReport: (week) => request(week ? `/get-report?week=${encodeURIComponent(week)}` : '/get-report'),
  uploadFiles: (files, mode) => {
    const form = new FormData();
    form.append('mode', mode);
    for (const file of files) form.append('files', file);
    return request('/upload', { method: 'POST', body: form });
  },
  getEmailConfig: () => request('/email-config'),
  sendEmail: (week, recipients) => request('/send-email', { method: 'POST', body: JSON.stringify({ week, recipients }) }),
  deleteReport: (week) => request('/delete-report', { method: 'POST', body: JSON.stringify({ week }) }),
  getRecipients: () => request('/recipients'),
  setRecipients: (recipients) => request('/recipients', { method: 'PUT', body: JSON.stringify({ recipients }) }),
};
