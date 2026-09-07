import time
from threading import Lock

import httpx

NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nseindia.com/",
}

_CACHE_TTL_SECONDS = 300.0
_cache: dict[str, tuple[float, list[dict]]] = {}
_cache_lock = Lock()


def _nse_get(path: str, params: dict) -> list[dict]:
    url = f"https://www.nseindia.com/api/{path}"
    try:
        with httpx.Client(headers=NSE_HEADERS, timeout=10.0, follow_redirects=True) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError):
        return []
    return data if isinstance(data, list) else []


def _cached_get(cache_key: str, path: str, params: dict) -> list[dict]:
    """
    NSE's unofficial API has no published rate limit, but it's not ours to hammer —
    a short TTL keeps repeated calendar loads (and multiple scripts sharing a
    refresh) down to one real request per symbol per window.
    """
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]

    data = _nse_get(path, params)

    with _cache_lock:
        _cache[cache_key] = (now, data)
    return data


def fetch_board_meetings(symbol: str) -> list[dict]:
    return _cached_get(f"bm:{symbol}", "corporate-board-meetings", {"index": "equities", "symbol": symbol})


def fetch_corporate_actions(symbol: str) -> list[dict]:
    return _cached_get(f"ca:{symbol}", "corporates-corporateActions", {"index": "equities", "symbol": symbol})


def fetch_announcements(symbol: str) -> list[dict]:
    return _cached_get(f"an:{symbol}", "corporate-announcements", {"index": "equities", "symbol": symbol})
