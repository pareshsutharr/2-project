"""
Telegram trigger alerts: reads TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from env.
Edge detection on the script-level last-action trigger band (row_id 0 in state map).
"""
from __future__ import annotations

import logging
import os
from threading import Lock
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.models.execute_row_model import ExecuteRow
from app.models.script_model import Script

logger = logging.getLogger(__name__)

# (script_id, row_id) -> last buy/sell zone flags. row_id 0 = script-level last-action / flat band.
_edge_state_row: dict[tuple[int, int], dict[str, bool]] = {}
_visual_memory: dict[int, dict[str, bool]] = {}
_edge_state_lock = Lock()


def _telegram_configured() -> bool:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    chat = (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    return bool(token and chat)


def send_telegram_message(text: str) -> bool:
    """POST sendMessage. Returns True on success. Never raises."""
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        with httpx.Client(timeout=12.0) as client:
            r = client.post(url, json={"chat_id": chat_id, "text": text[:4000]})
            if r.status_code >= 400:
                logger.warning("Telegram sendMessage failed: %s %s", r.status_code, r.text[:200])
                return False
            return True
    except Exception as e:
        logger.warning("Telegram request error: %s", e)
        return False


def clear_row_edge_state(script_id: int, row_id: int) -> None:
    """Remove edge memory for one row id (legacy); prefer clear_all_edge_state_for_script."""
    with _edge_state_lock:
        _edge_state_row.pop((int(script_id), int(row_id)), None)


def clear_all_edge_state_for_script(script_id: int) -> None:
    """Reset only edge-state latches for a script (re-arm detection)."""
    sid = int(script_id)
    with _edge_state_lock:
        for k in list(_edge_state_row.keys()):
            if k[0] == sid:
                del _edge_state_row[k]


def get_trigger_visual_states(
    script_id: int,
    current: Decimal | None,
    buy_t: Decimal | None,
    sell_t: Decimal | None,
) -> dict[str, str]:
    """Return UI states: NORMAL | ACTIVE | TRIGGERED for buy/sell."""
    sid = int(script_id)
    with _edge_state_lock:
        vm = _visual_memory.setdefault(sid, {"buy_hit_once": False, "sell_hit_once": False})
        buy_inside = bool(current is not None and buy_t is not None and current <= buy_t)
        sell_inside = bool(current is not None and sell_t is not None and current >= sell_t)
        if buy_inside:
            buy_state = "ACTIVE"
        elif vm["buy_hit_once"]:
            buy_state = "TRIGGERED"
        else:
            buy_state = "NORMAL"
        if sell_inside:
            sell_state = "ACTIVE"
        elif vm["sell_hit_once"]:
            sell_state = "TRIGGERED"
        else:
            sell_state = "NORMAL"
    return {"buy_state": buy_state, "sell_state": sell_state}


def emit_fresh_session_if_applicable(
    script: Script,
    ist_calendar_advanced: bool,
    rows: list,
    current: Decimal | None,
    buy_t: Decimal | None,
    sell_t: Decimal | None,
    pairs: list[tuple[Decimal, Decimal]],
) -> None:
    """
    One Telegram per script on the first IST day roll when there are no open holdings:
    sends market-based fresh buy/sell trigger band (same as dashboard aggregate).
    """
    if not _telegram_configured() or not ist_calendar_advanced:
        return

    from app.services.trigger_lifecycle import has_active_holdings

    if has_active_holdings(rows):
        return
    if current is None or buy_t is None or sell_t is None or not pairs:
        return

    send_telegram_message(
        f"🌅 Fresh session (IST)\n"
        f"No open holdings from the prior day.\n"
        f"Script: {script.name}\n"
        f"LTP (reference): {current}\n"
        f"Buy trigger: {buy_t}\n"
        f"Sell trigger: {sell_t}"
    )


def _process_row_edge(
    script: Script,
    row_id: int,
    current: Decimal,
    buy_t: Decimal,
    sell_t: Decimal,
) -> None:
    """One edge step for a logical row (real execute row id, or 0 = aggregate band)."""
    sid = int(script.id)
    key = (sid, int(row_id))
    buy_z = current <= buy_t
    sell_z = current >= sell_t
    send_buy = False
    send_sell = False
    with _edge_state_lock:
        prev = _edge_state_row.setdefault(key, {"buy": False, "sell": False})
        vm = _visual_memory.setdefault(sid, {"buy_hit_once": False, "sell_hit_once": False})
        # Emit at most one side per evaluation to avoid dual messages.
        if buy_z and not prev["buy"]:
            send_buy = True
            vm["buy_hit_once"] = True
        elif sell_z and not prev["sell"]:
            send_sell = True
            vm["sell_hit_once"] = True
        prev["buy"] = buy_z
        prev["sell"] = sell_z

    label = f"Row #{row_id}" if row_id else "Last-action band"
    if send_buy:
        send_telegram_message(
            f"🔔 {label} — BUY side\n"
            f"Script: {script.name}\n"
            f"LTP: {current}\n"
            f"Buy trigger (≤): {buy_t}  |  Sell trigger (≥): {sell_t}"
        )
    if send_sell:
        send_telegram_message(
            f"🔔 {label} — SELL side\n"
            f"Script: {script.name}\n"
            f"LTP: {current}\n"
            f"Buy trigger (≤): {buy_t}  |  Sell trigger (≥): {sell_t}"
        )


def notify_row_after_save(db: Session, script: Script, row: ExecuteRow) -> None:
    """
    After creating/updating a row: if LTP already hits the current last-action band, send once
    and sync edge state so polling does not duplicate.
    """
    if not _telegram_configured():
        return

    from app.services import trigger_lifecycle as tl
    from app.services.market_service import fetch_stock_quote_nse

    all_rows = db.query(ExecuteRow).filter(ExecuteRow.script_id == script.id).order_by(ExecuteRow.id.asc()).all()
    ref = tl.last_action_ref_price(all_rows)
    if ref is None or ref <= 0:
        return
    price_f = fetch_stock_quote_nse(script.name)
    if price_f is None:
        return
    current = (Decimal(str(price_f))).quantize(Decimal("0.01"))
    up_pct = (Decimal(str(script.up_percent))).quantize(Decimal("0.01"))
    down_pct = (Decimal(str(script.down_percent))).quantize(Decimal("0.01"))
    bt, st = tl.triggers_from_reference(ref, up_pct, down_pct)
    _process_row_edge(script, 0, current, bt, st)
