from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from app.schemas.question import QuestionOut
from app.schemas.response import ResponseOut

class InterviewCreate(BaseModel):
    type: str = "technical"      # technical, hr
    mode: str = "practice"       # practice, simulation
    difficulty: str = "medium"   # easy, medium, hard
    question_count: int = 4
    target_company: Optional[str] = None  # company slug, e.g. "microsoft"
    target_role: Optional[str] = None
    contest_id: Optional[int] = None      # set when this run is a contest attempt

class InterviewUpdate(BaseModel):
    status: Optional[str] = None
    ended_at: Optional[datetime] = None

class RecommendationOut(BaseModel):
    id: int
    interview_id: int
    category: str
    recommendation: str
    priority: str

    model_config = ConfigDict(from_attributes=True)

class InterviewOut(BaseModel):
    id: int
    user_id: int
    type: str
    mode: str
    difficulty: str
    status: str
    target_company: Optional[str] = None
    target_role: Optional[str] = None
    contest_id: Optional[int] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    overall_score: Optional[float] = None
    communication_score: Optional[float] = None
    technical_score: Optional[float] = None
    body_language_score: Optional[float] = None
    speech_score: Optional[float] = None
    answer_quality_score: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

class QuestionDetailOut(QuestionOut):
    response: Optional[ResponseOut] = None

    model_config = ConfigDict(from_attributes=True)

class InterviewDetailOut(InterviewOut):
    questions: List[QuestionDetailOut] = []
    recommendations: List[RecommendationOut] = []

    model_config = ConfigDict(from_attributes=True)
