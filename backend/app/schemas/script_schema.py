from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ScriptBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    up_percent: Decimal = Field(..., gt=0)
    down_percent: Decimal = Field(..., gt=0)
    total_invest_amount: Decimal = Field(..., gt=0)
    invest_slots: int = Field(..., gt=0)
    max_buy: int = Field(..., gt=0)
    active: bool = True

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        return v.strip().upper()


class ScriptCreate(ScriptBase):
    pass


class ScriptUpdate(ScriptBase):
    pass


class ScriptResponse(ScriptBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime

    @field_validator("up_percent", "down_percent", "total_invest_amount")
    @classmethod
    def _round_2dp(cls, v: Decimal) -> Decimal:
        # Existing rows may still carry 4-decimal-scale values from before this was enforced
        # at write time — round on the way out too, so every response is capped at 2dp.
        return v.quantize(Decimal("0.01"))


class ScriptValidateResponse(BaseModel):
    valid: bool


class NiftyQuoteResponse(BaseModel):
    value: float | None
    change_percent: float | None
