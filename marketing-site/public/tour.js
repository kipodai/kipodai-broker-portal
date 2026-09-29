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
function passwordMatches(value) { return value.trim().replace(/[^a-z0-9]/gi, '').toLowerCase() === 'kipodtour'; }
demoButton?.addEventListener('click', () => { demoDialog.showModal(); demoPassword.focus(); });
demoClose?.addEventListener('click', closeDemoDialog);
demoDialog?.addEventListener('click', (event) => { if (event.target === demoDialog) closeDemoDialog(); });
demoForm?.addEventListener('submit', async (event) => { event.preventDefault(); if (await passwordMatches(demoPassword.value.trim())) { window.location.assign('https://demo.kipodai.com'); return; } demoError.hidden = false; demoPassword.select(); });
