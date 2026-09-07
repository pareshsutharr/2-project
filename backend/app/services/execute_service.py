from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_FLOOR
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.execute_row_model import ExecuteRow
from app.models.script_model import Script
from app.schemas.execute_schema import ExecuteAlert, ExecuteDetailsResponse, ExecuteRowCreate, ExecuteRowResponse, ExecuteRowsResponse
from app.services import trigger_lifecycle
from app.services.telegram_alerts import clear_all_edge_state_for_script, get_trigger_visual_states, notify_row_after_save


IST = ZoneInfo("Asia/Kolkata")


def _utc_to_naive_ist(dt: datetime) -> datetime:
    """updated_at is stored as naive UTC (datetime.utcnow); trade_date/trade_time are naive IST
    wall-clock. Convert to naive IST so both timestamp sources agree in the alerts feed."""
    return dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(IST).replace(tzinfo=None)


def _d(value: object, places: int = 2) -> Decimal:
    if value is None:
        return Decimal("0").quantize(Decimal("1").scaleb(-places))
    dec = value if isinstance(value, Decimal) else Decimal(str(value))
    return dec.quantize(Decimal("1").scaleb(-places))


def _script_or_none(db: Session, script_id: int) -> Script | None:
    return db.query(Script).filter(Script.id == script_id).first()


def _rows(db: Session, script_id: int) -> list[ExecuteRow]:
    return db.query(ExecuteRow).filter(ExecuteRow.script_id == script_id).order_by(ExecuteRow.id.asc()).all()


def _slot_amount(script: Script) -> Decimal:
    # max_buy is intentionally excluded from sizing for now — see the notes on the row-cap
    # removal in add_execute_row / auto_trade_service. Only invest_slots divides the budget.
    denom = int(script.invest_slots)
    if denom <= 0:
        return Decimal("0")
    return _d(script.total_invest_amount, 2) / Decimal(denom)


def _calc_qty(slot_amount: Decimal, buy_price: Decimal) -> Decimal:
    """Whole shares only (NSE equities can't be bought/sold fractionally) — floor to the nearest unit."""
    if buy_price <= 0:
        return Decimal("0")
    return (slot_amount / buy_price).quantize(Decimal("1"), rounding=ROUND_FLOOR)


def row_to_response(db: Session, row: ExecuteRow) -> ExecuteRowResponse | None:
    """Build API row payload including live trigger fields."""
    script = _script_or_none(db, row.script_id)
    if not script:
        return None
    _, _, current_price, _, _, _ = trigger_lifecycle.prepare_script_triggers(db, script)
    all_rows = _rows(db, row.script_id)
    return _serialize_row(script, row, all_rows, current_price)


def _serialize_row(
    script: Script, row: ExecuteRow, all_rows: list[ExecuteRow], current_price: Decimal | None
) -> ExecuteRowResponse:
    up_pct = _d(script.up_percent, 2)
    down_pct = _d(script.down_percent, 2)
    complete = trigger_lifecycle.is_trade_complete(row)
    if complete:
        lbt = lst = None
    else:
        ref = trigger_lifecycle.reference_for_active_row(row, all_rows)
        if ref is not None and ref > 0:
            lbt, lst = trigger_lifecycle.triggers_from_reference(ref, up_pct, down_pct)
        else:
            lbt = lst = None
    vis = get_trigger_visual_states(int(script.id), current_price, lbt, lst)
    return ExecuteRowResponse(
        id=row.id,
        script_id=row.script_id,
        trade_date=row.trade_date,
        trade_time=row.trade_time,
        buy_price=row.buy_price,
        buy_qty=row.buy_qty,
        sell_price=row.sell_price,
        sell_qty=row.sell_qty,
        up_value=row.up_value,
        down_value=row.down_value,
        qty_left=row.qty_left,
        created_at=row.created_at,
        updated_at=_utc_to_naive_ist(row.updated_at),
        is_trade_complete=complete,
        live_buy_trigger=lbt,
        live_sell_trigger=lst,
        up_visual_state=vis["sell_state"],
        down_visual_state=vis["buy_state"],
    )


def get_execute_details(db: Session, script_id: int) -> ExecuteDetailsResponse | None:
    script = _script_or_none(db, script_id)
    if not script:
        return None

    ex_rows, _, current_price, buy_trigger, sell_trigger, _pairs = trigger_lifecycle.prepare_script_triggers(db, script)
    vis = get_trigger_visual_states(int(script.id), current_price, buy_trigger, sell_trigger)

    up_percent = _d(script.up_percent, 2)
    down_percent = _d(script.down_percent, 2)

    # Only currently-open positions count as "invested" — a completed (sold) row's qty_left is 0,
    # so its original buy cost naturally drops out once the trade is booked.
    invested_amount = sum((r.buy_price * r.qty_left for r in ex_rows), start=Decimal("0.00")).quantize(Decimal("0.01"))
    total_quantity = sum((r.qty_left for r in ex_rows), start=Decimal("0.00")).quantize(Decimal("0.01"))
    current_value = (
        (total_quantity * current_price).quantize(Decimal("0.01"))
        if current_price is not None
        else Decimal("0.00")
    )
    current_holdings = current_value
    positions = sum(1 for r in ex_rows if r.qty_left > 0)

    alerts: list[ExecuteAlert] = []
    for r in ex_rows:
        alerts.append(
            ExecuteAlert(
                side="BUY",
                price=_d(r.buy_price, 2),
                timestamp=datetime.combine(r.trade_date, r.trade_time),
            )
        )
        if r.sell_price is not None:
            alerts.append(
                ExecuteAlert(
                    side="SELL",
                    price=_d(r.sell_price, 2),
                    timestamp=_utc_to_naive_ist(r.updated_at),
                )
            )
    alerts.sort(key=lambda a: a.timestamp, reverse=True)

    return ExecuteDetailsResponse(
        script_id=script.id,
        script_name=script.name,
        current_market_price=current_price,
        buy_trigger_value=buy_trigger,
        sell_trigger_value=sell_trigger,
        invested_amount=invested_amount,
        current_value=current_value,
        current_holdings=current_holdings,
        current_holding_positions=positions,
        total_quantity=total_quantity,
        up_percent=up_percent,
        down_percent=down_percent,
        total_invest_amount=_d(script.total_invest_amount, 2),
        invest_slots=int(script.invest_slots),
        max_buy=int(script.max_buy),
        max_rows=int(script.invest_slots) * int(script.max_buy),
        recent_alerts=alerts[:5],
        buy_visual_state=vis["buy_state"],
        sell_visual_state=vis["sell_state"],
    )


def get_execute_rows(db: Session, script_id: int) -> ExecuteRowsResponse | None:
    script = _script_or_none(db, script_id)
    if not script:
        return None
    _, _, current_price, _, _, _ = trigger_lifecycle.prepare_script_triggers(db, script)
    rows = _rows(db, script_id)
    return ExecuteRowsResponse(rows=[_serialize_row(script, r, rows, current_price) for r in rows])


def add_execute_row(db: Session, script_id: int, payload: ExecuteRowCreate, notify: bool = True) -> ExecuteRow | None:
    script = _script_or_none(db, script_id)
    if not script:
        return None

    # Cap concurrent open positions at invest_slots — each slot commits total_invest_amount /
    # invest_slots, so letting more than invest_slots stay open at once overcommits capital
    # beyond total_invest_amount. (max_buy lifetime-row cap is a separate, still-unenforced idea.)
    open_positions = sum(1 for r in _rows(db, script_id) if r.qty_left > 0)
    if open_positions >= int(script.invest_slots):
        raise ValueError("NO_SLOT_AVAILABLE")

    buy_price = _d(payload.buy_price, 2)
    slot_amount = _slot_amount(script)
    buy_qty = _calc_qty(slot_amount, buy_price)
    if buy_qty <= 0:
        raise ValueError("ZERO_QTY")
    sell_price = _d(payload.sell_price, 2) if payload.sell_price is not None else None
    sell_qty = buy_qty if sell_price is not None else None

    up_value = (buy_price * (Decimal("1") + (_d(script.up_percent, 2) / Decimal("100")))).quantize(Decimal("0.01"))
    down_value = (buy_price * (Decimal("1") - (_d(script.down_percent, 2) / Decimal("100")))).quantize(Decimal("0.01"))
    qty_left = Decimal("0.00") if sell_price is not None else buy_qty

    row = ExecuteRow(
        script_id=script_id,
        trade_date=payload.trade_date,
        trade_time=payload.trade_time,
        buy_price=buy_price,
        buy_qty=buy_qty,
        sell_price=sell_price,
        sell_qty=sell_qty,
        up_value=up_value,
        down_value=down_value,
        qty_left=qty_left,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    trigger_lifecycle.rebuild_post_sell_anchor(db, script_id)
    clear_all_edge_state_for_script(script_id)
    if notify and not trigger_lifecycle.is_trade_complete(row):
        notify_row_after_save(db, script, row)
    return row


def update_execute_row(db: Session, row_id: int, payload: ExecuteRowCreate, notify: bool = True) -> ExecuteRow | None:
    row = db.query(ExecuteRow).filter(ExecuteRow.id == row_id).first()
    if not row:
        return None
    script = _script_or_none(db, row.script_id)
    if not script:
        return None

    buy_price = _d(payload.buy_price, 2)
    slot_amount = _slot_amount(script)
    buy_qty = _calc_qty(slot_amount, buy_price)
    sell_price = _d(payload.sell_price, 2) if payload.sell_price is not None else None
    sell_qty = buy_qty if sell_price is not None else None

    up_value = (buy_price * (Decimal("1") + (_d(script.up_percent, 2) / Decimal("100")))).quantize(Decimal("0.01"))
    down_value = (buy_price * (Decimal("1") - (_d(script.down_percent, 2) / Decimal("100")))).quantize(Decimal("0.01"))
    qty_left = Decimal("0.00") if sell_price is not None else buy_qty

    row.trade_date = payload.trade_date
    row.trade_time = payload.trade_time
    row.buy_price = buy_price
    row.buy_qty = buy_qty
    row.sell_price = sell_price
    row.sell_qty = sell_qty
    row.up_value = up_value
    row.down_value = down_value
    row.qty_left = qty_left

    db.commit()
    db.refresh(row)
    trigger_lifecycle.rebuild_post_sell_anchor(db, row.script_id)
    clear_all_edge_state_for_script(row.script_id)
    if notify and not trigger_lifecycle.is_trade_complete(row):
        notify_row_after_save(db, script, row)
    return row
