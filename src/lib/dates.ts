// Datas como strings "YYYY-MM-DD" em horário local, sem fuso, para não "voltar um dia".

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Data no mês (y, m) no dia `day`, ajustando para o último dia quando o mês é mais curto. */
export function dateInMonth(y: number, m: number, day: number): string {
  const d = Math.min(day, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Soma `n` meses a (y, m). */
export function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** "YYYY-MM" */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function endOfMonth(date: string): string {
  const { y, m } = parts(date);
  return dateInMonth(y, m, 31);
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`;
}

export function formatDate(date: string): string {
  const { y, m, d } = parts(date);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
