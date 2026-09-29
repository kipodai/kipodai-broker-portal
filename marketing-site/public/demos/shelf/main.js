// Wiring only: the one module that touches the DOM at import time. State is a
// plain in-memory object; nothing is persisted (no storage, no cookies).

import { computeShelf } from './compute.js';
import { buildTakeaways, buildHeadline } from './takeaways.js';
import { inputForTier, TIERS } from './demoData.js';
import { renderAll } from './render.js';

const state = { window: 'l13', tier: 4, sortKey: 'dollars', sortDir: -1 };

const tbl = document.getElementById('tbl');
const tierSelect = document.getElementById('tier');
const windowButtons = Array.from(document.querySelectorAll('[data-window]'));

function update() {
  const metrics = computeShelf(inputForTier(state.tier), { window: state.window });

  // A tier change can remove the source behind the sorted column.
  if (state.sortKey === 'dollarShare' && !metrics.sources.category) {
    state.sortKey = 'dollars';
    state.sortDir = -1;
  }

  // Re-rendering replaces the header buttons, which drops keyboard focus.
  // Remember which sort button had it and put it back afterwards.
  const active = document.activeElement;
  const focusedSort = tbl && active && tbl.contains(active) && active.dataset ? active.dataset.sort : null;

  renderAll({ metrics, headline: buildHeadline(metrics), takeaways: buildTakeaways(metrics), ui: state });

  if (focusedSort) {
    const btn = tbl.querySelector(`[data-sort="${focusedSort}"]`);
    if (btn && !btn.disabled) btn.focus({ preventScroll: true });
  }
}

for (const btn of windowButtons) {
  btn.addEventListener('click', () => {
    state.window = btn.dataset.window;
    for (const b of windowButtons) b.setAttribute('aria-pressed', String(b === btn));
    update();
  });
}

if (tierSelect) {
  tierSelect.innerHTML = TIERS.map(
    (t) => `<option value="${t.value}"${t.value === state.tier ? ' selected' : ''}>${t.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</option>`,
  ).join('');
  tierSelect.addEventListener('change', () => {
    state.tier = Number(tierSelect.value);
    update();
  });
}

if (tbl) {
  tbl.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('[data-sort]') : null;
    if (!btn || btn.disabled) return;
    const key = btn.dataset.sort;
    if (state.sortKey === key) {
      state.sortDir = -state.sortDir;
    } else {
      state.sortKey = key;
      state.sortDir = key === 'name' ? 1 : -1;
    }
    update();
  });
}

update();
