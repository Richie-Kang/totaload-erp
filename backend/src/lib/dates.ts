// Totaload ERP — date helpers. app_date / PDF current_date use the `YYYY년 M월 D일` form (PRD §4).

export function todayKr(d = new Date()): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function todayCompact(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
