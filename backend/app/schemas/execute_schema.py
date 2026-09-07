from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExecuteAlert(BaseModel):
    side: str
    price: Decimal
    timestamp: datetime


class ExecuteDetailsResponse(BaseModel):
    script_id: int
    script_name: str
    current_market_price: Decimal | None
    buy_trigger_value: Decimal | None
    sell_trigger_value: Decimal | None
    invested_amount: Decimal
    current_value: Decimal
    current_holdings: Decimal
    current_holding_positions: int
    total_quantity: Decimal
    up_percent: Decimal
    down_percent: Decimal
    total_invest_amount: Decimal
    invest_slots: int
    max_buy: int
    max_rows: int
    recent_alerts: list[ExecuteAlert]
    buy_visual_state: str = "NORMAL"
    sell_visual_state: str = "NORMAL"


class ExecuteRowCreate(BaseModel):
    trade_date: date
    trade_time: time
    buy_price: Decimal = Field(..., gt=0)
    sell_price: Decimal | None = Field(default=None, gt=0)


class ExecuteRowResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    script_id: int
    trade_date: date
    trade_time: time
    buy_price: Decimal
    buy_qty: Decimal
    sell_price: Decimal | None
    sell_qty: Decimal | None
    up_value: Decimal
    down_value: Decimal
    qty_left: Decimal
    created_at: datetime
    updated_at: datetime
    is_trade_complete: bool = False
    live_buy_trigger: Decimal | None = None
    live_sell_trigger: Decimal | None = None
    up_visual_state: str = "NORMAL"
    down_visual_state: str = "NORMAL"


class ExecuteRowsResponse(BaseModel):
    rows: list[ExecuteRowResponse]
