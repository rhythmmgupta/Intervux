from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database.connection import Base

class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)  # technical, hr
    mode = Column(String(50), nullable=False)  # practice, simulation
    difficulty = Column(String(50), nullable=False, default="medium")  # easy, medium, hard
    status = Column(String(50), nullable=False, default="in_progress") # in_progress, completed
    target_company = Column(String(120), nullable=True, index=True)
    target_role = Column(String(120), nullable=True)
    # Plain integer rather than a ForeignKey: SQLite cannot add FK constraints via
    # ALTER TABLE, and this column arrived after the table existed.
    contest_id = Column(Integer, nullable=True, index=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime, nullable=True)
    
    # Aggregated scores
    overall_score = Column(Float, nullable=True)
    communication_score = Column(Float, nullable=True)
    technical_score = Column(Float, nullable=True)
    body_language_score = Column(Float, nullable=True)
    speech_score = Column(Float, nullable=True)
    answer_quality_score = Column(Float, nullable=True)

    user = relationship("User", back_populates="interviews")
    questions = relationship("Question", back_populates="interview", cascade="all, delete-orphan", order_by="Question.order_number")
    recommendations = relationship("Recommendation", back_populates="interview", cascade="all, delete-orphan")
