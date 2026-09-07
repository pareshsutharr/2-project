import re
from datetime import date, datetime

from app.services import nse_service

REGULATORY_KEYWORDS = ["SEBI", "RAID", "RESIGNATION", "LOSS"]
_REGULATORY_PATTERNS = [re.compile(rf"\b{re.escape(keyword)}\b", re.IGNORECASE) for keyword in REGULATORY_KEYWORDS]
_RESULTS_PATTERN = re.compile(r"\bresult", re.IGNORECASE)

# Announcement filings (unlike board meetings / corporate actions) carry no future
# event date of their own — keep a flagged one visible for a few days after filing,
# then let it drop off.
_ANNOUNCEMENT_GRACE_DAYS = 5


def _quote_page_url(symbol: str) -> str:
    return f"https://www.nseindia.com/get-quotes/equity?symbol={symbol}"


def _parse_nse_date(value: str | None) -> date | None:
    if not value or value == "-":
        return None
    try:
        return datetime.strptime(value.strip(), "%d-%b-%Y").date()
    except ValueError:
        return None


def _parse_nse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%d-%b-%Y %H:%M:%S")
    except ValueError:
        parsed_date = _parse_nse_date(value)
        return datetime.combine(parsed_date, datetime.min.time()) if parsed_date else None


def _event(title: str, url: str, event_date: date | None, published_at: datetime | None = None) -> dict:
    return {
        "title": title,
        "source": "NSE",
        "url": url,
        "publishedAt": published_at.isoformat() if published_at else None,
        "eventDate": event_date.isoformat() if event_date else None,
    }


def _build_meetings(symbol: str, today: date) -> tuple[list[dict], list[dict]]:
    meetings: list[dict] = []
    results: list[dict] = []
    for bm in nse_service.fetch_board_meetings(symbol):
        bm_date = _parse_nse_date(bm.get("bm_date"))
        if bm_date is None or bm_date < today:
            continue
        purpose = (bm.get("bm_purpose") or "Board Meeting").strip()
        desc = (bm.get("bm_desc") or "").strip()
        title = f"{purpose} — {desc}" if desc and desc.lower() != purpose.lower() else purpose
        entry = _event(title, _quote_page_url(symbol), bm_date)
        meetings.append(entry)
        if _RESULTS_PATTERN.search(purpose) or _RESULTS_PATTERN.search(desc):
            results.append(entry)
    return meetings, results


def _build_corporate_actions(symbol: str, today: date) -> list[dict]:
    actions: list[dict] = []
    for ca in nse_service.fetch_corporate_actions(symbol):
        event_date = _parse_nse_date(ca.get("exDate")) or _parse_nse_date(ca.get("recDate"))
        if event_date is None or event_date < today:
            continue
        subject = (ca.get("subject") or "Corporate Action").strip()
        actions.append(_event(subject, _quote_page_url(symbol), event_date))
    return actions


def _build_regulatory(symbol: str, today: date) -> list[dict]:
    flagged: list[dict] = []
    for an in nse_service.fetch_announcements(symbol):
        haystack = f"{an.get('desc') or ''} {an.get('attchmntText') or ''}"
        if not any(pattern.search(haystack) for pattern in _REGULATORY_PATTERNS):
            continue
        filed_at = _parse_nse_datetime(an.get("an_dt"))
        if filed_at is None or (today - filed_at.date()).days > _ANNOUNCEMENT_GRACE_DAYS:
            continue
        title = (an.get("attchmntText") or an.get("desc") or "Announcement").strip()
        url = an.get("attchmntFile") or _quote_page_url(symbol)
        flagged.append(_event(title, url, None, published_at=filed_at))
    return flagged


def build_calendar_row(script_id: int, symbol: str) -> dict:
    today = date.today()
    meetings, results = _build_meetings(symbol, today)
    corporate_actions = _build_corporate_actions(symbol, today)
    regulatory = _build_regulatory(symbol, today)

    for bucket in (meetings, results, corporate_actions):
        bucket.sort(key=lambda e: e["eventDate"] or "")
    regulatory.sort(key=lambda e: e["publishedAt"] or "", reverse=True)

    return {
        "script_id": script_id,
        "symbol": symbol,
        "meetings": meetings,
        "corporate_actions": corporate_actions,
        "results": results,
        "regulatory": regulatory,
    }


def build_calendar(scripts: list[tuple[int, str]]) -> list[dict]:
    return [build_calendar_row(script_id, symbol) for script_id, symbol in scripts]
