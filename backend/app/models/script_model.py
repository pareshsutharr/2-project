from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Script(Base):
    __tablename__ = "scripts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    up_percent: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    down_percent: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    total_invest_amount: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    invest_slots: Mapped[int] = mapped_column(Integer, nullable=False)
    max_buy: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
