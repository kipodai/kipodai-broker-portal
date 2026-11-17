const demoButton = document.querySelector('#demo-dashboard-button');
const demoDialog = document.querySelector('#demo-access-dialog');
const demoForm = document.querySelector('#demo-access-form');
const demoPassword = document.querySelector('#demo-password');
const demoError = document.querySelector('#demo-access-error');
const demoClose = document.querySelector('#demo-access-close');
function closeDemoDialog() { demoDialog.close(); demoForm.reset(); demoError.hidden = true; }
const demoSubmit = demoForm?.querySelector('button[type="submit"]');
const demoParams = new URLSearchParams(window.location.search);
// The Worker validates `next` (only /demos paths or the demo host are honored).
const demoNext = demoParams.get('next');
function openDemoDialog() { if (!demoDialog.open) demoDialog.showModal(); demoPassword.focus(); }
demoButton?.addEventListener('click', openDemoDialog);
// The gate sends visitors here with ?demo=1 when they reach a private demo without signing in.
if (demoParams.get('demo') === '1' && demoDialog) openDemoDialog();
window.addEventListener('pageshow', () => { if (demoSubmit) demoSubmit.disabled = false; });
demoClose?.addEventListener('click', closeDemoDialog);
demoDialog?.addEventListener('click', (event) => { if (event.target === demoDialog) closeDemoDialog(); });
demoForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  demoError.hidden = true;
  if (demoSubmit) demoSubmit.disabled = true;
  try {
    // The password is checked by the Worker, which sets a signed cookie. Nothing is stored in the browser by this page.
    const res = await fetch('/demo-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ password: demoPassword.value, next: demoNext }) });
    if (res.ok) { const { next } = await res.json(); window.location.assign(next || '/demos/'); return; }
    demoError.textContent = res.status === 503 ? 'Demo access is not available right now. Please contact us.' : 'That password doesn’t match. Please try again.';
  } catch {
    demoError.textContent = 'Something went wrong. Please try again.';
  }
  demoError.hidden = false;
  if (demoSubmit) demoSubmit.disabled = false;
  demoPassword.select();
});
