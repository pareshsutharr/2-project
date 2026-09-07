"""
Background auto-trade tick: replaces manual buy/sell entry with automatic execution
against live NSE prices. Runs on an APScheduler interval job (see app/main.py).
"""
from __future__ import annotations

import logging
from datetime import datetime, time as dt_time
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.database import SessionLocal
from app.models.execute_row_model import ExecuteRow
from app.models.script_model import Script
from app.schemas.execute_schema import ExecuteRowCreate
from app.services import execute_service, trigger_lifecycle
from app.services.telegram_alerts import send_telegram_message

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")
MARKET_OPEN = dt_time(9, 15)
MARKET_CLOSE = dt_time(15, 30)


def is_market_open_now() -> bool:
    now = datetime.now(IST)
    if now.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    return MARKET_OPEN <= now.time() <= MARKET_CLOSE


def _auto_sell(db, script: Script, row: ExecuteRow, price: Decimal) -> None:
    payload = ExecuteRowCreate(
        trade_date=row.trade_date,
        trade_time=row.trade_time,
        buy_price=row.buy_price,
        sell_price=price,
    )
    updated = execute_service.update_execute_row(db, row.id, payload, notify=False)
    if not updated or updated.sell_price is None or updated.sell_qty is None:
        return
    pnl = ((updated.sell_price - updated.buy_price) * updated.sell_qty).quantize(Decimal("0.01"))
    send_telegram_message(
        f"🤖 AUTO-SELL executed\n"
        f"Script: {script.name}\n"
        f"Price: {updated.sell_price}\n"
        f"Qty: {updated.sell_qty}\n"
        f"P&L: {pnl}"
    )


def _auto_buy(db, script: Script, price: Decimal) -> None:
    now = datetime.now(IST)
    payload = ExecuteRowCreate(
        trade_date=now.date(),
        trade_time=now.time().replace(microsecond=0),
        buy_price=price,
        sell_price=None,
    )
    try:
        row = execute_service.add_execute_row(db, script.id, payload, notify=False)
    except ValueError:
        return
    if not row:
        return
    send_telegram_message(
        f"🤖 AUTO-BUY executed\nScript: {script.name}\nPrice: {row.buy_price}\nQty: {row.buy_qty}"
    )


def _process_script(db, script: Script) -> None:
    rows, _state, current, buy_t, _sell_t, _pairs = trigger_lifecycle.prepare_script_triggers(db, script)
    if current is None:
        return

    open_rows = sorted((r for r in rows if r.sell_price is None), key=lambda r: r.up_value)
    sold_any = False
    for row in open_rows:
        if current >= row.up_value:
            _auto_sell(db, script, row, current)
            sold_any = True

    if sold_any:
        rows, _state, current, buy_t, _sell_t, _pairs = trigger_lifecycle.prepare_script_triggers(db, script)
        if current is None:
            return
        open_rows = [r for r in rows if r.sell_price is None]

    # Don't open a new position once invest_slots concurrent positions are already held —
    # see execute_service.add_execute_row for the matching guard on the row-creation side.
    if len(open_rows) >= int(script.invest_slots):
        return

    if not rows:
        # Fresh script, never traded: enter immediately at the current price instead of
        # waiting for a dip. This also creates that row's own buy/sell targets (up_value/
        # down_value), which then drive all subsequent auto-buy/auto-sell decisions.
        _auto_buy(db, script, current)
    elif buy_t is not None and current <= buy_t:
        _auto_buy(db, script, current)


def run_tick() -> None:
    if not is_market_open_now():
        return
    db = SessionLocal()
    try:
        scripts = db.query(Script).filter(Script.active.is_(True)).all()
        for script in scripts:
            try:
                _process_script(db, script)
            except Exception:
                logger.exception("Auto-trade tick failed for script %s (%s)", script.id, script.name)
    finally:
        db.close()
