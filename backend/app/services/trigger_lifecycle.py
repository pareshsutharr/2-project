"""
Multi-row live trigger reference logic; optional Telegram edge alerts (telegram_alerts).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.execute_row_model import ExecuteRow
from app.models.script_model import Script
from app.models.script_trigger_state_model import ScriptTriggerState
from app.services.market_service import get_quote_cached

IST = ZoneInfo("Asia/Kolkata")


def india_today() -> date:
    return datetime.now(IST).date()


def _d(value: object, places: int = 2) -> Decimal:
    if value is None:
        return Decimal("0").quantize(Decimal("1").scaleb(-places))
    dec = value if isinstance(value, Decimal) else Decimal(str(value))
    return dec.quantize(Decimal("1").scaleb(-places))


def _utc_to_naive_ist(dt: datetime) -> datetime:
    """row.updated_at is naive UTC (datetime.utcnow); trade_date/trade_time are naive IST
    wall-clock. Convert to naive IST so both can be compared on the same clock."""
    return dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(IST).replace(tzinfo=None)


def is_trade_complete(row: ExecuteRow) -> bool:
    """Complete when both buy and sell prices are recorded (row is historical for live triggers)."""
    return row.sell_price is not None and row.buy_price is not None


def has_active_holdings(rows: list[ExecuteRow]) -> bool:
    """Overnight CASE 1: any row still missing a sell (open / partial workflow)."""
    return any(not is_trade_complete(r) for r in rows)


def triggers_from_reference(ref: Decimal, up_pct: Decimal, down_pct: Decimal) -> tuple[Decimal, Decimal]:
    """Buy trigger below ref, sell trigger above ref (percent of ref)."""
    buy_t = (ref * (Decimal("1") - down_pct / Decimal("100"))).quantize(Decimal("0.01"))
    sell_t = (ref * (Decimal("1") + up_pct / Decimal("100"))).quantize(Decimal("0.01"))
    return buy_t, sell_t


def _row_last_event(row: ExecuteRow) -> tuple[datetime, Decimal] | None:
    """This row's own most recent action: its sell if it's been sold, else its buy."""
    if is_trade_complete(row):
        if row.sell_price is None:
            return None
        return _utc_to_naive_ist(row.updated_at), _d(row.sell_price, 2)
    if row.buy_price is None:
        return None
    return datetime.combine(row.trade_date, row.trade_time), _d(row.buy_price, 2)


def last_action_ref_price(rows: list[ExecuteRow]) -> Decimal | None:
    """
    Reference for the next trigger band: price of whichever action — any row's buy or sell —
    happened most recently in real (IST) time. Rows can complete out of order when several
    positions are open at once (e.g. a later-opened row's target gets hit before an
    earlier-opened one's), so the highest row id is not always the most recent real action.
    """
    events = [e for e in (_row_last_event(r) for r in rows) if e is not None]
    if not events:
        return None
    events.sort(key=lambda e: e[0])
    return events[-1][1]


def reference_for_active_row(row: ExecuteRow, all_rows: list[ExecuteRow] | None = None) -> Decimal | None:
    """
    Reference used for live buy/sell trigger display on a row.
    Uses script-level last-action ref when all_rows is provided; else falls back to row buy only.
    """
    if is_trade_complete(row):
        return None
    if all_rows is not None:
        return last_action_ref_price(all_rows)
    return _d(row.buy_price, 2) if row.buy_price else None


def get_or_create_state(db: Session, script_id: int) -> ScriptTriggerState:
    st = db.query(ScriptTriggerState).filter(ScriptTriggerState.script_id == script_id).first()
    if st is None:
        st = ScriptTriggerState(script_id=script_id)
        db.add(st)
        db.commit()
        db.refresh(st)
    return st


def refresh_overnight_session(db: Session, script_id: int, rows: list[ExecuteRow]) -> tuple[ScriptTriggerState, bool]:
    """
    CASE 2: new IST day and no active holdings -> clear post-sell anchor (fresh session).
    CASE 1: holdings exist -> keep anchors; only advance session date.

    Returns (state, ist_calendar_advanced). The second value is True only on the first
    processing of a new IST calendar day for this script (used for one-time fresh-session Telegram).
    """
    st = get_or_create_state(db, script_id)
    today = india_today()
    ist_calendar_advanced = st.last_session_date != today
    if ist_calendar_advanced:
        if not has_active_holdings(rows):
            st.post_sell_anchor_price = None
        st.last_session_date = today
        db.commit()
        db.refresh(st)
    elif st.last_session_date is None:
        st.last_session_date = today
        db.commit()
        db.refresh(st)
    return st, ist_calendar_advanced


def rebuild_post_sell_anchor(db: Session, script_id: int) -> None:
    """Anchor = sell price of the latest (highest id) completed row; clear if none."""
    st = get_or_create_state(db, script_id)
    rows = (
        db.query(ExecuteRow)
        .filter(ExecuteRow.script_id == script_id)
        .order_by(ExecuteRow.id.desc())
        .all()
    )
    anchor: Decimal | None = None
    for r in rows:
        if is_trade_complete(r) and r.sell_price is not None:
            anchor = _d(r.sell_price, 2)
            break
    st.post_sell_anchor_price = anchor
    db.commit()


def aggregate_live_triggers(
    rows: list[ExecuteRow],
    up_pct: Decimal,
    down_pct: Decimal,
    market_price: Decimal | None,
    post_sell_anchor: Decimal | None,
) -> tuple[Decimal | None, Decimal | None, list[tuple[Decimal, Decimal]]]:
    """
    Returns (display_buy_trigger, display_sell_trigger, pairs).
    When any execute rows exist, one band from last_action_ref_price (latest row: sell if complete else buy).
    When no rows, use post_sell_anchor then market (fresh session / overnight rules unchanged).
    """
    active_pairs: list[tuple[Decimal, Decimal]] = []
    if rows:
        ref = last_action_ref_price(rows)
        if ref is not None and ref > 0:
            bt, st = triggers_from_reference(ref, up_pct, down_pct)
            active_pairs.append((bt, st))

    if active_pairs:
        min_buy = min(p[0] for p in active_pairs)
        max_sell = max(p[1] for p in active_pairs)
        return min_buy, max_sell, active_pairs

    # No rows on script: use post-sell anchor or fresh market reference
    ref: Decimal | None = None
    if post_sell_anchor is not None and post_sell_anchor > 0:
        ref = post_sell_anchor
    elif market_price is not None and market_price > 0:
        ref = market_price

    if ref is None:
        return None, None, []
    bt, st = triggers_from_reference(ref, up_pct, down_pct)
    return bt, st, [(bt, st)]


def monitoring_mode(current: Decimal | None, buy_t: Decimal | None, sell_t: Decimal | None) -> str:
    if current is None or buy_t is None or sell_t is None:
        return "INACTIVE"
    if current <= buy_t:
        return "WAIT_BUY"
    if current >= sell_t:
        return "WAIT_SELL"
    return "HOLDING"


def count_trigger_hits(
    current: Decimal | None, pairs: list[tuple[Decimal, Decimal]]
) -> tuple[int, int]:
    """How many active row trigger pairs are hit by current price (OR logic per side)."""
    if current is None or not pairs:
        return 0, 0
    buys = 0
    sells = 0
    for bt, st in pairs:
        if current <= bt:
            buys += 1
        if current >= st:
            sells += 1
    return buys, sells


def prepare_script_triggers(
    db: Session, script: Script
) -> tuple[list[ExecuteRow], ScriptTriggerState, Decimal | None, Decimal | None, Decimal | None, list[tuple[Decimal, Decimal]]]:
    """Load rows, apply overnight session rules, compute live trigger pairs for this script."""
    rows = (
        db.query(ExecuteRow)
        .filter(ExecuteRow.script_id == script.id)
        .order_by(ExecuteRow.id.asc())
        .all()
    )
    state, ist_calendar_advanced = refresh_overnight_session(db, script.id, rows)
    state = db.query(ScriptTriggerState).filter(ScriptTriggerState.script_id == script.id).first()
    anchor = state.post_sell_anchor_price if state else None

    price_f = get_quote_cached(script.name)
    current = _d(price_f, 2) if price_f is not None else None
    up_pct = _d(script.up_percent, 2)
    down_pct = _d(script.down_percent, 2)

    buy_t, sell_t, pairs = aggregate_live_triggers(rows, up_pct, down_pct, current, anchor)

    from app.services.telegram_alerts import emit_fresh_session_if_applicable

    emit_fresh_session_if_applicable(script, ist_calendar_advanced, rows, current, buy_t, sell_t, pairs)

    return rows, state, current, buy_t, sell_t, pairs
