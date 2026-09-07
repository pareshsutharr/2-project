from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExecuteRow(Base):
    __tablename__ = "execute_rows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    script_id: Mapped[int] = mapped_column(ForeignKey("scripts.id", ondelete="CASCADE"), index=True, nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    trade_time: Mapped[time] = mapped_column(Time, nullable=False)

    buy_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    buy_qty: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)

    sell_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    sell_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)

    up_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    down_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    qty_left: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
