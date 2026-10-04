import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.interview import Interview
from app.models.question import Question
from app.models.response import Response
from app.models.metrics import VisionMetrics, AnswerEvaluation, Recommendation
from app.services.vision_service import vision_service
from app.services.speech_service import speech_service
from app.services.llm_service import llm_service
from app.services.fusion_engine import fusion_engine

logger = logging.getLogger(__name__)

# Structured Question Bank covering Technical and HR across Easy, Medium, and Hard
QUESTION_BANK = [
    # Technical: DSA & Programming
    {"category": "DSA", "difficulty": "easy", "question": "What is the difference between an Array and a Linked List, and when would you choose one over the other?"},
    {"category": "DSA", "difficulty": "medium", "question": "How does a Hash Table resolve collisions, and what are the time complexity implications of chaining versus open addressing?"},
    {"category": "DSA", "difficulty": "hard", "question": "Explain how Dijkstra's algorithm finds the shortest path, and how its complexity changes when using a Fibonacci heap compared to a binary heap."},
    
    # Technical: Operating Systems
    {"category": "OS", "difficulty": "easy", "question": "What is the difference between a process and a thread, and how do they share memory?"},
    {"category": "OS", "difficulty": "medium", "question": "Explain virtual memory, paging, and how page faults are handled by the operating system."},
    {"category": "OS", "difficulty": "hard", "question": "What are the four necessary conditions for deadlock, and how can deadlock detection or prevention be implemented in a multi-threaded system?"},

    # Technical: DBMS
    {"category": "DBMS", "difficulty": "easy", "question": "What are the ACID properties in database management systems, and why is each property critical for transactions?"},
    {"category": "DBMS", "difficulty": "medium", "question": "Explain the difference between clustered and non-clustered indexes, and how B+ Trees optimize range queries."},
    {"category": "DBMS", "difficulty": "hard", "question": "How does two-phase locking (2PL) guarantee serializability, and what are the trade-offs between optimistic and pessimistic concurrency control?"},

    # Technical: Computer Networks
    {"category": "Networks", "difficulty": "easy", "question": "Explain what happens at the network layer when you type 'https://google.com' in your browser and press Enter."},
    {"category": "Networks", "difficulty": "medium", "question": "How does the TCP 3-way handshake work, and how does TCP provide reliable transmission compared to UDP?"},
    {"category": "Networks", "difficulty": "hard", "question": "How does TLS 1.3 handshake improve upon TLS 1.2 in latency and security, and what is Zero Round-Trip Time (0-RTT) resumption?"},

    # Technical: OOP & System Design
    {"category": "OOP", "difficulty": "easy", "question": "Explain the four core principles of Object-Oriented Programming (OOP) with real-world analogies."},
    {"category": "System Design", "difficulty": "medium", "question": "How would you design a scalable URL shortening service like TinyURL to handle 100 million requests per day?"},
    {"category": "System Design", "difficulty": "hard", "question": "How would you design a distributed rate limiter that operates consistently across multiple data centers?"},

    # HR: Behavioral, Leadership, Teamwork
    {"category": "HR - Background", "difficulty": "easy", "question": "Tell me about yourself, your background, and what drives you professionally."},
    {"category": "HR - Strengths", "difficulty": "easy", "question": "What is your greatest technical strength, and what is an area you are actively working to improve?"},
    {"category": "HR - Teamwork", "difficulty": "medium", "question": "Describe a situation where you had a strong technical disagreement with a teammate. How did you handle it and what was the outcome?"},
    {"category": "HR - Leadership", "difficulty": "medium", "question": "Can you share an example of a time when you took initiative on a project outside your core responsibilities?"},
    {"category": "HR - Failure", "difficulty": "medium", "question": "Tell me about a project or task that did not go as planned. What mistakes were made, and what did you learn from that experience?"},
    {"category": "HR - Career Goals", "difficulty": "easy", "question": "Where do you see yourself in three to five years, and how does this role align with your aspirations?"},
    {"category": "HR - High Pressure", "difficulty": "hard", "question": "Describe a high-stakes crisis or strict deadline you faced. How did you prioritize tasks and maintain clarity under pressure?"}
]

class InterviewService:
    def get_question_templates(self, interview_type: str, difficulty: str = "medium", limit: int = 4) -> List[Dict[str, Any]]:
        """Filter questions based on interview type and difficulty, with adaptive fallback."""
        if interview_type == "technical":
            pool = [q for q in QUESTION_BANK if not q["category"].startswith("HR")]
        else:
            pool = [q for q in QUESTION_BANK if q["category"].startswith("HR")]

        # Match difficulty first
        matched = [q for q in pool if q["difficulty"] == difficulty]
        if len(matched) < limit:
            # Fallback to general pool
            remainder = [q for q in pool if q not in matched]
            matched.extend(remainder)

        return matched[:limit]

    def _select_questions(
        self,
        db: Session,
        interview_type: str,
        difficulty: str,
        question_count: int,
        target_company: Optional[str] = None,
        target_role: Optional[str] = None,
        contest_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Resolve the question set for a session. Imported lazily to avoid a cycle."""
        if contest_id:
            from app.models.engagement import Contest
            contest = db.query(Contest).filter(Contest.id == contest_id).first()
            if contest:
                questions = json.loads(contest.questions_json or "[]")
                if questions:
                    return questions[:question_count]

        if target_company:
            from app.services.company_service import company_service
            questions = company_service.select_questions(
                slug=target_company,
                interview_type=interview_type,
                difficulty=difficulty,
                limit=question_count,
                role=target_role
            )
            if questions:
                return questions

        return self.get_question_templates(interview_type, difficulty, question_count)

    def create_interview(
        self,
        db: Session,
        user_id: int,
        interview_type: str,
        mode: str,
        difficulty: str,
        question_count: int = 4,
        target_company: Optional[str] = None,
        target_role: Optional[str] = None,
        contest_id: Optional[int] = None
    ) -> Interview:
        """
        Create new interview record and attach initial question sequence.

        Question source, in order of precedence:
        1. a contest's sealed question set (identical for every attendee)
        2. the target company's pool (signature questions plus its focus areas)
        3. the generic question bank
        """
        interview = Interview(
            user_id=user_id,
            type=interview_type,
            mode=mode,
            difficulty=difficulty,
            status="in_progress",
            target_company=target_company,
            target_role=target_role,
            contest_id=contest_id,
            started_at=datetime.now(timezone.utc)
        )
        db.add(interview)
        db.commit()
        db.refresh(interview)

        selected_questions = self._select_questions(
            db=db,
            interview_type=interview_type,
            difficulty=difficulty,
            question_count=question_count,
            target_company=target_company,
            target_role=target_role,
            contest_id=contest_id
        )
        for idx, q_data in enumerate(selected_questions, start=1):
            q = Question(
                interview_id=interview.id,
                question_text=q_data["question"],
                category=q_data["category"],
                difficulty=q_data["difficulty"],
                order_number=idx
            )
            db.add(q)
        db.commit()
        db.refresh(interview)
        return interview

    def process_response(
        self,
        db: Session,
        question_id: int,
        transcript: str,
        duration: float,
        speaking_speed: float,
        pause_duration: float,
        filler_count: int,
        volume_score: float,
        vision_metrics_data: Optional[Dict[str, Any]] = None
    ) -> Response:
        """
        Process candidate answer:
        1. Store speech response metrics
        2. Evaluate answer via LLM
        3. Store vision metrics
        4. Fuse signals via Multimodal Fusion Engine
        """
        question = db.query(Question).filter(Question.id == question_id).first()
        if not question:
            raise ValueError(f"Question {question_id} not found")

        # Delete existing response if re-answering
        existing = db.query(Response).filter(Response.question_id == question_id).first()
        if existing:
            db.delete(existing)
            db.commit()


        # 1. Create Response
        response = Response(
            question_id=question_id,
            transcript=transcript,
            duration=duration,
            speaking_speed=speaking_speed,
            pause_duration=pause_duration,
            filler_count=filler_count,
            volume_score=volume_score
        )
        db.add(response)
        db.commit()
        db.refresh(response)

        # 2. Vision Metrics
        vm_data = vision_metrics_data or vision_service._default_metrics()
        vision_record = VisionMetrics(
            response_id=response.id,
            eye_contact=float(vm_data.get("eye_contact", 75.0)),
            face_visibility=float(vm_data.get("face_visibility", 90.0)),
            head_orientation=str(vm_data.get("head_orientation", "Mostly centered")),
            posture_score=float(vm_data.get("posture_score", 80.0)),
            gesture_score=float(vm_data.get("gesture_score", 75.0))
        )
        db.add(vision_record)

        # 3. LLM Answer Evaluation
        eval_dict = llm_service.evaluate_answer(
            question=question.question_text,
            transcript=transcript,
            interview_type=question.interview.type
        )
        feedback_json = json.dumps({
            "strengths": eval_dict.get("strengths", []),
            "weaknesses": eval_dict.get("weaknesses", []),
            "suggestions": eval_dict.get("suggestions", []),
            "provider_used": eval_dict.get("provider_used", "Mock Mode")
        })

        answer_eval = AnswerEvaluation(
            response_id=response.id,
            relevance=float(eval_dict.get("relevance", 70.0)),
            clarity=float(eval_dict.get("clarity", 70.0)),
            technical_depth=float(eval_dict.get("technical_depth", 70.0)),
            structure=float(eval_dict.get("structure", 70.0)),
            grammar=float(eval_dict.get("grammar", 80.0)),
            confidence=float(eval_dict.get("confidence", 70.0)),
            overall_score=float(eval_dict.get("overall_answer_score", 72.0)),
            feedback=feedback_json
        )
        db.add(answer_eval)
        db.commit()
        db.refresh(response)

        return response

    def complete_interview(self, db: Session, interview_id: int) -> Interview:
        """
        Finalizes an interview:
        Calculates aggregate scores across all questions and produces
        multimodal cross-signal coaching recommendations.
        """
        interview = db.query(Interview).filter(Interview.id == interview_id).first()
        if not interview:
            raise ValueError(f"Interview {interview_id} not found")

        responses = [q.response for q in interview.questions if q.response is not None]

        if not responses:
            interview.overall_score = 0.0
            interview.status = "completed"
            interview.ended_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(interview)
            return interview

        # Aggregate metrics across questions
        avg_wpm = sum(r.speaking_speed for r in responses) / len(responses)
        avg_fillers = sum(r.filler_count for r in responses) / len(responses)
        avg_pauses = sum(r.pause_duration for r in responses) / len(responses)
        avg_volume = sum(r.volume_score for r in responses) / len(responses)

        v_list = [r.vision_metrics for r in responses if r.vision_metrics]
        avg_eye = (sum(v.eye_contact for v in v_list) / len(v_list)) if v_list else 75.0
        avg_vis = (sum(v.face_visibility for v in v_list) / len(v_list)) if v_list else 90.0
        avg_posture = (sum(v.posture_score for v in v_list) / len(v_list)) if v_list else 80.0
        avg_gesture = (sum(v.gesture_score for v in v_list) / len(v_list)) if v_list else 75.0

        eval_list = [r.answer_evaluation for r in responses if r.answer_evaluation]
        avg_relevance = (sum(e.relevance for e in eval_list) / len(eval_list)) if eval_list else 70.0
        avg_clarity = (sum(e.clarity for e in eval_list) / len(eval_list)) if eval_list else 70.0
        avg_tech = (sum(e.technical_depth for e in eval_list) / len(eval_list)) if eval_list else 70.0
        avg_struct = (sum(e.structure for e in eval_list) / len(eval_list)) if eval_list else 70.0
        avg_grammar = (sum(e.grammar for e in eval_list) / len(eval_list)) if eval_list else 80.0
        avg_ans = (sum(e.overall_score for e in eval_list) / len(eval_list)) if eval_list else 70.0

        visual_summary = {
            "eye_contact": avg_eye,
            "face_visibility": avg_vis,
            "posture_score": avg_posture,
            "gesture_score": avg_gesture,
            "head_orientation": "Mostly centered"
        }
        speech_summary = {
            "speaking_speed": avg_wpm,
            "filler_count": int(avg_fillers),
            "pause_duration": avg_pauses,
            "volume_score": avg_volume
        }
        lang_summary = {
            "relevance": avg_relevance,
            "clarity": avg_clarity,
            "technical_depth": avg_tech,
            "structure": avg_struct,
            "grammar": avg_grammar,
            "overall_answer_score": avg_ans
        }

        # Run Multimodal Fusion
        fused = fusion_engine.fuse_signals(
            visual=visual_summary,
            speech=speech_summary,
            language=lang_summary,
            interview_type=interview.type
        )

        interview.overall_score = fused["overall_score"]
        interview.communication_score = fused["communication_score"]
        interview.body_language_score = fused["body_language_score"]
        interview.speech_score = fused["speech_score"]
        interview.answer_quality_score = fused["answer_quality_score"]
        interview.technical_score = fused["technical_score"]
        interview.status = "completed"
        interview.ended_at = datetime.now(timezone.utc)

        # Clear old recommendations and populate new
        db.query(Recommendation).filter(Recommendation.interview_id == interview.id).delete()

        rec_data = fused["recommendation"]
        primary_rec = Recommendation(
            interview_id=interview.id,
            category=rec_data["category"],
            recommendation=rec_data["text"],
            priority=rec_data["priority"]
        )
        db.add(primary_rec)

        # Generate targeted domain recommendations
        if avg_eye < 65:
            db.add(Recommendation(
                interview_id=interview.id,
                category="visual",
                recommendation="Camera engagement was below 65%. Practice maintaining direct eye contact with the camera to project confidence.",
                priority="high"
            ))
        if avg_wpm > 170:
            db.add(Recommendation(
                interview_id=interview.id,
                category="speech",
                recommendation=f"Average speaking rate was {round(avg_wpm)} WPM (ideal is 130-160 WPM). Slowing down will enhance articulacy.",
                priority="medium"
            ))
        elif avg_wpm < 110:
            db.add(Recommendation(
                interview_id=interview.id,
                category="speech",
                recommendation=f"Pacing was slightly deliberate at {round(avg_wpm)} WPM. Increasing vocal energy will convey greater enthusiasm.",
                priority="medium"
            ))
        if avg_fillers >= 4:
            db.add(Recommendation(
                interview_id=interview.id,
                category="speech",
                recommendation=f"Average of {round(avg_fillers)} filler words detected per response. Use deliberate silent pauses to collect thoughts.",
                priority="medium"
            ))

        db.commit()
        db.refresh(interview)

        # If this run was a contest attempt, post the score to the attendee's entry.
        if interview.contest_id:
            from app.services.contest_service import contest_service
            contest_service.record_contest_result(db, interview)

        return interview

interview_service = InterviewService()
