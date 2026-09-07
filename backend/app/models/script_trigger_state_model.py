from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ScriptTriggerState(Base):
    """Per-script anchor for post-complete trigger cycle + overnight session date (IST)."""

    __tablename__ = "script_trigger_state"

    script_id: Mapped[int] = mapped_column(ForeignKey("scripts.id", ondelete="CASCADE"), primary_key=True)
    post_sell_anchor_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    last_session_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
