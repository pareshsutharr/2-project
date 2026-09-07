import * as nse from "./nseService.ts";
import { daysBetween, indiaTodayStr } from "./wallclock.ts";

const REGULATORY_KEYWORDS = ["SEBI", "RAID", "RESIGNATION", "LOSS"];
const REGULATORY_PATTERNS = REGULATORY_KEYWORDS.map((k) => new RegExp(`\\b${k}\\b`, "i"));
const RESULTS_PATTERN = /\bresult/i;
const ANNOUNCEMENT_GRACE_DAYS = 5;

type CalendarEvent = {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  eventDate: string | null;
};

function quotePageUrl(symbol: string): string {
  return `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Parses NSE's "DD-Mon-YYYY" date format into "YYYY-MM-DD". */
function parseNseDate(value: string | null | undefined): string | null {
  if (!value || value === "-") return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2]];
  const year = Number(m[3]);
  if (month === undefined) return null;
  return `${year.toString().padStart(4, "0")}-${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

/** Parses "DD-Mon-YYYY HH:MM:SS" (or falls back to date-only) into an ISO-ish naive string. */
function parseNseDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2]];
    const year = Number(m[3]);
    if (month === undefined) return null;
    return `${year.toString().padStart(4, "0")}-${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}T${m[4]}:${m[5]}:${m[6]}`;
  }
  const dateOnly = parseNseDate(value);
  return dateOnly ? `${dateOnly}T00:00:00` : null;
}

function event(title: string, url: string, eventDate: string | null, publishedAt: string | null = null): CalendarEvent {
  return { title, source: "NSE", url, publishedAt, eventDate };
}

async function buildMeetings(symbol: string, today: string): Promise<[CalendarEvent[], CalendarEvent[]]> {
  const meetings: CalendarEvent[] = [];
  const results: CalendarEvent[] = [];
  for (const bm of await nse.fetchBoardMeetings(symbol)) {
    const bmDate = parseNseDate(bm.bm_date);
    if (bmDate === null || bmDate < today) continue;
    const purpose = (bm.bm_purpose ?? "Board Meeting").trim();
    const desc = (bm.bm_desc ?? "").trim();
    const title = desc && desc.toLowerCase() !== purpose.toLowerCase() ? `${purpose} — ${desc}` : purpose;
    const entry = event(title, quotePageUrl(symbol), bmDate);
    meetings.push(entry);
    if (RESULTS_PATTERN.test(purpose) || RESULTS_PATTERN.test(desc)) results.push(entry);
  }
  return [meetings, results];
}

async function buildCorporateActions(symbol: string, today: string): Promise<CalendarEvent[]> {
  const actions: CalendarEvent[] = [];
  for (const ca of await nse.fetchCorporateActions(symbol)) {
    const eventDate = parseNseDate(ca.exDate) ?? parseNseDate(ca.recDate);
    if (eventDate === null || eventDate < today) continue;
    const subject = (ca.subject ?? "Corporate Action").trim();
    actions.push(event(subject, quotePageUrl(symbol), eventDate));
  }
  return actions;
}

async function buildRegulatory(symbol: string, today: string): Promise<CalendarEvent[]> {
  const flagged: CalendarEvent[] = [];
  for (const an of await nse.fetchAnnouncements(symbol)) {
    const haystack = `${an.desc ?? ""} ${an.attchmntText ?? ""}`;
    if (!REGULATORY_PATTERNS.some((p) => p.test(haystack))) continue;
    const filedAt = parseNseDateTime(an.an_dt);
    if (filedAt === null || daysBetween(today, filedAt.slice(0, 10)) > ANNOUNCEMENT_GRACE_DAYS) continue;
    const title = (an.attchmntText ?? an.desc ?? "Announcement").trim();
    const url = an.attchmntFile ?? quotePageUrl(symbol);
    flagged.push(event(title, url, null, filedAt));
  }
  return flagged;
}

export async function buildCalendarRow(scriptId: number, symbol: string): Promise<Record<string, unknown>> {
  const today = indiaTodayStr();
  const [meetings, results] = await buildMeetings(symbol, today);
  const corporateActions = await buildCorporateActions(symbol, today);
  const regulatory = await buildRegulatory(symbol, today);

  for (const bucket of [meetings, results, corporateActions]) {
    bucket.sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));
  }
  regulatory.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  return {
    script_id: scriptId,
    symbol,
    meetings,
    corporate_actions: corporateActions,
    results,
    regulatory,
  };
}

export async function buildCalendar(scripts: [number, string][]): Promise<Record<string, unknown>[]> {
  return await Promise.all(scripts.map(([id, name]) => buildCalendarRow(id, name)));
}
