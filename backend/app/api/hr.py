import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional

from app.api.auth import get_current_user
from app.database.connection import get_db
from app.models.engagement import Contest, SpeakingAttempt
from app.models.interview import Interview
from app.models.user import User
from app.services.contest_service import contest_service

router = APIRouter(prefix="/api/hr", tags=["HR Portal"])


def require_hr(current_user: User = Depends(get_current_user)) -> User:
    """Gate every route in this router on the HR role."""
    if current_user.role != "hr":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This area is restricted to HR accounts.",
        )
    return current_user


@router.get("/candidates")
def list_candidates(
    company: Optional[str] = None,
    hr_user: User = Depends(require_hr),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    Candidates with their rating and activity. Defaults to candidates targeting
    the HR account's own company, since that is the common case.
    """
    target = company or hr_user.target_company
    q = db.query(User).filter(User.role == "candidate")
    if target:
        q = q.filter(User.target_company == target)

    rows = []
    for candidate in q.order_by(User.created_at.desc()).limit(200).all():
        rating = contest_service.rating_for_user(db, candidate.id)
        last = (
            db.query(Interview)
            .filter(Interview.user_id == candidate.id)
            .order_by(Interview.started_at.desc())
            .first()
        )
        rows.append({
            "user_id": candidate.id,
            "name": candidate.name,
            "email": candidate.email,
            "target_company": candidate.target_company,
            "target_role": candidate.target_role,
            "joined": candidate.created_at,
            "rating": rating["rating"],
            "tier": rating["tier"],
            "sessions_completed": rating["sessions_completed"],
            "best_score": rating["best_score"],
            "average_score": rating["average_score"],
            "contests_entered": rating["contests_entered"],
            "last_session_at": last.started_at if last else None,
        })

    rows.sort(key=lambda r: -r["rating"])
    return rows


@router.get("/candidates/{user_id}")
def candidate_detail(
    user_id: int,
    hr_user: User = Depends(require_hr),
    db: Session = Depends(get_db),
):
    """One candidate's session history, scores and speaking-practice progress."""
    candidate = db.query(User).filter(User.id == user_id, User.role == "candidate").first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")

    interviews = (
        db.query(Interview)
        .filter(Interview.user_id == user_id)
        .order_by(Interview.started_at.desc())
        .all()
    )
    drills = (
        db.query(SpeakingAttempt)
        .filter(SpeakingAttempt.user_id == user_id)
        .order_by(SpeakingAttempt.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "candidate": {
            "user_id": candidate.id,
            "name": candidate.name,
            "email": candidate.email,
            "target_company": candidate.target_company,
            "target_role": candidate.target_role,
            "joined": candidate.created_at,
        },
        "rating": contest_service.rating_for_user(db, user_id),
        "sessions": [
            {
                "id": i.id,
                "type": i.type,
                "mode": i.mode,
                "difficulty": i.difficulty,
                "status": i.status,
                "target_company": i.target_company,
                "target_role": i.target_role,
                "contest_id": i.contest_id,
                "started_at": i.started_at,
                "overall_score": i.overall_score,
                "communication_score": i.communication_score,
                "technical_score": i.technical_score,
                "body_language_score": i.body_language_score,
                "question_count": len(i.questions),
            }
            for i in interviews
        ],
        "speaking_practice": [
            {
                "id": d.id,
                "prompt": d.prompt,
                "fluency_score": d.fluency_score,
                "fluency_band": d.fluency_band,
                "speaking_speed": d.speaking_speed,
                "created_at": d.created_at,
            }
            for d in drills
        ],
    }


@router.get("/contests")
def hr_contests(
    hr_user: User = Depends(require_hr),
    db: Session = Depends(get_db),
):
    """Every contest with its scoreboard, for HR review."""
    contest_service.ensure_contests(db)
    contests = db.query(Contest).order_by(Contest.starts_at.desc()).limit(10).all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "company": c.company,
            "kind": c.kind,
            "starts_at": c.starts_at,
            "ends_at": c.ends_at,
            "scoreboard": contest_service.contest_scoreboard(db, c.id),
        }
        for c in contests
    ]
