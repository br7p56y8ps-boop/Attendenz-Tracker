import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getCurrentDateStr(date: Date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDateStr(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

// Shared percentage color logic (kept)
export const pctColor = (pct: number, preferredPercentage: number) => {
  const GREEN_OFFSET = 5;
  if (pct >= preferredPercentage + GREEN_OFFSET) return 'var(--color-success)';
  if (pct >= preferredPercentage) return 'var(--color-warning)';
  return 'var(--color-destructive)';
};

/* ════════════════════════════════════════════════════════════════════════════
   ROUND 2 — FORMAT & COLOR CONSTITUTION (Section B)
   Single source of truth for time/date formatting + subject colors.

   • Canonical time   : "hh:mm AM–hh:mm PM"
                        (en-dash separator, zero-padded, meridiem on BOTH ends).
                        24h strings are NEVER stored.
   • Storage dates    : yyyy-mm-dd   ·   Display dates: dd/mm/yy
   • All time matching (grid columns, overlaps, sorting) runs on parsed
     minutes via parseRangeToMinutes — never on raw strings (B7).
════════════════════════════════════════════════════════════════════════════ */

/* ── B5 · Dates ─────────────────────────────────────────────────────────── */

/** Write dates in constants in human form dd/mm/yy; D() converts them to the
    storage format yyyy-mm-dd. Accepts 2- or 4-digit years. */
export function D(ddmmyy: string): string {
  const parts = (ddmmyy || '').trim().split('/');
  if (parts.length !== 3) return ddmmyy;
  const [dd, mm, yRaw] = parts;
  const year = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** Canonical display date format dd/mm/yy (B5). */
export function formatDateDDMMYY(d: Date = new Date()): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/** Display helper for stored yyyy-mm-dd strings. Storage format never changes. */
export function formatISODateDDMMYY(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(-2)}`;
}

/* ── Time parsing core ──────────────────────────────────────────────────── */

const TIME_RANGE_SPLIT_RE = /\s*[–—−-]\s*|\s+to\s+/i;

interface TimeToken {
  hour: number;
  minute: number;
  mer?: 'AM' | 'PM';
}

const parseTimeToken = (token: string): TimeToken | null => {
  const m = (token || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (hour > 23 || minute > 59) return null;
  const mer = m[3] ? (m[3].toUpperCase() as 'AM' | 'PM') : undefined;
  return { hour, minute, mer };
};

const toMinutes = (hour: number, minute: number, mer?: 'AM' | 'PM'): number => {
  let h = hour;
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + minute;
};

/** B2 · Hour heuristic for bare (meridiem-less) times in an academic routine:
    bare 7–11 → AM; bare 12 and 1–6 → PM. This reproduces the approved map:
    07:00–08:00→AM·AM │ 08:30–09:30→AM·AM │ 09:30–11:30→AM·AM
    11:30–12:00→AM·PM │ 12:00–01:00→PM·PM │ 01:00–02:00→PM·PM
    12:00–02:00→PM·PM │ 07:00–09:00 PM→PM·PM │ 11:30 AM–2:30 PM→AM·PM */
const inferMeridiem = (hour: number): 'AM' | 'PM' =>
  hour >= 7 && hour <= 11 ? 'AM' : 'PM';

/** Shared meridiem resolution:
    1. explicit meridiem always wins;
    2. a lone explicit meridiem is adopted by the other end ONLY when it keeps
       start ≤ end (so "07:00–09:00 PM" → PM·PM but "11:30–2:30 PM" → AM·PM);
    3. otherwise the B2 hour heuristic applies. */
const resolveMeridiems = (
  sTok: TimeToken,
  eTok: TimeToken
): { sMer: 'AM' | 'PM'; eMer: 'AM' | 'PM' } => {
  if (sTok.mer && eTok.mer) return { sMer: sTok.mer, eMer: eTok.mer };
  if (sTok.mer && !eTok.mer) {
    const sMin = toMinutes(sTok.hour, sTok.minute, sTok.mer);
    const adopt = toMinutes(eTok.hour, eTok.minute, sTok.mer);
    return { sMer: sTok.mer, eMer: adopt >= sMin ? sTok.mer : inferMeridiem(eTok.hour) };
  }
  if (!sTok.mer && eTok.mer) {
    const eMin = toMinutes(eTok.hour, eTok.minute, eTok.mer);
    const adopt = toMinutes(sTok.hour, sTok.minute, eTok.mer);
    return { sMer: adopt <= eMin ? eTok.mer : inferMeridiem(sTok.hour), eMer: eTok.mer };
  }
  return { sMer: inferMeridiem(sTok.hour), eMer: inferMeridiem(eTok.hour) };
};

const formatEndpoint = (t: TimeToken, mer: 'AM' | 'PM'): string => {
  let h = t.hour % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(t.minute).padStart(2, '0')} ${mer}`;
};

const CANONICAL_RANGE_RE = /^\d{2}:\d{2} (?:AM|PM)–\d{2}:\d{2} (?:AM|PM)$/;

/** B1/B3 · True when a range is already canonical "hh:mm AM–hh:mm PM". */
export const isCanonicalTimeRange = (range: string): boolean =>
  CANONICAL_RANGE_RE.test((range || '').trim());

/** B1/B3 · Rewrites ANY legacy range ("09:30–11:30", "11:30 AM–2:30 PM",
    "07:00–09:00 PM", "14:00–15:00", …) into canonical form.
    Returns the input unchanged when it cannot be parsed. */
export function canonicalizeTimeRange(range: string): string {
  if (!range) return range;
  if (isCanonicalTimeRange(range)) return range.trim();
  const parts = range.split(TIME_RANGE_SPLIT_RE).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return range;
  const sTok = parseTimeToken(parts[0]);
  const eTok = parseTimeToken(parts[parts.length - 1]);
  if (!sTok || !eTok) return range;
  const { sMer, eMer } = resolveMeridiems(sTok, eTok);
  return `${formatEndpoint(sTok, sMer)}–${formatEndpoint(eTok, eMer)}`;
}

/** B4 · The single entry point for every create/edit save:
    canonicalTimeRange(start, end) → "hh:mm AM–hh:mm PM".
    Accepts 12h ("09:00 AM") or 24h ("09:00") endpoints. */
export function canonicalTimeRange(start: string, end: string): string {
  return canonicalizeTimeRange(`${start}–${end}`);
}

/** B7 · Parsed-minute interval used for ALL matching / overlap / sorting. */
export function parseRangeToMinutes(range: string): { start: number; end: number } | null {
  if (!range) return null;
  const parts = range.split(TIME_RANGE_SPLIT_RE).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const sTok = parseTimeToken(parts[0]);
  const eTok = parseTimeToken(parts[parts.length - 1]);
  if (!sTok || !eTok) return null;
  const { sMer, eMer } = resolveMeridiems(sTok, eTok);
  const start = toMinutes(sTok.hour, sTok.minute, sMer);
  let end = toMinutes(eTok.hour, eTok.minute, eMer);
  if (end <= start) end += 24 * 60; // keep overnight/malformed ranges comparable
  return { start, end };
}

/** A1/A3 convenience · slot start in minutes (null when unparseable). */
export function rangeStartMinutes(range: string): number | null {
  return parseRangeToMinutes(range)?.start ?? null;
}

/** B6 · "HH:MM" (24h) or "h:mm am/pm" → zero-padded 12h "hh:mm AM". */
export function to12h(time: string): string {
  const t = (time || '').trim();
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10) % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${m12[2]} ${m12[3].toUpperCase()}`;
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const hour = parseInt(m24[1], 10) % 24;
    const mer: 'AM' | 'PM' = hour >= 12 ? 'PM' : 'AM';
    let h = hour % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${m24[2]} ${mer}`;
  }
  return time;
}

/** B8 · Compact weekly-grid header label: "07:00 AM–08:00 AM" → "7–8 AM",
    "12:00 PM–02:00 PM" → "12–2 PM", "09:30 AM–11:30 AM" → "9:30–11:30 AM". */
export function formatCompactRange(range: string): string {
  const canon = canonicalizeTimeRange(range);
  const m = canon.match(/^(\d{2}):(\d{2}) (AM|PM)–(\d{2}):(\d{2}) (AM|PM)$/);
  if (!m) return range;
  const compact = (hh: string, mm: string): string => {
    const h = String(parseInt(hh, 10));
    return mm === '00' ? h : `${h}:${mm}`;
  };
  const s = compact(m[1], m[2]);
  const e = compact(m[4], m[5]);
  if (m[3] === m[6]) return `${s}–${e} ${m[6]}`;
  return `${s} ${m[3]}–${e} ${m[6]}`;
}

/* ── B6 · Deterministic subject colors ──────────────────────────────────── */

const SUBJECT_PALETTE = [
  '#60a5fa', // blue
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f87171', // red
  '#a78bfa', // violet
  '#f472b6', // pink
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#818cf8', // indigo
  '#a3e635', // lime
  '#22d3ee', // cyan
  '#e879f9', // fuchsia
];

/** constants.ts registers the ordered preset subject list at module load.
    (Registry pattern avoids a circular import — constants already imports
    D() from this file.) */
let presetSubjectOrder: string[] = [];
export function registerPresetSubjects(names: string[]): void {
  presetSubjectOrder = (names || []).map(n => (n || '').trim()).filter(Boolean);
}

/** B6 · Deterministic subject color: preset subjects take the palette in fixed
    registration order; custom/unknown names get a stable hash. */
export function getSubjectColor(name: string): string {
  const n = (name || '').trim();
  if (!n) return SUBJECT_PALETTE[0];
  const idx = presetSubjectOrder.findIndex(p => p.toLowerCase() === n.toLowerCase());
  if (idx !== -1) return SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return SUBJECT_PALETTE[h % SUBJECT_PALETTE.length];
}
