// The Python backend works in "naive" wall-clock datetimes throughout (IST for trade_date/
// trade_time, UTC for created_at/updated_at via datetime.utcnow()), comparing them as plain
// values with no timezone attached. To match that exactly without timezone-object footguns,
// everything here is represented as zero-padded ISO-ish strings ("YYYY-MM-DD",
// "HH:MM:SS", "YYYY-MM-DDTHH:MM:SS"), which sort and compare correctly as plain strings.

const IST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  weekday: "short",
});

function istParts(instant: Date): { y: string; m: string; d: string; h: string; mi: string; s: string; weekday: string } {
  const parts = IST_FORMATTER.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second"), weekday: get("weekday") };
}

/** "YYYY-MM-DD" for today in IST — port of india_today(). */
export function indiaTodayStr(now: Date = new Date()): string {
  const p = istParts(now);
  return `${p.y}-${p.m}-${p.d}`;
}

/** "HH:MM:SS" for the current time in IST. */
export function indiaTimeStr(now: Date = new Date()): string {
  const p = istParts(now);
  return `${p.h}:${p.mi}:${p.s}`;
}

/** 0=Monday .. 6=Sunday in IST, matching Python's datetime.weekday(). */
export function indiaWeekday(now: Date = new Date()): number {
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const p = istParts(now);
  return order.indexOf(p.weekday);
}

/**
 * A `timestamp without time zone` column holding Python's datetime.utcnow() is a naive-UTC
 * wall-clock value; postgres.js parses it as an absolute instant assuming UTC, which is
 * correct here. Convert that instant to naive-IST wall-clock string (port of _utc_to_naive_ist).
 */
export function utcInstantToNaiveIstString(instant: Date): string {
  const p = istParts(instant);
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.mi}:${p.s}`;
}

/** "YYYY-MM-DD" + "HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS" (port of datetime.combine). */
export function combineDateTime(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}`;
}

function dateStrToUtcMs(dateStr: string): number {
  const [y, m, day] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

/** Whole-day difference between two "YYYY-MM-DD" strings (later - earlier), like Python's (a - b).days. */
export function daysBetween(laterDateStr: string, earlierDateStr: string): number {
  return Math.round((dateStrToUtcMs(laterDateStr) - dateStrToUtcMs(earlierDateStr)) / 86400000);
}
