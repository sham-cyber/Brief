const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;
const WINDOW_TIME_ZONE = "Asia/Kolkata";

function localCalendarDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export function resolveBriefingWindow(
  startDate: string | Date | undefined,
  endDate: string | Date | undefined,
  now = new Date(),
): { windowStart: Date; windowEnd: Date } {
  if (startDate === undefined && endDate === undefined) {
    return {
      windowStart: new Date(now.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS),
      windowEnd: now,
    };
  }

  if (startDate === undefined || endDate === undefined) {
    throw new Error("Choose both a research start date and an end date.");
  }

  const startValue = startDate instanceof Date ? startDate.toISOString().slice(0, 10) : startDate;
  const endValue = endDate instanceof Date ? endDate.toISOString().slice(0, 10) : endDate;
  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);
  if (!start || !end) {
    throw new Error("Enter valid research dates.");
  }
  if (startValue > endValue) {
    throw new Error("The research start date must be on or before the end date.");
  }

  const today = localCalendarDate(now, WINDOW_TIME_ZONE);
  if (endValue > today) {
    throw new Error("The research end date cannot be in the future.");
  }

  const endOfSelectedDay = new Date(end.getTime() + DAY_MS - 1);
  return {
    windowStart: start,
    windowEnd: endValue === today && endOfSelectedDay > now ? now : endOfSelectedDay,
  };
}
