from __future__ import annotations

from decimal import Decimal, ROUND_FLOOR

from sqlalchemy.orm import Session

from app.models.execute_row_model import ExecuteRow
from app.models.script_model import Script
from app.schemas.dashboard_schema import DashboardSummaryResponse, MonitoringResponse, MonitoringRow
from app.services import trigger_lifecycle
from app.services.telegram_alerts import get_trigger_visual_states


def _active_scripts(db: Session) -> list[Script]:
    return (
        db.query(Script)
        .filter(Script.active.is_(True))
        .order_by(Script.created_at.desc())
        .all()
    )


def _decimal(x: object, places: int = 2) -> Decimal:
    if x is None:
        return Decimal("0")
    d = x if isinstance(x, Decimal) else Decimal(str(x))
    q = Decimal("1").scaleb(-places)  # 10^-places
    return d.quantize(q)


def _calc_qty(current: Decimal | None, total_invest_amount: Decimal, invest_slots: int) -> int:
    if current is None or current <= 0 or invest_slots <= 0:
        return 0
    slot_amount = (total_invest_amount / Decimal(invest_slots)) if invest_slots else Decimal("0")
    if slot_amount <= 0:
        return 0
    qty = (slot_amount / current).quantize(Decimal("1"), rounding=ROUND_FLOOR)
    return int(qty)


def _realized_pnl(db: Session) -> tuple[Decimal, Decimal]:
    """Booked profit/loss from every completed trade ever, across all scripts (historical fact —
    unaffected by a script later being deactivated)."""
    rows = db.query(ExecuteRow).filter(ExecuteRow.sell_price.isnot(None)).all()
    profit = Decimal("0.00")
    loss = Decimal("0.00")
    for r in rows:
        pnl = (r.sell_price - r.buy_price) * (r.sell_qty or Decimal("0"))
        if pnl > 0:
            profit += pnl
        elif pnl < 0:
            loss += -pnl
    return profit.quantize(Decimal("0.01")), loss.quantize(Decimal("0.01"))


def get_summary(db: Session) -> DashboardSummaryResponse:
    scripts = _active_scripts(db)

    buy_alerts = 0
    sell_alerts = 0
    holdings_count = 0
    market_value = Decimal("0.00")
    holdings_cost = Decimal("0.00")
    total_open_qty = Decimal("0")

    for s in scripts:
        ex_rows, _, current, _, _, pairs = trigger_lifecycle.prepare_script_triggers(db, s)
        bh, sh = trigger_lifecycle.count_trigger_hits(current, pairs)
        buy_alerts += bh
        sell_alerts += sh

        holdings_count += sum(1 for r in ex_rows if not trigger_lifecycle.is_trade_complete(r))

        tot_qty = sum((r.qty_left for r in ex_rows), start=Decimal("0"))
        total_open_qty += tot_qty
        row_cost = sum((r.buy_price * r.qty_left for r in ex_rows if r.qty_left > 0), start=Decimal("0"))
        holdings_cost += row_cost.quantize(Decimal("0.01"))

        if current is not None and current > 0 and tot_qty > 0:
            market_value += (tot_qty * current).quantize(Decimal("0.01"))

    # Only capital currently deployed in open positions counts as "invested" — a script's
    # configured budget doesn't count until a buy trigger has actually been hit.
    invested_amount = holdings_cost

    if total_open_qty <= 0:
        current_value = Decimal("0.00")
        unrealized = Decimal("0.00")
    else:
        current_value = market_value if market_value > 0 else holdings_cost
        unrealized = (current_value - holdings_cost).quantize(Decimal("0.01"))

    realized_profit, realized_loss = _realized_pnl(db)
    profit = (max(unrealized, Decimal("0.00")) + realized_profit).quantize(Decimal("0.01"))
    loss = (max(-unrealized, Decimal("0.00")) + realized_loss).quantize(Decimal("0.01"))

    return DashboardSummaryResponse(
        invested_amount=invested_amount,
        current_value=current_value,
        profit=profit,
        loss=loss,
        holdings_count=holdings_count,
        buy_alerts=buy_alerts,
        sell_alerts=sell_alerts,
    )


def get_monitoring(db: Session) -> MonitoringResponse:
    scripts = _active_scripts(db)
    rows: list[MonitoringRow] = []

    for s in scripts:
        ex_rows, _, current, buy_t, sell_t, pairs = trigger_lifecycle.prepare_script_triggers(db, s)
        mode = trigger_lifecycle.monitoring_mode(current, buy_t, sell_t)
        visual = get_trigger_visual_states(int(s.id), current, buy_t, sell_t)

        if trigger_lifecycle.has_active_holdings(ex_rows):
            tq = sum(
                (r.qty_left for r in ex_rows if not trigger_lifecycle.is_trade_complete(r)),
                start=Decimal("0"),
            )
            qty = int(tq.to_integral_value(rounding=ROUND_FLOOR))
        else:
            qty = _calc_qty(current, _decimal(s.total_invest_amount, 2), int(s.invest_slots))

        rows.append(
            MonitoringRow(
                id=int(s.id),
                script=str(s.name),
                current=current,
                buy_price=buy_t,
                sell_price=sell_t,
                qty=qty,
                pnl=None,
                mode=mode,
                buy_slots_left=int(s.invest_slots),
                buy_visual_state=visual["buy_state"],
                sell_visual_state=visual["sell_state"],
            )
        )

    return MonitoringResponse(rows=rows)
