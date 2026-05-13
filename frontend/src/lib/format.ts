// Display formatting helpers. See docs/UI_GUIDE.md §4.6 (표기) and §4.3 (SSN 마스킹).

export function stripCommas(v: string): string {
  return v.replace(/[,\s]/g, '');
}

// Mask a Korean SSN: 860101-1234567 -> 860101-*******. Falls back to a generic mask if shape is odd.
export function maskSsn(v: string | undefined): string {
  if (!v) return '';
  const m = v.match(/^(\d{6})[-\s]?(\d{0,7})$/);
  if (m) return `${m[1]}-${'*'.repeat(Math.max(m[2].length, 7))}`;
  return v.replace(/\d(?=.{2})/g, '*');
}

// Date display "YYYY. M. D." from an ISO timestamp.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${hh}:${mm}`;
}

export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Today as the PDF-ready Korean string the backend stores in app_date.
export function todayKr(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// Split a string into [before, match, after] for highlighting (case-insensitive, first occurrence).
export function splitHighlight(text: string, query: string): [string, string, string] {
  if (!query) return [text, '', ''];
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return [text, '', ''];
  return [text.slice(0, i), text.slice(i, i + query.length), text.slice(i + query.length)];
}
