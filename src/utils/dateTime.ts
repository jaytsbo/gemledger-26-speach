/**
 * Shared local date/time formatting, validation, and sorting helpers.
 */

export function getLocalDateStr(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getLocalDateOffset(offsetDays: number): string {
  const dt = new Date();
  if (Number.isFinite(offsetDays)) {
    dt.setDate(dt.getDate() + Math.trunc(offsetDays));
  }
  return getLocalDateStr(dt);
}

export function getLocalTimeStr(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isValidClockTime(timeStr: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function isValidCalendarDate(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(0);
  dt.setFullYear(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

export function normalizeDateStr(raw: unknown, fallback: string = getLocalDateStr()): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return fallback;
  const match = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:$|T|\s)/.exec(trimmed);
  if (!match) return fallback;
  const candidate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return isValidCalendarDate(candidate) ? candidate : fallback;
}

export function normalizeTimeStr(raw: unknown, fallback: string = getLocalTimeStr()): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return fallback;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function compareIdsDesc(
  aId: number | string | undefined,
  bId: number | string | undefined,
): number {
  const numA = Number(aId);
  const numB = Number(bId);
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return numB - numA;
  }
  return String(bId ?? '').localeCompare(String(aId ?? ''));
}
