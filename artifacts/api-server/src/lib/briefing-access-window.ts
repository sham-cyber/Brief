export type AccessWindowState =
  | "not-configured"
  | "scheduled"
  | "active"
  | "expired";

export type UserBriefingAccessWindow = {
  from: string | null;
  through: string | null;
  state: AccessWindowState;
  active: boolean;
  expiresAt: Date | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ZONE = "Asia/Kolkata";

function dateParts(value: string): [number, number, number] | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return [year, month, day];
}

export function isValidCalendarDate(value: string): boolean {
  return dateParts(value) !== null;
}

export function getMaxAccessWindowEnd(from: string): string | null {
  const parts = dateParts(from);
  if (!parts) return null;
  const [year, month, day] = parts;
  const nextMonthLastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, nextMonthLastDay)))
    .toISOString()
    .slice(0, 10);
}

export function validateAccessWindow(
  from: string | null,
  through: string | null,
): string | null {
  if (from === null && through === null) return null;
  if (from === null || through === null) {
    return "Choose both an active-from date and an active-through date.";
  }
  if (!isValidCalendarDate(from) || !isValidCalendarDate(through)) {
    return "Enter valid calendar dates.";
  }
  if (through < from) {
    return "The active-through date must be on or after the active-from date.";
  }
  const maxThrough = getMaxAccessWindowEnd(from);
  if (maxThrough && through > maxThrough) {
    return "The active window can be no longer than one calendar month.";
  }
  return null;
}

export function getKolkataDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextKolkataMidnight(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
  return new Date(`${nextDate}T00:00:00+05:30`);
}

export function assessAccessWindow(
  from: string | null,
  through: string | null,
  now = new Date(),
): UserBriefingAccessWindow {
  if (!from || !through) {
    return {
      from,
      through,
      state: "not-configured",
      active: false,
      expiresAt: null,
    };
  }
  const today = getKolkataDate(now);
  if (today < from) {
    return { from, through, state: "scheduled", active: false, expiresAt: null };
  }
  if (today > through) {
    return { from, through, state: "expired", active: false, expiresAt: null };
  }
  return {
    from,
    through,
    state: "active",
    active: true,
    expiresAt: today === through ? nextKolkataMidnight(through) : null,
  };
}
