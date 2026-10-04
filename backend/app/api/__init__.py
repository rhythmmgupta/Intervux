from app.api.auth import router as auth_router
from app.api.interviews import router as interviews_router
from app.api.questions import router as questions_router
from app.api.reports import router as reports_router
from app.api.contests import router as contests_router
from app.api.practice import router as practice_router
from app.api.hr import router as hr_router

__all__ = [
    "auth_router",
    "interviews_router",
    "questions_router",
    "reports_router",
    "contests_router",
    "practice_router",
    "hr_router",
]
