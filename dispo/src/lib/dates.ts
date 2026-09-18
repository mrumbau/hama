/**
 * Datums-Helfer. Die gesamte App rechnet mit "Kalendertagen" als
 * ISO-String `YYYY-MM-DD`. Damit gibt es keine Zeitzonen-Ueberraschungen
 * zwischen Server und Browser.
 */

export type IsoDate = string; // YYYY-MM-DD

export const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;
export const WEEKDAY_LONG = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
] as const;

export const MONTH_LONG = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
] as const;

/** Heute als ISO-Datum in lokaler Zeit. */
export function todayIso(): IsoDate {
  return toIso(new Date());
}

export function toIso(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO-Datum -> Date um 12:00 lokal (DST-sicher fuer Tagesarithmetik). */
export function fromIso(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** ISO-Datum -> UTC-Mitternacht (fuer Prisma @db.Date). */
export function isoToDbDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Prisma @db.Date -> ISO-Datum. */
export function dbDateToIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  const ms = fromIso(b).getTime() - fromIso(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function weekdayIndex(iso: IsoDate): number {
  return fromIso(iso).getDay();
}

export function isWeekend(iso: IsoDate): boolean {
  const d = weekdayIndex(iso);
  return d === 0 || d === 6;
}

/** Montag der Woche, in der `iso` liegt. */
export function startOfWeek(iso: IsoDate): IsoDate {
  const dow = weekdayIndex(iso);
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(iso, delta);
}

export function startOfMonth(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const d = fromIso(iso);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
  return toIso(last);
}

export function rangeDays(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let cur = from;
  // Harte Obergrenze, damit ein kaputter Parameter die Plantafel nie sprengt.
  for (let i = 0; i <= 400 && diffDays(cur, to) >= 0; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** ISO-Kalenderwoche. */
export function isoWeek(iso: IsoDate): number {
  const d = fromIso(iso);
  const target = new Date(d.getTime());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4, 12);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

export function formatDay(iso: IsoDate): string {
  const d = fromIso(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

export function formatDayLong(iso: IsoDate): string {
  const d = fromIso(iso);
  return `${WEEKDAY_LONG[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}.${String(
    d.getMonth() + 1,
  ).padStart(2, '0')}.${d.getFullYear()}`;
}

export function formatDateShort(iso: IsoDate | null | undefined): string {
  if (!iso) return '–';
  const d = fromIso(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function formatDateTime(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return (
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` +
    ` – ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  );
}

/** Ueberlappen sich [aStart,aEnd] und [bStart,bEnd]? */
export function overlaps(aStart: IsoDate, aEnd: IsoDate, bStart: IsoDate, bEnd: IsoDate) {
  return aStart <= bEnd && bStart <= aEnd;
}
