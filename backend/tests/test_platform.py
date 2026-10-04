"""Company targeting, fluency scoring, ratings, contests, HR access and practice."""
import pytest


def _account(client, email, role="candidate", company=None, target_role=None):
    res = client.post("/api/auth/register", json={
        "name": f"{role.title()} {email.split('@')[0]}",
        "email": email,
        "password": "Password123",
        "role": role,
        "target_company": company,
        "target_role": target_role,
    })
    assert res.status_code == 201, res.text
    body = res.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]


def _finish_interview(client, headers, interview, transcript, duration=30.0):
    """Answer every question in a session, then complete it."""
    for question in interview["questions"]:
        res = client.post("/api/responses", json={
            "question_id": question["id"],
            "transcript": transcript,
            "duration": duration,
            "speaking_speed": 145.0,
            "pause_duration": 1.2,
            "filler_count": 1,
            "volume_score": 78.0,
        }, headers=headers)
        assert res.status_code == 201, res.text
    done = client.post(f"/api/interviews/{interview['id']}/complete", headers=headers)
    assert done.status_code == 200, done.text
    return done.json()


STRONG_ANSWER = (
    "I led the migration of our payment service from a monolith into three services. "
    "The hard constraint was zero downtime, so we ran both paths in parallel and diffed "
    "the outputs for two weeks. Once mismatches fell below one in a million we cut over, "
    "and p99 latency dropped from eight hundred milliseconds to two hundred and ten."
)


# --------------------------------------------------------------- company targeting
def test_company_catalog_and_targeted_questions(client):
    companies = client.get("/api/companies").json()
    assert len(companies) >= 10
    slugs = {c["slug"] for c in companies}
    assert {"microsoft", "google", "amazon", "tcs", "infosys"} <= slugs

    for company in companies:
        assert company["roles"] and company["question_pool"] > 0

    detail = client.get("/api/companies/microsoft?difficulty=medium&limit=5").json()
    assert detail["name"] == "Microsoft"
    assert len(detail["sample_questions"]) == 5
    assert all(q["company"] == "Microsoft" for q in detail["sample_questions"])

    assert client.get("/api/companies/not-a-real-company").status_code == 404

    indian_it = client.get("/api/companies?tier=Indian IT").json()
    assert {c["slug"] for c in indian_it} == {"tcs", "infosys", "wipro"}


def test_interview_uses_company_question_pool(client):
    headers, _ = _account(client, "target@intervux.ai", company="Microsoft", target_role="Software Engineer")

    res = client.post("/api/interviews", json={
        "type": "technical", "mode": "practice", "difficulty": "medium", "question_count": 4,
        "target_company": "microsoft", "target_role": "Cloud Solution Architect",
    }, headers=headers)
    assert res.status_code == 201, res.text
    interview = res.json()

    assert interview["target_company"] == "microsoft"
    assert interview["target_role"] == "Cloud Solution Architect"
    assert len(interview["questions"]) == 4
    # Microsoft's focus areas, so no question outside them should appear.
    assert {q["category"] for q in interview["questions"]} <= {"DSA", "OOP", "System Design", "OS"}


def test_profile_targeting_can_be_updated(client):
    headers, user = _account(client, "profile@intervux.ai")
    assert user["role"] == "candidate" and user["target_company"] is None

    updated = client.patch("/api/auth/me", json={
        "target_company": "Google", "target_role": "SRE"
    }, headers=headers).json()
    assert updated["target_company"] == "Google"
    assert updated["target_role"] == "SRE"


# ------------------------------------------------------------------------ fluency
def test_fluency_rating_distinguishes_delivery():
    from app.services.speech_service import speech_service

    strong = speech_service.score_fluency(STRONG_ANSWER, 28.0)
    filler_heavy = speech_service.score_fluency(
        "So um basically like I was working on this thing and um you know it was like "
        "a project and basically we did the thing and um it was like good so yeah.",
        22.0,
    )
    rushed = speech_service.score_fluency(STRONG_ANSWER, 9.0)

    assert strong["fluency_score"] > filler_heavy["fluency_score"] + 20
    assert strong["band"] in ("Advanced", "Fluent")
    assert filler_heavy["components"]["filler_control"] < 40
    # Same words, a third of the time: pace must be penalised.
    assert rushed["components"]["pace"] < strong["components"]["pace"]
    assert set(strong["components"]) == {
        "pace", "continuity", "filler_control", "vocabulary", "sentence_flow"
    }

    too_short = speech_service.score_fluency("Yes it is.", 4.0)
    assert too_short["fluency_score"] == 0.0
    assert too_short["band"] == "Not enough speech"


def test_report_includes_fluency(client):
    headers, _ = _account(client, "fluent@intervux.ai")
    interview = client.post("/api/interviews", json={
        "type": "technical", "mode": "simulation", "difficulty": "easy", "question_count": 2,
    }, headers=headers).json()
    _finish_interview(client, headers, interview, STRONG_ANSWER)

    report = client.get(f"/api/reports/{interview['id']}", headers=headers).json()
    assert report["fluency"]["answers_scored"] == 2
    assert report["fluency"]["fluency_score"] > 50
    assert report["fluency"]["band"] in ("Upper Intermediate", "Advanced", "Fluent")
    assert all(point["fluency_score"] > 0 for point in report["timeline"])


# ------------------------------------------------------------- rating & standings
def test_rating_rises_with_completed_sessions(client):
    headers, user = _account(client, "rated@intervux.ai", company="Amazon")

    unrated = client.get("/api/rating", headers=headers).json()
    assert unrated["rating"] == 0 and unrated["tier"] == "Unrated"

    for _ in range(2):
        interview = client.post("/api/interviews", json={
            "type": "technical", "mode": "simulation", "difficulty": "easy", "question_count": 2,
            "target_company": "amazon",
        }, headers=headers).json()
        _finish_interview(client, headers, interview, STRONG_ANSWER)

    rated = client.get("/api/rating", headers=headers).json()
    assert rated["sessions_completed"] == 2
    assert rated["rating"] > 0
    assert rated["tier"] in ("Bronze", "Silver", "Gold", "Platinum", "Diamond")
    assert rated["best_score"] is not None

    board = client.get("/api/leaderboard", headers=headers).json()
    assert board["me"]["rating"] == rated["rating"]
    mine = next(row for row in board["standings"] if row["user_id"] == user["id"])
    assert mine["rank"] >= 1
    assert mine["sessions"] == 2
    # Ranks must be ordered by rating.
    ratings = [row["rating"] for row in board["standings"]]
    assert ratings == sorted(ratings, reverse=True)


# -------------------------------------------------------------------- contests
def test_contest_questions_require_attendance(client):
    headers, _ = _account(client, "contender@intervux.ai")

    contests = client.get("/api/contests", headers=headers).json()
    assert len(contests) >= 2
    kinds = {c["kind"] for c in contests}
    assert {"daily", "weekly"} <= kinds

    live = next(c for c in contests if c["status"] == "live")
    # Sealed before joining.
    assert live["questions"] is None
    assert live["questions_locked"] is True
    assert live["joined"] is False

    # Starting the set without joining is refused.
    blocked = client.post("/api/interviews", json={
        "type": "technical", "mode": "simulation", "difficulty": "medium",
        "question_count": 5, "contest_id": live["id"],
    }, headers=headers)
    assert blocked.status_code == 403

    # The scoreboard is attendee-only too.
    assert client.get(f"/api/contests/{live['id']}/scoreboard", headers=headers).status_code == 403

    joined = client.post(f"/api/contests/{live['id']}/join", headers=headers)
    assert joined.status_code == 200

    after = client.get("/api/contests", headers=headers).json()
    unlocked = next(c for c in after if c["id"] == live["id"])
    assert unlocked["joined"] is True
    assert unlocked["questions_locked"] is False
    assert len(unlocked["questions"]) == live["question_count"]
    assert unlocked["participants"] >= 1

    # Joining twice is idempotent, not an error.
    assert client.post(f"/api/contests/{live['id']}/join", headers=headers).status_code == 200


def test_contest_result_reaches_the_scoreboard(client):
    headers, user = _account(client, "scorer@intervux.ai")
    live = next(c for c in client.get("/api/contests", headers=headers).json() if c["status"] == "live")
    client.post(f"/api/contests/{live['id']}/join", headers=headers)

    interview = client.post("/api/interviews", json={
        "type": "technical", "mode": "simulation", "difficulty": "medium",
        "question_count": 5, "contest_id": live["id"],
    }, headers=headers).json()
    assert interview["contest_id"] == live["id"]
    # Every attendee gets the identical sealed set.
    sealed = next(c for c in client.get("/api/contests", headers=headers).json() if c["id"] == live["id"])
    assert [q["question"] for q in sealed["questions"]] == [q["question_text"] for q in interview["questions"]]

    completed = _finish_interview(client, headers, interview, STRONG_ANSWER)

    board = client.get(f"/api/contests/{live['id']}/scoreboard", headers=headers).json()
    me = next(row for row in board["scoreboard"] if row["user_id"] == user["id"])
    assert me["status"] == "completed"
    assert me["rank"] == 1
    assert me["score"] == pytest.approx(completed["overall_score"], abs=0.1)


# ------------------------------------------------------------------- HR portal
def test_hr_portal_is_role_gated(client):
    candidate_headers, candidate = _account(client, "watched@intervux.ai", company="Infosys")
    interview = client.post("/api/interviews", json={
        "type": "hr", "mode": "simulation", "difficulty": "easy", "question_count": 2,
        "target_company": "infosys",
    }, headers=candidate_headers).json()
    _finish_interview(client, candidate_headers, interview, STRONG_ANSWER)

    # A candidate cannot reach the HR portal.
    assert client.get("/api/hr/candidates", headers=candidate_headers).status_code == 403

    hr_headers, hr_user = _account(client, "recruiter@infosys.com", role="hr", company="Infosys")
    assert hr_user["role"] == "hr"

    roster = client.get("/api/hr/candidates", headers=hr_headers).json()
    row = next(r for r in roster if r["user_id"] == candidate["id"])
    assert row["target_company"] == "Infosys"
    assert row["sessions_completed"] == 1
    assert row["rating"] > 0
    # HR accounts never appear in their own candidate roster.
    assert all(r["user_id"] != hr_user["id"] for r in roster)

    detail = client.get(f"/api/hr/candidates/{candidate['id']}", headers=hr_headers).json()
    assert detail["candidate"]["email"] == "watched@intervux.ai"
    assert len(detail["sessions"]) == 1
    assert detail["sessions"][0]["question_count"] == 2
    assert detail["rating"]["sessions_completed"] == 1

    assert client.get("/api/hr/candidates/999999", headers=hr_headers).status_code == 404
    # HR sees contest scoreboards without having to attend.
    assert isinstance(client.get("/api/hr/contests", headers=hr_headers).json(), list)


# ------------------------------------------------- english speaking practice
def test_speaking_practice_scores_and_tracks_progress(client):
    headers, _ = _account(client, "speaker@intervux.ai")

    prompts = client.get("/api/practice/prompts", headers=headers).json()
    assert len(prompts) >= 6
    assert {p["level"] for p in prompts} == {"starter", "intermediate", "advanced"}
    assert all({"id", "prompt", "focus", "seconds", "hint"} <= set(p) for p in prompts)
    assert all(p["level"] == "advanced" for p in client.get("/api/practice/prompts?level=advanced").json())

    weak = client.post("/api/practice/attempts", json={
        "prompt_id": prompts[0]["id"],
        "transcript": "So um basically like I am um you know a developer and basically I like code so yeah um.",
        "duration": 20.0,
    }, headers=headers).json()
    assert weak["fluency_score"] > 0
    assert weak["tips"]

    strong = client.post("/api/practice/attempts", json={
        "prompt_id": prompts[0]["id"],
        "transcript": STRONG_ANSWER,
        "duration": 28.0,
    }, headers=headers).json()
    assert strong["fluency_score"] > weak["fluency_score"]

    history = client.get("/api/practice/attempts", headers=headers).json()
    assert history["summary"]["attempts"] == 2
    assert history["summary"]["best_score"] == strong["fluency_score"]
    # Newest first, so the trend is latest minus oldest.
    assert history["attempts"][0]["fluency_score"] == strong["fluency_score"]
    assert history["summary"]["trend"] > 0
    assert history["attempts"][0]["feedback"]["components"]["pace"] > 0

    # Practice is private to the candidate.
    other_headers, _ = _account(client, "nosy@intervux.ai")
    assert client.get("/api/practice/attempts", headers=other_headers).json()["summary"]["attempts"] == 0
