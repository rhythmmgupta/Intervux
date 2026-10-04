import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.connection import engine, Base, ensure_columns
import app.models # ensure all models are registered with Base metadata
from app.api import (
    auth_router,
    interviews_router,
    questions_router,
    reports_router,
    contests_router,
    practice_router,
    hr_router,
)
from app.websocket import websocket_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("intervux")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database schema...")
    Base.metadata.create_all(bind=engine)
    ensure_columns()
    logger.info("Database schema initialized.")

    # Daily / weekly contests are generated, so a fresh deploy has them immediately.
    from app.database.connection import SessionLocal
    from app.services.contest_service import contest_service
    db = SessionLocal()
    try:
        seeded = contest_service.ensure_contests(db)
        logger.info(f"Contest seeding complete ({len(seeded)} new).")
    except Exception as exc:
        logger.warning(f"Contest seeding skipped: {exc}")
    finally:
        db.close()
    yield
    logger.info("Shutting down IntervuX application...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Multimodal AI-Powered Real-Time Interview Companion Backend",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
app.include_router(auth_router)
app.include_router(interviews_router)
app.include_router(questions_router)
app.include_router(reports_router)
app.include_router(contests_router)
app.include_router(practice_router)
app.include_router(hr_router)

# WebSocket Router
app.include_router(websocket_router)

@app.get("/")
def root():
    return {
        "app": "IntervuX - AI Interview Companion",
        "version": "1.0.0",
        "status": "online",
        "ai_status": "active"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}
