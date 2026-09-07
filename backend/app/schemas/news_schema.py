from pydantic import BaseModel


class NewsItem(BaseModel):
    title: str
    source: str
    publishedAt: str | None
    url: str
    snippet: str
    isHighRisk: bool


class NewsResponse(BaseModel):
    symbol: str
    items: list[NewsItem]
