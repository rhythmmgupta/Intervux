from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.schemas.interview import InterviewOut, QuestionDetailOut, RecommendationOut

class ScoreCard(BaseModel):
    title: str
    score: float
    max_score: float = 100.0
    status: str # "Excellent", "Good", "Needs Improvement"
    description: str

class TimelinePoint(BaseModel):
    question_number: int
    question_category: str
    overall_score: float
    eye_contact: float
    speaking_speed: float
    filler_count: int
    fluency_score: float = 0.0

class InterviewReport(BaseModel):
    interview: InterviewOut
    score_cards: List[ScoreCard]
    timeline: List[TimelinePoint]
    radar_scores: List[Dict[str, Any]]
    recommendations: List[RecommendationOut]
    questions: List[QuestionDetailOut]
    # Fluency is derived from the stored transcripts rather than persisted, so it
    # always reflects the current scoring rules.
    fluency: Dict[str, Any] = {}
    ai_mode_badge: str # "Live AI (OpenAI/Whisper/MediaPipe)" or "Mock/Development Mode"
