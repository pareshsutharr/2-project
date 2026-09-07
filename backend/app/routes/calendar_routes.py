from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.calendar_schema import CalendarResponse
from app.services import script_service
from app.services.calendar_service import build_calendar

router = APIRouter()


@router.get("", response_model=CalendarResponse)
def get_calendar(db: Session = Depends(get_db)):
    scripts = script_service.list_scripts(db)
    rows = build_calendar([(s.id, s.name) for s in scripts])
    return CalendarResponse(rows=rows)
