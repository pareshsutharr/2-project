from pydantic import BaseModel


class CalendarEvent(BaseModel):
    title: str
    source: str
    url: str
    publishedAt: str | None
    eventDate: str | None


class ScriptCalendarRow(BaseModel):
    script_id: int
    symbol: str
    meetings: list[CalendarEvent]
    corporate_actions: list[CalendarEvent]
    results: list[CalendarEvent]
    regulatory: list[CalendarEvent]


class CalendarResponse(BaseModel):
    rows: list[ScriptCalendarRow]
