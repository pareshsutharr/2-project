from decimal import Decimal

from pydantic import BaseModel, Field


class DashboardSummaryResponse(BaseModel):
    invested_amount: Decimal = Field(..., ge=0)
    current_value: Decimal = Field(..., ge=0)
    profit: Decimal = Field(..., ge=0)
    loss: Decimal = Field(..., ge=0)
    holdings_count: int = Field(..., ge=0)
    buy_alerts: int = Field(..., ge=0)
    sell_alerts: int = Field(..., ge=0)


class MonitoringRow(BaseModel):
    id: int
    script: str
    current: Decimal | None
    buy_price: Decimal | None
    sell_price: Decimal | None
    qty: int
    pnl: Decimal | None
    mode: str
    buy_slots_left: int
    buy_visual_state: str = "NORMAL"
    sell_visual_state: str = "NORMAL"


class MonitoringResponse(BaseModel):
    rows: list[MonitoringRow]
