// Даты храним строкой YYYY-MM-DD в локальном времени — так проще сравнивать даты привоза.

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function today(): string {
  return isoDate(new Date());
}

/** 1 = понедельник … 7 = воскресенье */
export function weekday(s: string): number {
  const w = parseDate(s).getDay();
  return w === 0 ? 7 : w;
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);
}

const WD_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const WD_LONG = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export const wdShort = (n: number) => WD_SHORT[n];
export const wdLong = (n: number) => WD_LONG[n];

/** «3 октября» */
export function fmtDay(s: string): string {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** «сегодня», «завтра», «чт, 3 октября» */
export function fmtRelDay(s: string): string {
  const diff = diffDays(s, today());
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff === -1) return "вчера";
  return `${wdShort(weekday(s))}, ${fmtDay(s)}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const day = isoDate(d);
  return `${fmtRelDay(day)}, ${fmtTime(iso)}`;
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "только что";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  return fmtDateTime(iso);
}
