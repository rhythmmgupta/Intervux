

# ---------------------------------------------------------------------------
# Proctoring: gaze measurement, second person, and integrity scoring
# ---------------------------------------------------------------------------

def _synthetic_face(pupil_dx: int = 0, pupil_dy: int = 0, second_face: bool = False):
    """640x480 frame with a skin-toned oval face and two dark pupils."""
    import cv2
    import numpy as np
    frame = np.full((480, 640, 3), 50, np.uint8)
    cv2.ellipse(frame, (320, 190), (90, 120), 0, 0, 360, (150, 170, 200), -1)
    cv2.circle(frame, (290 + pupil_dx, 170 + pupil_dy), 11, (15, 15, 15), -1)
    cv2.circle(frame, (350 + pupil_dx, 170 + pupil_dy), 11, (15, 15, 15), -1)
    if second_face:
        cv2.ellipse(frame, (90, 190), (60, 85), 0, 0, 360, (150, 170, 200), -1)
    return frame


def test_gaze_tracks_pupil_movement():
    from app.services.vision_service import VisionService
    vs = VisionService()

    centered = vs.analyze_frame(_synthetic_face())
    vs.reset_session()
    right = vs.analyze_frame(_synthetic_face(pupil_dx=20))
    vs.reset_session()
    left = vs.analyze_frame(_synthetic_face(pupil_dx=-20))
    vs.reset_session()
    down = vs.analyze_frame(_synthetic_face(pupil_dy=20))

    assert centered["face_detected"] and right["face_detected"]
    assert centered["gaze_direction"] == "On camera"

    # Pupils must move the measured offset the same way, and cost eye contact.
    assert right["gaze_offset_x"] > centered["gaze_offset_x"] + 0.15
    assert left["gaze_offset_x"] < centered["gaze_offset_x"] - 0.15
    assert right["gaze_direction"] == "Eyes right of lens"
    assert left["gaze_direction"] == "Eyes left of lens"
    assert down["gaze_direction"] == "Eyes down (reading something)"
    for away in (right, left, down):
        assert away["eye_contact"] < centered["eye_contact"]


def test_second_person_and_background_motion_detected():
    from app.services.vision_service import VisionService
    vs = VisionService()

    vs.analyze_frame(_synthetic_face())
    two = vs.analyze_frame(_synthetic_face(second_face=True))
    assert two["person_count"] == 2
    assert vs.get_aggregate_metrics()["max_person_count"] == 2
    # The extra face is outside the tracked head box, so it reads as background motion.
    assert two["background_motion"] > 0.0


def test_integrity_score_penalizes_and_saturates():
    from app.services.proctor_service import ProctorService
    ps = ProctorService()

    assert ps.summarize(7)["integrity_score"] == 100.0

    ps.record_event(7, "tab_hidden", {"seconds": 5.0})
    one_tab_out = ps.summarize(7)
    assert one_tab_out["integrity_score"] == 84.0
    assert one_tab_out["status"] == "review"
    assert one_tab_out["hidden_seconds"] == 5.0

    for _ in range(20):
        ps.record_event(7, "tab_hidden", {"seconds": 5.0})
    # Repeats cost more but stay capped at the rule's ceiling.
    saturated = ps.summarize(7)
    assert saturated["integrity_score"] == 52.0
    assert saturated["hidden_seconds"] == 105.0

    # Unknown event types are ignored rather than scored.
    ps.record_event(7, "not_a_real_event")
    assert ps.summarize(7)["integrity_score"] == 52.0


def test_integrity_flags_gaze_and_second_person_from_vision():
    from app.services.proctor_service import ProctorService
    ps = ProctorService()

    summary = ps.summarize(9, {
        "looking_away_ratio": 80.0,
        "max_person_count": 2,
        "avg_background_motion": 6.0,
    })
    flagged = {f["type"] for f in summary["flags"]}
    assert flagged == {"gaze_off_screen", "second_person", "background_activity"}
    assert summary["status"] == "flagged"
    # A clean session with the same vision keys present but quiet stays clean.
    assert ps.summarize(10, {"looking_away_ratio": 5.0, "max_person_count": 1})["status"] == "clean"


def test_websocket_reports_integrity(client, monkeypatch):
    """The browser->socket->proctor path, end to end over a real WebSocket."""
    import base64
    import cv2
    from tests.conftest import TestingSessionLocal
    import app.websocket.interview_socket as ws_module

    # The socket opens its own session rather than going through get_db.
    monkeypatch.setattr(ws_module, "SessionLocal", TestingSessionLocal)

    token = client.post("/api/auth/register", json={
        "name": "Proctor Probe", "email": "probe@intervux.ai", "password": "Password123"
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    interview = client.post("/api/interviews", json={
        "type": "technical", "mode": "simulation", "difficulty": "easy", "question_count": 1
    }, headers=headers).json()

    ok, buf = cv2.imencode(".jpg", _synthetic_face(pupil_dx=24, second_face=True))
    assert ok
    frame = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()

    with client.websocket_connect(f"/ws/interview/{interview['id']}") as socket:
        assert socket.receive_json()["event"] == "interview_started"
        assert socket.receive_json()["event"] == "question_started"

        socket.send_json({"event": "video_frame", "frame": frame})
        metrics = socket.receive_json()
        assert metrics["event"] == "video_metrics"
        assert metrics["metrics"]["person_count"] == 2

        vision_integrity = socket.receive_json()
        assert vision_integrity["event"] == "integrity_update"
        assert vision_integrity["integrity"]["integrity_score"] < 100.0

        socket.send_json({"event": "integrity_event", "type": "tab_hidden", "detail": {"seconds": 9.0}})
        after_tab_out = socket.receive_json()
        assert after_tab_out["event"] == "integrity_update"
        assert after_tab_out["integrity"]["hidden_seconds"] == 9.0
        assert any(f["type"] == "tab_hidden" for f in after_tab_out["integrity"]["flags"])
        assert after_tab_out["integrity"]["integrity_score"] < vision_integrity["integrity"]["integrity_score"]


def test_idle_frames_do_not_pollute_the_answer_aggregate(client, monkeypatch):
    """
    The client samples frames continuously so the live readout keeps moving between
    questions. Only frames flagged as part of an answer may reach that answer's
    aggregate, or idle time would quietly drag the score around.
    """
    import base64
    import cv2
    from tests.conftest import TestingSessionLocal
    import app.websocket.interview_socket as ws_module
    from app.services.vision_service import vision_service

    monkeypatch.setattr(ws_module, "SessionLocal", TestingSessionLocal)

    token = client.post("/api/auth/register", json={
        "name": "Idle Frames", "email": "idle@intervux.ai", "password": "Password123"
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    interview = client.post("/api/interviews", json={
        "type": "technical", "mode": "simulation", "difficulty": "easy", "question_count": 1
    }, headers=headers).json()

    ok, buf = cv2.imencode(".jpg", _synthetic_face())
    assert ok
    frame = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()

    vision_service.reset_session()

    with client.websocket_connect(f"/ws/interview/{interview['id']}") as socket:
        socket.receive_json()  # interview_started
        socket.receive_json()  # question_started

        # Three frames while nobody is answering.
        for _ in range(3):
            socket.send_json({"event": "video_frame", "frame": frame, "is_answering": False})
            live = socket.receive_json()
            socket.receive_json()  # integrity_update
            # The reading is still produced, so the meters keep moving.
            assert live["event"] == "video_metrics"
            assert live["metrics"]["eye_contact"] > 0

        assert vision_service.get_aggregate_metrics()["frame_count"] == 0

        # Two frames during the answer.
        for _ in range(2):
            socket.send_json({"event": "video_frame", "frame": frame, "is_answering": True})
            socket.receive_json()
            socket.receive_json()

        assert vision_service.get_aggregate_metrics()["frame_count"] == 2
