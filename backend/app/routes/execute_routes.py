from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.execute_schema import ExecuteDetailsResponse, ExecuteRowsResponse
from app.services.execute_service import get_execute_details, get_execute_rows

router = APIRouter()


@router.get("/{script_id}", response_model=ExecuteDetailsResponse)
def execute_details(script_id: int, db: Session = Depends(get_db)):
    data = get_execute_details(db, script_id)
    if not data:
        raise HTTPException(status_code=404, detail="Script not found")
    return data


@router.get("/{script_id}/rows", response_model=ExecuteRowsResponse)
def execute_rows(script_id: int, db: Session = Depends(get_db)):
    data = get_execute_rows(db, script_id)
    if not data:
        raise HTTPException(status_code=404, detail="Script not found")
    return data
