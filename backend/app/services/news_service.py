import calendar
import html
import re
import time
from datetime import datetime, timezone
from threading import Lock

import feedparser
import httpx

GOOGLE_NEWS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TemptationDashboard/1.0)",
    "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
}

HIGH_RISK_KEYWORDS = [
    "SEBI",
    "RAID",
    "RESIGNATION",
    "LOSS",
    "RESULTS",
    "BOARD MEETING",
    "DIVIDEND",
    "SPLIT",
    "AGM",
]

_NEWS_CACHE_TTL_SECONDS = 180.0
_news_cache: dict[str, tuple[float, list[dict]]] = {}
_news_cache_lock = Lock()

_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
_HIGH_RISK_PATTERNS = [re.compile(rf"\b{re.escape(keyword)}\b") for keyword in HIGH_RISK_KEYWORDS]


class NewsFetchError(Exception):
    pass


def _strip_html(raw: str | None) -> str:
    if not raw:
        return ""
    text = _TAG_RE.sub(" ", raw)
    text = html.unescape(text)
    return _WHITESPACE_RE.sub(" ", text).strip()


def _is_high_risk(title: str, snippet: str) -> bool:
    haystack = f"{title} {snippet}".upper()
    return any(pattern.search(haystack) for pattern in _HIGH_RISK_PATTERNS)


def _extract_source(entry) -> str:
    source = entry.get("source")
    if source:
        title = source.get("title") if isinstance(source, dict) else getattr(source, "title", None)
        if title:
            return title.strip()
    raw_title = entry.get("title", "")
    if " - " in raw_title:
        return raw_title.rsplit(" - ", 1)[-1].strip()
    return "Google News"


def _extract_title(entry, source: str) -> str:
    raw_title = entry.get("title", "").strip()
    suffix = f" - {source}"
    if source and raw_title.endswith(suffix):
        return raw_title[: -len(suffix)].strip()
    return raw_title


def _extract_snippet(entry, title: str, source: str) -> str:
    """
    Google News RSS descriptions are just "<a>Title</a> + Source" with no real
    summary text, so strip both back off — anything left over (rare, but some
    aggregated entries do carry extra text) is a genuine snippet worth showing.
    """
    raw = _strip_html(entry.get("summary"))
    if not raw:
        return ""
    remainder = raw
    if title and remainder.startswith(title):
        remainder = remainder[len(title):]
    stripped_end = remainder.rstrip()
    if source and stripped_end.endswith(source):
        remainder = stripped_end[: -len(source)]
    return remainder.strip(" -—–")


def _extract_published(entry) -> str | None:
    parsed = entry.get("published_parsed")
    if parsed:
        epoch = calendar.timegm(parsed)
        return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()
    return entry.get("published")


def _build_feed_url(symbol: str) -> str:
    params = {"q": f"{symbol} stock India", "hl": "en-IN", "gl": "IN", "ceid": "IN:en"}
    return str(httpx.URL("https://news.google.com/rss/search", params=params))


def _fetch_news_uncached(symbol: str) -> list[dict]:
    url = _build_feed_url(symbol)
    try:
        with httpx.Client(timeout=8.0, headers=GOOGLE_NEWS_HEADERS, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise NewsFetchError(f"Failed to fetch Google News RSS for {symbol}") from exc

    parsed = feedparser.parse(response.content)

    items: list[dict] = []
    for entry in parsed.entries[:30]:
        source = _extract_source(entry)
        title = _extract_title(entry, source)
        snippet = _extract_snippet(entry, title, source)
        items.append(
            {
                "title": title,
                "source": source,
                "publishedAt": _extract_published(entry),
                "url": entry.get("link", ""),
                "snippet": snippet,
                "isHighRisk": _is_high_risk(title, snippet),
            }
        )

    items.sort(key=lambda item: item["publishedAt"] or "", reverse=True)
    return items


def fetch_stock_news(symbol: str) -> list[dict]:
    """
    Cached (TTL below) so a page of concurrent viewers, or a tight refresh click,
    doesn't hammer Google's unofficial RSS endpoint per symbol.
    """
    clean = symbol.strip().upper()
    now = time.monotonic()
    with _news_cache_lock:
        cached = _news_cache.get(clean)
        if cached is not None and now - cached[0] < _NEWS_CACHE_TTL_SECONDS:
            return cached[1]

    items = _fetch_news_uncached(clean)

    with _news_cache_lock:
        _news_cache[clean] = (now, items)
    return items
