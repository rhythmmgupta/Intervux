import json
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from app.api.auth import get_current_user
from app.database.connection import get_db
from app.models.engagement import SpeakingAttempt
from app.models.user import User
from app.services.speech_service import speech_service

router = APIRouter(prefix="/api/practice", tags=["English Speaking Practice"])

# Drills grouped by what they stress. Short prompts on purpose: the candidate
# should spend the session speaking, not reading.
SPEAKING_PROMPTS: List[Dict[str, Any]] = [
    {"id": "intro-60", "level": "starter", "focus": "Self introduction", "seconds": 60,
     "prompt": "Introduce yourself in 60 seconds: who you are, what you build, and what you want next.",
     "hint": "Name, current work, one concrete achievement with a number, then what you are looking for."},
    {"id": "describe-day", "level": "starter", "focus": "Everyday fluency", "seconds": 60,
     "prompt": "Describe a normal working day from waking up to going to sleep.",
     "hint": "Use time connectives: first, after that, by midday, towards the evening."},
    {"id": "explain-tech", "level": "intermediate", "focus": "Explaining clearly", "seconds": 90,
     "prompt": "Explain a technical concept you know well to someone with no technical background.",
     "hint": "Open with an analogy, then the mechanism, then why it matters. Avoid jargon entirely."},
    {"id": "opinion-remote", "level": "intermediate", "focus": "Opinion and reasoning", "seconds": 90,
     "prompt": "Should companies allow fully remote work? Argue one side and address the strongest objection.",
     "hint": "State the position, give two reasons, concede one real cost, then close."},
    {"id": "story-conflict", "level": "intermediate", "focus": "Storytelling (STAR)", "seconds": 120,
     "prompt": "Tell the story of a disagreement you had at work and how it ended.",
     "hint": "Situation, Task, Action, Result. Spend most of the time on Action."},
    {"id": "picture-walk", "level": "advanced", "focus": "Spontaneous description", "seconds": 90,
     "prompt": "Describe the room you are sitting in, in enough detail that a stranger could draw it.",
     "hint": "Move in one direction around the room so you never stall searching for what comes next."},
    {"id": "abstract-success", "level": "advanced", "focus": "Abstract reasoning", "seconds": 120,
     "prompt": "What does 'success' mean to you, and has that definition changed in the last five years?",
     "hint": "Abstract prompts reward concrete examples. Anchor each claim to something that happened."},
    {"id": "pressure-pitch", "level": "advanced", "focus": "Speaking under pressure", "seconds": 45,
     "prompt": "You have 45 seconds to convince a hiring manager to interview you. Go.",
     "hint": "One sentence on who you are, one on proof, one on the ask. Nothing else fits."},
]


class SpeakingAttemptIn(BaseModel):
    prompt_id: Optional[str] = None
    prompt: str = ""
    transcript: str
    duration: float = 0.0
    filler_count: Optional[int] = None


@router.get("/prompts")
def list_prompts(level: Optional[str] = None):
    """Speaking drills, optionally filtered by level."""
    if level:
        return [p for p in SPEAKING_PROMPTS if p["level"] == level.lower()]
    return SPEAKING_PROMPTS


@router.post("/attempts", status_code=status.HTTP_201_CREATED)
def submit_attempt(
    attempt_in: SpeakingAttemptIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Score one speaking drill and store it so progress is visible over time."""
    prompt_text = attempt_in.prompt
    if attempt_in.prompt_id and not prompt_text:
        match = next((p for p in SPEAKING_PROMPTS if p["id"] == attempt_in.prompt_id), None)
        prompt_text = match["prompt"] if match else ""

    fluency = speech_service.score_fluency(
        transcript=attempt_in.transcript,
        duration_seconds=attempt_in.duration,
        filler_count=attempt_in.filler_count,
    )

    attempt = SpeakingAttempt(
        user_id=current_user.id,
        prompt=prompt_text or "Free speaking practice",
        transcript=attempt_in.transcript.strip(),
        duration=float(attempt_in.duration or 0.0),
        word_count=fluency["word_count"],
        speaking_speed=fluency["speaking_speed"],
        filler_count=fluency.get("filler_count", 0),
        fluency_score=fluency["fluency_score"],
        fluency_band=fluency["band"],
        feedback_json=json.dumps({
            "components": fluency["components"],
            "strengths": fluency["strengths"],
            "tips": fluency["tips"],
        }),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return {"attempt_id": attempt.id, "created_at": attempt.created_at, **fluency}


@router.get("/attempts")
def my_attempts(
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Practice history plus a simple trend, newest first."""
    rows = (
        db.query(SpeakingAttempt)
        .filter(SpeakingAttempt.user_id == current_user.id)
        .order_by(SpeakingAttempt.created_at.desc())
        .limit(limit)
        .all()
    )
    attempts = [
        {
            "id": a.id,
            "prompt": a.prompt,
            "transcript": a.transcript,
            "duration": a.duration,
            "word_count": a.word_count,
            "speaking_speed": a.speaking_speed,
            "filler_count": a.filler_count,
            "fluency_score": a.fluency_score,
            "fluency_band": a.fluency_band,
            "feedback": json.loads(a.feedback_json or "{}"),
            "created_at": a.created_at,
        }
        for a in rows
    ]

    scores = [a["fluency_score"] for a in attempts]
    summary = {
        "attempts": len(attempts),
        "latest_score": scores[0] if scores else None,
        "best_score": max(scores) if scores else None,
        "average_score": round(sum(scores) / len(scores), 1) if scores else None,
        # Oldest-to-newest movement across the window.
        "trend": round(scores[0] - scores[-1], 1) if len(scores) > 1 else 0.0,
    }
    return {"summary": summary, "attempts": attempts}
