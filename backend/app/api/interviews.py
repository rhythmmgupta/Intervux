from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database.connection import get_db
from app.models.user import User
from app.models.interview import Interview
from app.schemas.interview import (
    InterviewCreate,
    InterviewOut,
    InterviewDetailOut
)
from app.api.auth import get_current_user
from app.services.interview_service import interview_service

router = APIRouter(prefix="/api/interviews", tags=["Interviews"])

@router.get("", response_model=List[InterviewOut])
def get_interviews(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve all mock interviews for the authenticated user, ordered newest first."""
    interviews = (
        db.query(Interview)
        .filter(Interview.user_id == current_user.id)
        .order_by(Interview.started_at.desc())
        .all()
    )
    return interviews

@router.post("", response_model=InterviewDetailOut, status_code=status.HTTP_201_CREATED)
def create_interview(
    interview_in: InterviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new mock interview session and generate sequential questions.

    A `contest_id` requires an entry in that contest: attendance is what unlocks
    the sealed question set.
    """
    if interview_in.contest_id:
        from app.services.contest_service import contest_service
        if not contest_service.get_entry(db, interview_in.contest_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Join this contest before starting its question set."
            )

    interview = interview_service.create_interview(
        db=db,
        user_id=current_user.id,
        interview_type=interview_in.type,
        mode=interview_in.mode,
        difficulty=interview_in.difficulty,
        question_count=interview_in.question_count,
        target_company=interview_in.target_company,
        target_role=interview_in.target_role,
        contest_id=interview_in.contest_id
    )
    return interview

@router.get("/{interview_id}", response_model=InterviewDetailOut)
def get_interview(
    interview_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve details, questions, and responses for a specific interview."""
    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_id, Interview.user_id == current_user.id)
        .first()
    )
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found."
        )
    return interview

@router.post("/{interview_id}/complete", response_model=InterviewDetailOut)
def complete_interview(
    interview_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Finalize interview and trigger multimodal fusion engine evaluation."""
    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_id, Interview.user_id == current_user.id)
        .first()
    )
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found."
        )

    completed = interview_service.complete_interview(db=db, interview_id=interview_id)
    return completed

@router.delete("/{interview_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interview(
    interview_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an interview and its associated responses and metrics."""
    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_id, Interview.user_id == current_user.id)
        .first()
    )
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found."
        )

    db.delete(interview)
    db.commit()
    return None
