from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.dashboard_schema import DashboardSummaryResponse, MonitoringResponse
from app.services.dashboard_service import get_monitoring, get_summary

router = APIRouter()


@router.get("/summary", response_model=DashboardSummaryResponse)
def dashboard_summary(db: Session = Depends(get_db)):
    return get_summary(db)


@router.get("/monitoring", response_model=MonitoringResponse)
def dashboard_monitoring(db: Session = Depends(get_db)):
    return get_monitoring(db)
