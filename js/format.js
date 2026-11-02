// Swedish formatting helpers. Trip time `t` is hours since day 1, 00:00
// (data: web_app_contract.time_model, at_hour = (day - 1) * 24 + clock_hour).

const intFmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const fmtInt = (n) => intFmt.format(n);
export const fmtDec = (n) => decFmt.format(n);
export const fmtRange = (r) => `${fmtInt(r.min)}–${fmtInt(r.max)}`;
export const plural = (n, one, many) => `${fmtDec(n)} ${n === 1 ? one : many}`;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const pad2 = (n) => String(n).padStart(2, '0');

/** Day (1-based) and clock for trip time t, rounded to whole minutes. */
export function moment(t) {
  const minutes = Math.round(t * 60);
  return { day: Math.floor(minutes / 1440) + 1, hh: Math.floor((minutes % 1440) / 60), mm: minutes % 60 };
}

export const dayOf = (t) => moment(t).day;

export function clock(t) {
  const { hh, mm } = moment(t);
  return `${pad2(hh)}:${pad2(mm)}`;
}

/** "Dag 9 · 14:00"; the very end of a trip reads "Dag 19 · slut" rather than "Dag 20 · 00:00". */
export function fmtMoment(t, endHours) {
  if (endHours && t >= endHours) return `Dag ${endHours / 24} · slut`;
  return `Dag ${dayOf(t)} · ${clock(t)}`;
}

export function fmtSpan(a, b) {
  return dayOf(a) === dayOf(b) ? `Dag ${dayOf(a)} · ${clock(a)}–${clock(b)}` : `${fmtMoment(a)} → ${fmtMoment(b)}`;
}

/** Trip time for a (1-based) day and clock hour. */
export const hoursOf = (day, clockHour = 0) => (day - 1) * 24 + clockHour;
