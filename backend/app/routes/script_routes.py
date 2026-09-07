from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.script_schema import ScriptCreate, ScriptResponse, ScriptUpdate, ScriptValidateResponse
from app.services import script_service
from app.services.market_service import symbol_exists_on_nse

router = APIRouter()


@router.get("", response_model=list[ScriptResponse])
def get_scripts(db: Session = Depends(get_db)):
    return script_service.list_scripts(db)


@router.get("/validate", response_model=ScriptValidateResponse)
def validate_script(name: str = Query(..., min_length=1, max_length=50)):
    valid = symbol_exists_on_nse(name)
    return ScriptValidateResponse(valid=valid)


@router.post("", response_model=ScriptResponse, status_code=201)
def create_script(body: ScriptCreate, db: Session = Depends(get_db)):
    try:
        return script_service.create_script(db, body)
    except ValueError as e:
        if str(e) == "SCRIPT_NOT_FOUND":
            raise HTTPException(status_code=400, detail="Script does not exist") from e
        raise


@router.put("/{script_id}", response_model=ScriptResponse)
def update_script(script_id: int, body: ScriptUpdate, db: Session = Depends(get_db)):
    try:
        row = script_service.update_script(db, script_id, body)
    except ValueError as e:
        if str(e) == "SCRIPT_NOT_FOUND":
            raise HTTPException(status_code=400, detail="Script does not exist") from e
        raise
    if not row:
        raise HTTPException(status_code=404, detail="Script not found")
    return row


@router.delete("/{script_id}", status_code=204)
def remove_script(script_id: int, db: Session = Depends(get_db)):
    ok = script_service.delete_script(db, script_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Script not found")
