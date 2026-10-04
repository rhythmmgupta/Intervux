import json
import logging
import asyncio
from typing import Dict, Any, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.models.interview import Interview
from app.models.question import Question
from app.services.vision_service import vision_service
from app.services.speech_service import speech_service
from app.services.fusion_engine import fusion_engine
from app.services.interview_service import interview_service
from app.services.proctor_service import proctor_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

class ConnectionManager:
    """Manages active interview WebSocket sessions."""
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, interview_id: int, websocket: WebSocket):
        await websocket.accept()
        if interview_id not in self.active_connections:
            self.active_connections[interview_id] = []
        self.active_connections[interview_id].append(websocket)
        logger.info(f"WebSocket connected for interview {interview_id}")

    def disconnect(self, interview_id: int, websocket: WebSocket):
        if interview_id in self.active_connections:
            if websocket in self.active_connections[interview_id]:
                self.active_connections[interview_id].remove(websocket)
            if not self.active_connections[interview_id]:
                del self.active_connections[interview_id]
        logger.info(f"WebSocket disconnected for interview {interview_id}")

    async def send_json(self, websocket: WebSocket, data: Dict[str, Any]):
        try:
            await websocket.send_text(json.dumps(data))
        except Exception as e:
            logger.warning(f"Failed to send WebSocket message: {e}")

manager = ConnectionManager()

@router.websocket("/ws/interview/{interview_id}")
async def interview_websocket_endpoint(websocket: WebSocket, interview_id: int):
    await manager.connect(interview_id, websocket)

    # State tracking per active interview connection
    current_question_index = 0
    cached_vision_metrics = vision_service._default_metrics()
    accumulated_audio_volume: List[float] = []
    proctor_service.reset_session(interview_id)

    db: Session = SessionLocal()

    try:
        # Load interview
        interview = db.query(Interview).filter(Interview.id == interview_id).first()
        if not interview:
            await manager.send_json(websocket, {
                "event": "error",
                "message": f"Interview {interview_id} does not exist"
            })
            await websocket.close()
            return

        # Notify interview connected and started
        await manager.send_json(websocket, {
            "event": "interview_started",
            "interview_id": interview.id,
            "mode": interview.mode,
            "type": interview.type,
            "difficulty": interview.difficulty,
            "total_questions": len(interview.questions),
            "current_question_index": 0
        })

        # Send first question if available
        if interview.questions:
            q = interview.questions[0]
            await manager.send_json(websocket, {
                "event": "question_started",
                "question": {
                    "id": q.id,
                    "order_number": q.order_number,
                    "question_text": q.question_text,
                    "category": q.category,
                    "difficulty": q.difficulty
                }
            })

        while True:
            text_data = await websocket.receive_text()
            try:
                payload = json.loads(text_data)
            except Exception:
                continue

            event_type = payload.get("event")

            # 1. Video Frame or Metric Chunk
            if event_type == "video_frame":
                # Sampled frame received from client webcam preview
                frame_b64 = payload.get("frame")
                # Frames arrive continuously so the live readout keeps moving, but
                # only those captured during an answer count toward its aggregate.
                is_answering = bool(payload.get("is_answering", True))
                if frame_b64:
                    frame = vision_service.decode_frame(frame_b64)
                    if frame is not None:
                        cached_vision_metrics = vision_service.analyze_frame(frame, record=is_answering)
                    
                # Broadcast live vision update
                await manager.send_json(websocket, {
                    "event": "video_metrics",
                    "metrics": cached_vision_metrics
                })

                # Live integrity state (vision flags + browser events so far)
                await manager.send_json(websocket, {
                    "event": "integrity_update",
                    "integrity": proctor_service.summarize(
                        interview_id, vision_service.get_aggregate_metrics()
                    )
                })

                # In practice mode, check for real-time coaching tips
                if interview.mode == "practice":
                    tip = fusion_engine.generate_live_coaching_tip(
                        visual=cached_vision_metrics,
                        speech={"speaking_speed": payload.get("speaking_speed", 140), "filler_count": 0}
                    )
                    if tip:
                        await manager.send_json(websocket, {
                            "event": "feedback",
                            "tip": tip
                        })

            elif event_type == "video_metrics":
                # Pre-extracted client-side metrics
                client_metrics = payload.get("metrics", {})
                cached_vision_metrics.update(client_metrics)
                if interview.mode == "practice":
                    tip = fusion_engine.generate_live_coaching_tip(
                        visual=cached_vision_metrics,
                        speech={"speaking_speed": payload.get("speaking_speed", 140), "filler_count": payload.get("filler_count", 0)}
                    )
                    if tip:
                        await manager.send_json(websocket, {
                            "event": "feedback",
                            "tip": tip
                        })

            # 2. Audio Volume / Speech Interim Updates
            elif event_type == "audio_chunk":
                vol = payload.get("volume", 0.0)
                accumulated_audio_volume.append(vol)
                wpm = payload.get("wpm", 0.0)
                transcript_interim = payload.get("transcript", "")
                
                # Check filler words in interim transcript
                filler_count, filler_words = speech_service.count_filler_words(transcript_interim)

                await manager.send_json(websocket, {
                    "event": "speech_update",
                    "wpm": wpm,
                    "filler_count": filler_count,
                    "volume": vol
                })

                if interview.mode == "practice" and filler_count >= 3:
                    tip = fusion_engine.generate_live_coaching_tip(
                        visual=cached_vision_metrics,
                        speech={"speaking_speed": wpm, "filler_count": filler_count}
                    )
                    if tip:
                        await manager.send_json(websocket, {
                            "event": "feedback",
                            "tip": tip
                        })

            # 3. Browser Environment Integrity Event
            elif event_type == "integrity_event":
                proctor_service.record_event(
                    interview_id,
                    payload.get("type", ""),
                    payload.get("detail", {})
                )
                summary = proctor_service.summarize(interview_id, vision_service.get_aggregate_metrics())
                await manager.send_json(websocket, {
                    "event": "integrity_update",
                    "integrity": summary
                })
                if interview.mode == "practice" and summary["status"] != "clean":
                    await manager.send_json(websocket, {
                        "event": "feedback",
                        "tip": "Keep the interview tab focused and your eyes on the camera — session integrity is being tracked."
                    })

            # 4. Question Completed (Answer Submitted)
            elif event_type == "question_completed":
                question_id = payload.get("question_id")
                transcript = payload.get("transcript", "").strip()
                duration = float(payload.get("duration", 0.0))
                
                # Analyze speech signals
                speech_res = speech_service.analyze_speech(
                    transcript=transcript,
                    duration_seconds=duration,
                    audio_volume_samples=accumulated_audio_volume
                )
                accumulated_audio_volume = []

                fluency = speech_service.score_fluency(
                    transcript=speech_res["transcript"],
                    duration_seconds=speech_res["duration"],
                    filler_count=speech_res["filler_count"]
                )

                # Aggregate vision metrics and the integrity summary for this answer
                agg_vision = vision_service.get_aggregate_metrics()
                integrity = proctor_service.summarize(interview_id, agg_vision)
                vision_service.reset_session()

                # Process answer with LLM and save response
                response_record = interview_service.process_response(
                    db=db,
                    question_id=question_id,
                    transcript=speech_res["transcript"],
                    duration=speech_res["duration"],
                    speaking_speed=speech_res["speaking_speed"],
                    pause_duration=speech_res["pause_duration"],
                    filler_count=speech_res["filler_count"],
                    volume_score=speech_res["volume_score"],
                    vision_metrics_data=agg_vision
                )

                # Return question feedback
                eval_data = json.loads(response_record.answer_evaluation.feedback) if response_record.answer_evaluation else {}
                await manager.send_json(websocket, {
                    "event": "question_feedback",
                    "question_id": question_id,
                    "overall_score": response_record.answer_evaluation.overall_score if response_record.answer_evaluation else 70,
                    "strengths": eval_data.get("strengths", []),
                    "weaknesses": eval_data.get("weaknesses", []),
                    "suggestions": eval_data.get("suggestions", []),
                    "speech_metrics": {
                        "speaking_speed": response_record.speaking_speed,
                        "filler_count": response_record.filler_count,
                        "pause_duration": response_record.pause_duration
                    },
                    "vision_metrics": agg_vision,
                    "integrity": integrity,
                    "fluency": fluency
                })

                # Advance to next question or complete
                current_question_index += 1
                if current_question_index < len(interview.questions):
                    next_q = interview.questions[current_question_index]
                    await manager.send_json(websocket, {
                        "event": "question_started",
                        "question": {
                            "id": next_q.id,
                            "order_number": next_q.order_number,
                            "question_text": next_q.question_text,
                            "category": next_q.category,
                            "difficulty": next_q.difficulty
                        }
                    })
                else:
                    # Finalize interview
                    completed_interview = interview_service.complete_interview(db=db, interview_id=interview_id)
                    await manager.send_json(websocket, {
                        "event": "interview_completed",
                        "interview_id": interview.id,
                        "overall_score": completed_interview.overall_score,
                        "communication_score": completed_interview.communication_score,
                        "technical_score": completed_interview.technical_score,
                        "body_language_score": completed_interview.body_language_score,
                        "integrity": proctor_service.summarize(interview_id)
                    })

            # 5. Explicit Interview Completion Request
            elif event_type == "complete_interview":
                completed_interview = interview_service.complete_interview(db=db, interview_id=interview_id)
                await manager.send_json(websocket, {
                    "event": "interview_completed",
                    "interview_id": interview.id,
                    "overall_score": completed_interview.overall_score,
                    "communication_score": completed_interview.communication_score,
                    "technical_score": completed_interview.technical_score,
                    "body_language_score": completed_interview.body_language_score
                })

    except WebSocketDisconnect:
        manager.disconnect(interview_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error in interview {interview_id}: {e}")
        manager.disconnect(interview_id, websocket)
    finally:
        db.close()
