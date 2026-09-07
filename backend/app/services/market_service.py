import time
from threading import Lock

import httpx

YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TemptationDashboard/1.0)",
    "Accept": "application/json",
}

_QUOTE_CACHE_TTL_SECONDS = 4.0
_quote_cache: dict[str, tuple[float, float | None]] = {}
_quote_cache_lock = Lock()


def _yahoo_chart(symbol: str) -> dict | None:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    try:
        with httpx.Client(timeout=8.0, headers=YAHOO_HEADERS) as client:
            r = client.get(url)
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


def symbol_exists_on_nse(name: str) -> bool:
    clean = name.strip().upper()
    if not clean or len(clean) > 50:
        return False
    data = _yahoo_chart(f"{clean}.NS")
    if not data:
        return False
    chart = data.get("chart") or {}
    result = chart.get("result")
    if not result:
        return False
    meta = (result[0] or {}).get("meta") or {}
    price = meta.get("regularMarketPrice") or meta.get("previousClose")
    return price is not None


def fetch_nifty_50_quote() -> tuple[float | None, float | None]:
    data = _yahoo_chart("^NSEI")
    if not data:
        return None, None
    chart = data.get("chart") or {}
    result = chart.get("result")
    if not result:
        return None, None
    meta = (result[0] or {}).get("meta") or {}
    price = meta.get("regularMarketPrice")
    prev = meta.get("previousClose") or meta.get("chartPreviousClose")
    if price is None or prev is None or prev == 0:
        return (float(price) if price is not None else None, None)
    change_pct = (float(price) - float(prev)) / float(prev) * 100.0
    return float(price), change_pct


def fetch_stock_quote_nse(name: str) -> float | None:
    """
    Returns current market price for an NSE equity symbol (NAME.NS).
    """
    clean = name.strip().upper()
    if not clean:
        return None
    data = _yahoo_chart(f"{clean}.NS")
    if not data:
        return None
    chart = data.get("chart") or {}
    result = chart.get("result")
    if not result:
        return None
    meta = (result[0] or {}).get("meta") or {}
    price = meta.get("regularMarketPrice") or meta.get("previousClose")
    return float(price) if price is not None else None


def get_quote_cached(name: str) -> float | None:
    """
    Short-TTL cache in front of fetch_stock_quote_nse so the price used to display
    (dashboard/execute reads) and the price used to auto-execute trades are always
    the same value, and so multiple callers within the TTL window don't each hit
    Yahoo's unofficial endpoint separately.
    """
    clean = name.strip().upper()
    now = time.monotonic()
    with _quote_cache_lock:
        cached = _quote_cache.get(clean)
        if cached is not None and now - cached[0] < _QUOTE_CACHE_TTL_SECONDS:
            return cached[1]
    price = fetch_stock_quote_nse(clean)
    with _quote_cache_lock:
        _quote_cache[clean] = (now, price)
    return price
