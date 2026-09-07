from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.script_model import Script
from app.schemas.script_schema import ScriptCreate, ScriptUpdate
from app.services.market_service import symbol_exists_on_nse


def _d(value: object) -> Decimal:
    dec = value if isinstance(value, Decimal) else Decimal(str(value))
    return dec.quantize(Decimal("0.01"))


def list_scripts(db: Session) -> list[Script]:
    return db.query(Script).order_by(Script.created_at.desc()).all()


def get_script(db: Session, script_id: int) -> Script | None:
    return db.query(Script).filter(Script.id == script_id).first()


def create_script(db: Session, payload: ScriptCreate) -> Script:
    if not symbol_exists_on_nse(payload.name):
        raise ValueError("SCRIPT_NOT_FOUND")
    row = Script(
        name=payload.name,
        up_percent=_d(payload.up_percent),
        down_percent=_d(payload.down_percent),
        total_invest_amount=_d(payload.total_invest_amount),
        invest_slots=payload.invest_slots,
        max_buy=payload.max_buy,
        active=payload.active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_script(db: Session, script_id: int, payload: ScriptUpdate) -> Script | None:
    row = get_script(db, script_id)
    if not row:
        return None
    if payload.name != row.name and not symbol_exists_on_nse(payload.name):
        raise ValueError("SCRIPT_NOT_FOUND")
    row.name = payload.name
    row.up_percent = _d(payload.up_percent)
    row.down_percent = _d(payload.down_percent)
    row.total_invest_amount = _d(payload.total_invest_amount)
    row.invest_slots = payload.invest_slots
    row.max_buy = payload.max_buy
    row.active = payload.active
    db.commit()
    db.refresh(row)
    return row


def delete_script(db: Session, script_id: int) -> bool:
    row = get_script(db, script_id)
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True
