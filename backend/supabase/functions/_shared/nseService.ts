import { sql } from "./db.ts";

const NSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://www.nseindia.com/",
};

const CACHE_TTL_SECONDS = 300;

async function nseGet(path: string, params: Record<string, string>): Promise<any[]> {
  const url = new URL(`https://www.nseindia.com/api/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { headers: NSE_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * NSE's unofficial API has no published rate limit, but it's not ours to hammer — a short
 * TTL (backed by Postgres, shared across invocations) keeps repeated calendar loads down to
 * one real request per symbol per window.
 */
async function cachedGet(cacheKey: string, path: string, params: Record<string, string>): Promise<any[]> {
  const rows = await sql<{ data: any; fetched_at: Date }[]>`
    select data, fetched_at from nse_api_cache where cache_key = ${cacheKey}
  `;
  if (rows.length > 0) {
    const ageSeconds = (Date.now() - rows[0].fetched_at.getTime()) / 1000;
    if (ageSeconds < CACHE_TTL_SECONDS) return rows[0].data;
  }
  const data = await nseGet(path, params);
  await sql`
    insert into nse_api_cache (cache_key, data, fetched_at)
    values (${cacheKey}, ${sql.json(data)}, now())
    on conflict (cache_key) do update set data = excluded.data, fetched_at = excluded.fetched_at
  `;
  return data;
}

export function fetchBoardMeetings(symbol: string): Promise<any[]> {
  return cachedGet(`bm:${symbol}`, "corporate-board-meetings", { index: "equities", symbol });
}

export function fetchCorporateActions(symbol: string): Promise<any[]> {
  return cachedGet(`ca:${symbol}`, "corporates-corporateActions", { index: "equities", symbol });
}

export function fetchAnnouncements(symbol: string): Promise<any[]> {
  return cachedGet(`an:${symbol}`, "corporate-announcements", { index: "equities", symbol });
}
