from fastapi import APIRouter

from app.schemas.script_schema import NiftyQuoteResponse, SensexQuoteResponse
from app.services.market_service import fetch_nifty_50_quote, fetch_sensex_quote

router = APIRouter()


@router.get("/nifty", response_model=NiftyQuoteResponse)
def nifty_quote():
    value, change = fetch_nifty_50_quote()
    return NiftyQuoteResponse(value=value, change_percent=change)


@router.get("/sensex", response_model=SensexQuoteResponse)
def sensex_quote():
    value, change = fetch_sensex_quote()
    return SensexQuoteResponse(value=value, change_percent=change)
