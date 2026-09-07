import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { sql } from "./db.ts";

const GOOGLE_NEWS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; TemptationDashboard/1.0)",
  "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
};

const HIGH_RISK_KEYWORDS = ["SEBI", "RAID", "RESIGNATION", "LOSS", "RESULTS", "BOARD MEETING", "DIVIDEND", "SPLIT", "AGM"];
const HIGH_RISK_PATTERNS = HIGH_RISK_KEYWORDS.map((k) => new RegExp(`\\b${k}\\b`));

const NEWS_CACHE_TTL_SECONDS = 180;
const TAG_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

export class NewsFetchError extends Error {}

export type NewsItem = {
  title: string;
  source: string;
  publishedAt: string | null;
  url: string;
  snippet: string;
  isHighRisk: boolean;
};

function unescapeHtml(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = unescapeHtml(raw.replace(TAG_RE, " "));
  return text.replace(WHITESPACE_RE, " ").trim();
}

function isHighRisk(title: string, snippet: string): boolean {
  const haystack = `${title} ${snippet}`.toUpperCase();
  return HIGH_RISK_PATTERNS.some((p) => p.test(haystack));
}

function sourceText(source: unknown): string | null {
  if (!source) return null;
  if (typeof source === "string") return source.trim() || null;
  if (typeof source === "object" && source !== null && "#text" in (source as Record<string, unknown>)) {
    const t = (source as Record<string, unknown>)["#text"];
    return typeof t === "string" ? t.trim() || null : null;
  }
  return null;
}

function extractSource(item: Record<string, unknown>): string {
  const title = sourceText(item.source);
  if (title) return title;
  const rawTitle = String(item.title ?? "");
  if (rawTitle.includes(" - ")) {
    const parts = rawTitle.split(" - ");
    return parts[parts.length - 1].trim();
  }
  return "Google News";
}

function extractTitle(item: Record<string, unknown>, source: string): string {
  const rawTitle = String(item.title ?? "").trim();
  const suffix = ` - ${source}`;
  if (source && rawTitle.endsWith(suffix)) {
    return rawTitle.slice(0, -suffix.length).trim();
  }
  return rawTitle;
}

/**
 * Google News RSS descriptions are just "<a>Title</a> + Source" with no real summary text, so
 * strip both back off — anything left over is a genuine snippet worth showing.
 */
function extractSnippet(item: Record<string, unknown>, title: string, source: string): string {
  const raw = stripHtml(item.description as string | undefined);
  if (!raw) return "";
  let remainder = raw;
  if (title && remainder.startsWith(title)) {
    remainder = remainder.slice(title.length);
  }
  const strippedEnd = remainder.trimEnd();
  remainder = source && strippedEnd.endsWith(source) ? strippedEnd.slice(0, -source.length) : strippedEnd;
  return remainder.replace(/^[\s\-—–]+|[\s\-—–]+$/g, "");
}

function extractPublished(item: Record<string, unknown>): string | null {
  const pubDate = item.pubDate as string | undefined;
  if (!pubDate) return null;
  const parsed = new Date(pubDate);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return pubDate;
}

function buildFeedUrl(symbol: string): string {
  const params = new URLSearchParams({ q: `${symbol} stock India`, hl: "en-IN", gl: "IN", ceid: "IN:en" });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });

async function fetchNewsUncached(symbol: string): Promise<NewsItem[]> {
  const url = buildFeedUrl(symbol);
  let xml: string;
  try {
    const res = await fetch(url, { headers: GOOGLE_NEWS_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (e) {
    throw new NewsFetchError(`Failed to fetch Google News RSS for ${symbol}: ${e}`);
  }

  const parsed = xmlParser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item;
  const items: Record<string, unknown>[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const result: NewsItem[] = items.slice(0, 30).map((item) => {
    const source = extractSource(item);
    const title = extractTitle(item, source);
    const snippet = extractSnippet(item, title, source);
    return {
      title,
      source,
      publishedAt: extractPublished(item),
      url: String(item.link ?? ""),
      snippet,
      isHighRisk: isHighRisk(title, snippet),
    };
  });

  result.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return result;
}

/**
 * Cached (Postgres-backed TTL) so a page of concurrent viewers, or a tight refresh click,
 * doesn't hammer Google's unofficial RSS endpoint per symbol.
 */
export async function fetchStockNews(symbol: string): Promise<NewsItem[]> {
  const clean = symbol.trim().toUpperCase();
  const rows = await sql<{ items: NewsItem[]; fetched_at: Date }[]>`
    select items, fetched_at from news_cache where symbol = ${clean}
  `;
  if (rows.length > 0) {
    const ageSeconds = (Date.now() - rows[0].fetched_at.getTime()) / 1000;
    if (ageSeconds < NEWS_CACHE_TTL_SECONDS) return rows[0].items;
  }
  const items = await fetchNewsUncached(clean);
  await sql`
    insert into news_cache (symbol, items, fetched_at)
    values (${clean}, ${sql.json(items)}, now())
    on conflict (symbol) do update set items = excluded.items, fetched_at = excluded.fetched_at
  `;
  return items;
}
