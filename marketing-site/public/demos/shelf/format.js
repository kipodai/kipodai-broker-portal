// Display formatting only. Pure functions, no DOM. Used by takeaways.js (so the
// text and the numbers-match test share one definition of "how it is shown")
// and by render.js. Not shared with src/lib/format.js: the marketing site is a
// separate static project with no build step.

const MINUS = '−';

// Signed zero after rounding must not print as "-0.0%".
const signOf = (n, rounded) => (Number(rounded) === 0 ? '' : n > 0 ? '+' : MINUS);

export const fmtP = (n, d = 1) => {
  const r = Math.abs(n * 100).toFixed(d);
  return `${signOf(n, r)}${r}%`;
};
// Unsigned-positive formats: a negative value still gets a true minus sign
// (never an ASCII hyphen) so every printed number parses back the same way.
const neg = (n, shown) => (n < 0 && Number(shown) !== 0 ? `${MINUS}${shown}` : shown);

export const fmtAbsP = (n, d = 1) => `${Math.abs(n * 100).toFixed(d)}%`;
export const fmtShare = (n, d = 1) => `${neg(n, Math.abs(n * 100).toFixed(d))}%`;
export const fmtPts = (n, d = 1) => {
  const r = Math.abs(n * 100).toFixed(d);
  return `${signOf(n, r)}${r} pts`;
};
export const fmtX = (n, d = 1) => `${neg(n, Math.abs(n).toFixed(d))}×`;
export const fmtD = (n) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
export const fmtN = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));
export const fmtInt = (n) => neg(n, Math.abs(Math.round(n)).toLocaleString('en-US'));
export const fmtDec = (n, d = 1) => neg(n, Math.abs(n).toFixed(d));

export const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "A", "A and B", "A, B and C"
export const list = (a) =>
  a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;

// Agreement is chosen by a count we hold, never by inspecting a name.
export const plural = (n, one, many) => (n === 1 ? one : many);
