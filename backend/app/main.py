import os
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routes import calendar_routes, dashboard_routes, execute_routes, market_routes, news_routes, script_routes
from app.services.auto_trade_service import run_tick

AUTO_TRADE_INTERVAL_SECONDS = int(os.getenv("AUTO_TRADE_INTERVAL_SECONDS", "5"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(
        run_tick,
        "interval",
        seconds=AUTO_TRADE_INTERVAL_SECONDS,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Temptation Dashboard API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(script_routes.router, prefix="/scripts", tags=["scripts"])
app.include_router(market_routes.router, prefix="/market", tags=["market"])
app.include_router(dashboard_routes.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(execute_routes.router, prefix="/execute", tags=["execute"])
app.include_router(news_routes.router, prefix="/news", tags=["news"])
app.include_router(calendar_routes.router, prefix="/calendar", tags=["calendar"])


@app.get("/health")
def health():
    return {"status": "ok"}
