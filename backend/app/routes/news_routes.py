from fastapi import APIRouter, HTTPException

from app.schemas.news_schema import NewsResponse
from app.services.news_service import NewsFetchError, fetch_stock_news

router = APIRouter()


@router.get("/{symbol}", response_model=NewsResponse)
def get_stock_news(symbol: str):
    clean = symbol.strip().upper()
    if not clean or len(clean) > 50:
        raise HTTPException(status_code=400, detail="Invalid symbol")
    try:
        items = fetch_stock_news(clean)
    except NewsFetchError:
        raise HTTPException(status_code=502, detail="Could not fetch news right now")
    return NewsResponse(symbol=clean, items=items)
