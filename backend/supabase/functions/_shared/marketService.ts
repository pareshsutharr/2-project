import { sql } from "./db.ts";

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; TemptationDashboard/1.0)",
  "Accept": "application/json",
};

const QUOTE_CACHE_TTL_SECONDS = 4;

async function yahooChart(symbol: string): Promise<any | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function symbolExistsOnNse(name: string): Promise<boolean> {
  const clean = name.trim().toUpperCase();
  if (!clean || clean.length > 50) return false;
  const data = await yahooChart(`${clean}.NS`);
  if (!data) return false;
  const result = data?.chart?.result;
  if (!result || !result.length) return false;
  const meta = result[0]?.meta ?? {};
  const price = meta.regularMarketPrice ?? meta.previousClose;
  return price !== null && price !== undefined;
}

export async function fetchNifty50Quote(): Promise<{ value: number | null; changePercent: number | null }> {
  const data = await yahooChart("^NSEI");
  if (!data) return { value: null, changePercent: null };
  const result = data?.chart?.result;
  if (!result || !result.length) return { value: null, changePercent: null };
  const meta = result[0]?.meta ?? {};
  const price = meta.regularMarketPrice;
  const prev = meta.previousClose ?? meta.chartPreviousClose;
  if (price === null || price === undefined || prev === null || prev === undefined || prev === 0) {
    return { value: price ?? null, changePercent: null };
  }
  const changePercent = ((price - prev) / prev) * 100;
  return { value: price, changePercent };
}

export async function fetchStockQuoteNse(name: string): Promise<number | null> {
  const clean = name.trim().toUpperCase();
  if (!clean) return null;
  const data = await yahooChart(`${clean}.NS`);
  if (!data) return null;
  const result = data?.chart?.result;
  if (!result || !result.length) return null;
  const meta = result[0]?.meta ?? {};
  const price = meta.regularMarketPrice ?? meta.previousClose;
  return price !== null && price !== undefined ? Number(price) : null;
}

/**
 * Short-TTL cache in front of fetchStockQuoteNse, backed by Postgres so the price used to
 * display (dashboard/execute reads) and the price used to auto-execute trades stay the same
 * value across separate Edge Function invocations within the TTL window (replaces the
 * Python in-process dict cache, which a stateless per-invocation model can't rely on).
 */
export async function getQuoteCached(name: string): Promise<number | null> {
  const clean = name.trim().toUpperCase();
  const rows = await sql<{ price: string | null; fetched_at: Date }[]>`
    select price, fetched_at from quote_cache where symbol = ${clean}
  `;
  if (rows.length > 0) {
    const ageSeconds = (Date.now() - rows[0].fetched_at.getTime()) / 1000;
    if (ageSeconds < QUOTE_CACHE_TTL_SECONDS) {
      return rows[0].price === null ? null : Number(rows[0].price);
    }
  }
  const price = await fetchStockQuoteNse(clean);
  await sql`
    insert into quote_cache (symbol, price, fetched_at)
    values (${clean}, ${price}, now())
    on conflict (symbol) do update set price = excluded.price, fetched_at = excluded.fetched_at
  `;
  return price;
}
