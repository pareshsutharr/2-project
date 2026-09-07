from fastapi import APIRouter

from app.schemas.script_schema import NiftyQuoteResponse
from app.services.market_service import fetch_nifty_50_quote

router = APIRouter()


@router.get("/nifty", response_model=NiftyQuoteResponse)
def nifty_quote():
    value, change = fetch_nifty_50_quote()
    return NiftyQuoteResponse(value=value, change_percent=change)
