// The one module that owns package imagery. Today the demo draws generic
// packages; a real item-master image URL ({ url }) replaces the drawing without
// touching render.js. Generic art only: no real brand, logo or product shown.

import { esc } from './format.js';

const drawings = (c) => ({
  canister: `<rect x="8" y="12" width="24" height="42" rx="3" fill="${c}"/><ellipse cx="20" cy="12" rx="12" ry="3.5" fill="${c}" opacity=".75"/><rect x="8" y="27" width="24" height="12" fill="#fff" opacity=".85"/><rect x="12" y="31" width="16" height="3" fill="${c}"/>`,
  bag: `<rect x="10" y="6" width="20" height="8" fill="${c}" opacity=".8"/><path d="M9 13h22l2 41H7z" fill="${c}"/><circle cx="20" cy="22" r="2.6" fill="#fff" opacity=".55"/><rect x="11" y="30" width="18" height="12" fill="#fff" opacity=".85"/>`,
  loaf: `<rect x="3" y="28" width="34" height="26" rx="11" fill="#F1E3C4"/><rect x="3" y="36" width="34" height="9" fill="${c}"/><rect x="35" y="37" width="4" height="7" rx="1" fill="#fff" stroke="${c}"/>`,
  box: `<rect x="10" y="4" width="20" height="50" rx="1.5" fill="${c}"/><rect x="13" y="16" width="14" height="20" rx="2" fill="#F4E3B5"/><path d="M15 20l10 12M15 26l7 8M18 18l7 9" stroke="#D9B86A" stroke-width="1.4"/><rect x="13" y="41" width="14" height="3" fill="#fff" opacity=".8"/>`,
  bottle: `<rect x="16" y="4" width="8" height="7" rx="1" fill="${c}"/><path d="M15 11h10l4 9v32a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V20z" fill="#F4F2EA" stroke="#CFCBBE"/><rect x="11" y="28" width="18" height="15" fill="${c}"/>`,
  tub: `<rect x="4" y="30" width="32" height="24" rx="3" fill="${c}"/><rect x="3" y="26" width="34" height="6" rx="2" fill="#2A2F37"/><ellipse cx="20" cy="42" rx="9" ry="5" fill="#fff" opacity=".85"/>`,
  tray: `<rect x="3" y="34" width="34" height="20" rx="4" fill="${c}"/><circle cx="12" cy="44" r="4.5" fill="#E9C27A"/><circle cx="21" cy="44" r="4.5" fill="#E9C27A"/><circle cx="30" cy="44" r="4.5" fill="#E9C27A"/>`,
  pizzabox: `<rect x="2" y="38" width="36" height="16" rx="1.5" fill="${c}"/><circle cx="14" cy="46" r="5.5" fill="#F2C06B"/><circle cx="12.5" cy="45" r="1.2" fill="#B23E35"/><circle cx="16" cy="47.5" r="1.2" fill="#B23E35"/><rect x="23" y="43" width="11" height="3" fill="#fff" opacity=".85"/>`,
});

const SAFE_URL = /^(https?:\/\/|\/(?!\/)|data:image\/)/i;

// image: { kind, color } | { url } | null  ->  HTML string ('' when nothing to show)
export function packageSvg(image) {
  if (!image || typeof image !== 'object') return '';
  if (typeof image.url === 'string' && image.url) {
    return SAFE_URL.test(image.url) ? `<img src="${esc(image.url)}" alt="" loading="lazy">` : '';
  }
  const body = drawings(esc(image.color || '#8a8f99'))[image.kind];
  if (!body) return '';
  return `<svg viewBox="0 0 40 56" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">${body}</svg>`;
}
