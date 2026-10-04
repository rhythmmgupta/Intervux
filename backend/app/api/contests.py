from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional

from app.api.auth import get_current_user
from app.database.connection import get_db
from app.models.engagement import Contest
from app.models.user import User
from app.services.contest_service import contest_service

router = APIRouter(prefix="/api", tags=["Contests & Standings"])


@router.get("/contests")
def list_contests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Daily and weekly contests. Question sets are included only for contests the user joined."""
    contest_service.ensure_contests(db)
    return contest_service.list_contests(db, user_id=current_user.id)


@router.post("/contests/{contest_id}/join")
def join_contest(
    contest_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Attend a contest, which unlocks its questions for this user."""
    try:
        entry = contest_service.join_contest(db, contest_id, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    contest = db.query(Contest).filter(Contest.id == contest_id).first()
    return {
        "entry_id": entry.id,
        "contest_id": contest_id,
        "joined_at": entry.joined_at,
        "contest": {"title": contest.title, "company": contest.company, "kind": contest.kind},
    }


@router.get("/contests/{contest_id}/scoreboard")
def contest_scoreboard(
    contest_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Standings for one contest. Visible to every attendee, and to HR accounts."""
    contest = db.query(Contest).filter(Contest.id == contest_id).first()
    if not contest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found.")

    if current_user.role != "hr" and not contest_service.get_entry(db, contest_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Join this contest to see its scoreboard.",
        )

    return {
        "contest": {"id": contest.id, "title": contest.title, "company": contest.company, "kind": contest.kind},
        "scoreboard": contest_service.contest_scoreboard(db, contest_id),
    }


@router.get("/leaderboard")
def leaderboard(
    limit: int = 50,
    company: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Global candidate standings, optionally narrowed to one target company."""
    return {
        "me": contest_service.rating_for_user(db, current_user.id),
        "standings": contest_service.leaderboard(db, limit=limit, company=company),
    }


@router.get("/rating")
def my_rating(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The authenticated candidate's rating and tier."""
    return contest_service.rating_for_user(db, current_user.id)
