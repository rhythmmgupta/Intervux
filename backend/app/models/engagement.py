from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.database.connection import Base


class Contest(Base):
    """
    A timed question set, e.g. "Microsoft Top 5 - Daily". Questions are only
    served to users who hold a ContestEntry, which is what makes attendance matter.
    """
    __tablename__ = "contests"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    company = Column(String(120), nullable=False, index=True)
    kind = Column(String(20), nullable=False, default="daily")  # daily, weekly
    difficulty = Column(String(20), nullable=False, default="medium")
    question_count = Column(Integer, nullable=False, default=5)
    questions_json = Column(Text, nullable=False, default="[]")
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    entries = relationship("ContestEntry", back_populates="contest", cascade="all, delete-orphan")


class ContestEntry(Base):
    """One user's attendance in one contest, plus their result once they finish."""
    __tablename__ = "contest_entries"
    __table_args__ = (UniqueConstraint("contest_id", "user_id", name="uq_contest_entry"),)

    id = Column(Integer, primary_key=True, index=True)
    contest_id = Column(Integer, ForeignKey("contests.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    interview_id = Column(Integer, nullable=True, index=True)
    score = Column(Float, nullable=True)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    contest = relationship("Contest", back_populates="entries")
    user = relationship("User")


class SpeakingAttempt(Base):
    """One English speaking-practice drill, kept so progress is visible over time."""
    __tablename__ = "speaking_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    transcript = Column(Text, nullable=False, default="")
    duration = Column(Float, nullable=False, default=0.0)
    word_count = Column(Integer, nullable=False, default=0)
    speaking_speed = Column(Float, nullable=False, default=0.0)
    filler_count = Column(Integer, nullable=False, default=0)
    fluency_score = Column(Float, nullable=False, default=0.0)
    fluency_band = Column(String(40), nullable=False, default="Developing")
    feedback_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
