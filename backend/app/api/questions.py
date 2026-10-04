from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database.connection import get_db
from app.models.user import User
from app.models.question import Question
from app.schemas.response import ResponseCreate, ResponseOut
from app.api.auth import get_current_user
from app.services.interview_service import interview_service, QUESTION_BANK
from app.services.company_service import company_service

router = APIRouter(prefix="/api", tags=["Questions & Responses"])

@router.get("/questions/bank")
def get_question_bank(category: Optional[str] = None, difficulty: Optional[str] = None):
    """Retrieve question bank templates filtered by category or difficulty."""
    filtered = QUESTION_BANK
    if category:
        filtered = [q for q in filtered if category.lower() in q["category"].lower()]
    if difficulty:
        filtered = [q for q in filtered if q["difficulty"].lower() == difficulty.lower()]
    return filtered

@router.get("/companies")
def list_companies(tier: Optional[str] = None):
    """Target companies a candidate can aim at, with the roles each hires for."""
    return company_service.list_companies(tier=tier)


@router.get("/companies/{slug}")
def get_company(slug: str, interview_type: str = "technical", difficulty: str = "medium", limit: int = 5):
    """One company's profile plus a sample round for the given track and difficulty."""
    company = company_service.get_company(slug)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    return {
        "slug": company["slug"],
        "name": company["name"],
        "tier": company["tier"],
        "roles": company["roles"],
        "focus": company["focus"],
        "sample_questions": company_service.select_questions(
            slug=slug, interview_type=interview_type, difficulty=difficulty, limit=limit
        ),
    }


@router.post("/responses", response_model=ResponseOut, status_code=status.HTTP_201_CREATED)
def submit_response(
    resp_in: ResponseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submits a candidate's spoken response:
    - Calculates speech metrics & filler words
    - Executes LLM answer evaluation
    - Records vision metrics
    - Fuses multimodal signals
    """
    question = db.query(Question).filter(Question.id == resp_in.question_id).first()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found."
        )

    # Verify ownership
    if question.interview.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to answer this interview question."
        )

    vm_dict = resp_in.vision.model_dump() if resp_in.vision else None

    response = interview_service.process_response(
        db=db,
        question_id=resp_in.question_id,
        transcript=resp_in.transcript,
        duration=resp_in.duration,
        speaking_speed=resp_in.speaking_speed,
        pause_duration=resp_in.pause_duration,
        filler_count=resp_in.filler_count,
        volume_score=resp_in.volume_score,
        vision_metrics_data=vm_dict
    )

    return response
