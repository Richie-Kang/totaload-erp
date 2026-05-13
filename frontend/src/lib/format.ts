// Display formatting helpers. See docs/UI_GUIDE.md §4.6 (표기).

export function stripCommas(v: string): string {
  return v.replace(/[,\s]/g, '');
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
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${hh}:${mm}:${ss}`;
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
