const buttons = [...document.querySelectorAll('[data-step]')];
const scenes = [...document.querySelectorAll('[data-scene]')];
const dots = [...document.querySelectorAll('.progress span')];
const counter = document.querySelector('#tour-counter');
const toggle = document.querySelector('.play-toggle');
let step = 0;
let playing = true;
let timer;

function show(next) {
  step = next;
  buttons.forEach((button, index) => { const active = index === step; button.classList.toggle('active', active); button.setAttribute('aria-selected', active); });
  scenes.forEach((scene, index) => scene.classList.toggle('active', index === step));
  dots.forEach((dot, index) => dot.classList.toggle('active', index === step));
  counter.textContent = `0${step + 1} / 03`;
}
function schedule() { clearInterval(timer); if (playing) timer = setInterval(() => show((step + 1) % scenes.length), 5200); }
buttons.forEach((button, index) => button.addEventListener('click', () => { show(index); schedule(); }));
toggle.addEventListener('click', () => { playing = !playing; toggle.setAttribute('aria-pressed', String(!playing)); toggle.innerHTML = playing ? 'Pause tour <span>Ⅱ</span>' : 'Play tour <span>▶</span>'; schedule(); });
schedule();

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
