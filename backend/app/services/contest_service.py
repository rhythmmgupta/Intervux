"""
Contests, candidate ratings and standings.

Contests are generated, not hand-authored: a daily contest for a rotating company
and a weekly contest for the week's company, both idempotent by slug so repeated
startups do not create duplicates. Question sets are seeded from the contest id,
so every attendee of a given contest sees the same questions.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.engagement import Contest, ContestEntry
from app.models.interview import Interview
from app.models.user import User
from app.services.company_service import COMPANIES, company_service

logger = logging.getLogger(__name__)

# Companies that headline the generated contests, in rotation.
CONTEST_ROTATION = ["microsoft", "google", "amazon", "meta", "tcs", "infosys", "goldman-sachs"]

TIERS = [
    (1100, "Diamond"),
    (900, "Platinum"),
    (700, "Gold"),
    (500, "Silver"),
    (0, "Bronze"),
]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _naive(dt: datetime) -> datetime:
    """Strip tzinfo: the DB columns are naive, and SQLite returns naive datetimes."""
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


class ContestService:
    # ---------------------------------------------------------------- contests
    def ensure_contests(self, db: Session, now: Optional[datetime] = None) -> List[Contest]:
        """
        Make sure today's daily contest and this week's weekly contest exist.
        Idempotent: keyed on a date-stamped slug.
        """
        now = now or _utc_now()
        created: List[Contest] = []

        day_start = _naive(now.replace(hour=0, minute=0, second=0, microsecond=0))
        week_start = day_start - timedelta(days=day_start.weekday())

        daily_company = CONTEST_ROTATION[day_start.toordinal() % len(CONTEST_ROTATION)]
        weekly_company = CONTEST_ROTATION[week_start.isocalendar()[1] % len(CONTEST_ROTATION)]

        plans = [
            {
                "slug": f"daily-{daily_company}-{day_start:%Y%m%d}",
                "company": daily_company,
                "kind": "daily",
                "difficulty": "medium",
                "question_count": 5,
                "starts_at": day_start,
                "ends_at": day_start + timedelta(days=1),
            },
            {
                "slug": f"weekly-{weekly_company}-{week_start:%Y%m%d}",
                "company": weekly_company,
                "kind": "weekly",
                "difficulty": "hard",
                "question_count": 5,
                "starts_at": week_start,
                "ends_at": week_start + timedelta(days=7),
            },
        ]

        for plan in plans:
            if db.query(Contest).filter(Contest.slug == plan["slug"]).first():
                continue

            company = company_service.get_company(plan["company"])
            label = "Top 5 Daily" if plan["kind"] == "daily" else "Top 5 Weekly Challenge"
            contest = Contest(
                slug=plan["slug"],
                title=f"{company['name']} {label}",
                company=company["name"],
                kind=plan["kind"],
                difficulty=plan["difficulty"],
                question_count=plan["question_count"],
                questions_json="[]",
                starts_at=plan["starts_at"],
                ends_at=plan["ends_at"],
            )
            db.add(contest)
            db.commit()
            db.refresh(contest)

            # Seeded by contest id so the set is fixed once, and identical for everyone.
            questions = company_service.select_questions(
                slug=plan["company"],
                interview_type="technical",
                difficulty=plan["difficulty"],
                limit=plan["question_count"],
                seed=contest.id,
            )
            contest.questions_json = json.dumps(questions)
            db.commit()
            created.append(contest)
            logger.info(f"Seeded contest '{contest.slug}' with {len(questions)} questions")

        return created

    def list_contests(self, db: Session, user_id: Optional[int] = None, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Open and recent contests. Questions are withheld unless the user joined."""
        now = _naive(now or _utc_now())
        contests = db.query(Contest).order_by(Contest.starts_at.desc()).limit(20).all()

        joined_ids, entry_by_contest = set(), {}
        if user_id is not None:
            for entry in db.query(ContestEntry).filter(ContestEntry.user_id == user_id).all():
                joined_ids.add(entry.contest_id)
                entry_by_contest[entry.contest_id] = entry

        rows = []
        for c in contests:
            is_live = _naive(c.starts_at) <= now < _naive(c.ends_at)
            entry = entry_by_contest.get(c.id)
            rows.append({
                "id": c.id,
                "slug": c.slug,
                "title": c.title,
                "company": c.company,
                "kind": c.kind,
                "difficulty": c.difficulty,
                "question_count": c.question_count,
                "starts_at": c.starts_at,
                "ends_at": c.ends_at,
                "status": "live" if is_live else ("upcoming" if now < _naive(c.starts_at) else "closed"),
                "participants": db.query(ContestEntry).filter(ContestEntry.contest_id == c.id).count(),
                "joined": c.id in joined_ids,
                "my_score": entry.score if entry else None,
                # The whole point of attending: the questions stay sealed otherwise.
                "questions": json.loads(c.questions_json) if c.id in joined_ids and is_live else None,
                "questions_locked": c.id not in joined_ids,
            })
        return rows

    def join_contest(self, db: Session, contest_id: int, user_id: int, now: Optional[datetime] = None) -> ContestEntry:
        """Register attendance, which is what unlocks the question set."""
        now = _naive(now or _utc_now())
        contest = db.query(Contest).filter(Contest.id == contest_id).first()
        if not contest:
            raise ValueError("Contest not found")
        if not (_naive(contest.starts_at) <= now < _naive(contest.ends_at)):
            raise ValueError("This contest is not currently open")

        existing = (
            db.query(ContestEntry)
            .filter(ContestEntry.contest_id == contest_id, ContestEntry.user_id == user_id)
            .first()
        )
        if existing:
            return existing

        entry = ContestEntry(contest_id=contest_id, user_id=user_id)
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry

    def get_entry(self, db: Session, contest_id: int, user_id: int) -> Optional[ContestEntry]:
        return (
            db.query(ContestEntry)
            .filter(ContestEntry.contest_id == contest_id, ContestEntry.user_id == user_id)
            .first()
        )

    def record_contest_result(self, db: Session, interview: Interview) -> Optional[ContestEntry]:
        """Attach a finished contest interview's score to the attendee's entry."""
        if not interview.contest_id:
            return None
        entry = self.get_entry(db, interview.contest_id, interview.user_id)
        if not entry:
            return None
        entry.interview_id = interview.id
        entry.score = interview.overall_score
        entry.completed_at = _naive(_utc_now())
        db.commit()
        db.refresh(entry)
        return entry

    def contest_scoreboard(self, db: Session, contest_id: int) -> List[Dict[str, Any]]:
        """Finished attempts first, ranked by score; attendees yet to finish trail behind."""
        entries = (
            db.query(ContestEntry, User)
            .join(User, User.id == ContestEntry.user_id)
            .filter(ContestEntry.contest_id == contest_id)
            .all()
        )
        done = sorted([e for e in entries if e[0].score is not None], key=lambda e: -e[0].score)
        pending = [e for e in entries if e[0].score is None]

        rows = []
        for rank, (entry, user) in enumerate(done, start=1):
            rows.append({
                "rank": rank,
                "user_id": user.id,
                "name": user.name,
                "score": round(entry.score, 1),
                "completed_at": entry.completed_at,
                "status": "completed",
            })
        for entry, user in pending:
            rows.append({
                "rank": None,
                "user_id": user.id,
                "name": user.name,
                "score": None,
                "completed_at": None,
                "status": "in_progress",
            })
        return rows

    # ------------------------------------------------------------------ rating
    def rating_for_user(self, db: Session, user_id: int) -> Dict[str, Any]:
        """
        Candidate rating, deliberately simple and explainable:
        the average of the best five completed sessions on a 0-1000 scale, plus up
        to 200 points of consistency credit for volume. A candidate can see exactly
        why their number moved, which a hidden Elo update would not give them.
        """
        scores = [
            row[0] for row in db.query(Interview.overall_score)
            .filter(
                Interview.user_id == user_id,
                Interview.status == "completed",
                Interview.overall_score.isnot(None),
            )
            .order_by(Interview.overall_score.desc())
            .all()
        ]
        sessions_completed = len(scores)
        if not scores:
            return {
                "user_id": user_id,
                "rating": 0,
                "tier": "Unrated",
                "sessions_completed": 0,
                "best_score": None,
                "average_score": None,
                "contests_entered": db.query(ContestEntry).filter(ContestEntry.user_id == user_id).count(),
            }

        best_five = scores[:5]
        skill_points = sum(best_five) / len(best_five) * 10.0
        consistency_points = min(200.0, sessions_completed * 20.0)
        rating = int(round(skill_points + consistency_points))
        tier = next(name for floor, name in TIERS if rating >= floor)

        return {
            "user_id": user_id,
            "rating": rating,
            "tier": tier,
            "sessions_completed": sessions_completed,
            "best_score": round(max(scores), 1),
            "average_score": round(sum(scores) / len(scores), 1),
            "contests_entered": db.query(ContestEntry).filter(ContestEntry.user_id == user_id).count(),
        }

    def leaderboard(self, db: Session, limit: int = 50, company: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Global standings over completed sessions. One grouped query for the
        aggregates, then the same rating formula per user.

        ponytail: recomputed per request. At a few thousand users that is a single
        indexed GROUP BY; cache or materialise it only once the query shows up slow.
        """
        q = (
            db.query(
                User.id,
                User.name,
                User.target_company,
                func.count(Interview.id).label("sessions"),
                func.max(Interview.overall_score).label("best"),
                func.avg(Interview.overall_score).label("avg"),
            )
            .join(Interview, Interview.user_id == User.id)
            .filter(
                User.role == "candidate",
                Interview.status == "completed",
                Interview.overall_score.isnot(None),
            )
        )
        if company:
            q = q.filter(Interview.target_company == company)

        rows = q.group_by(User.id, User.name, User.target_company).all()

        standings = []
        for user_id, name, target_company, sessions, best, avg in rows:
            rating = self.rating_for_user(db, user_id)
            standings.append({
                "user_id": user_id,
                "name": name,
                "target_company": target_company,
                "sessions": sessions,
                "best_score": round(best, 1) if best is not None else None,
                "average_score": round(avg, 1) if avg is not None else None,
                "rating": rating["rating"],
                "tier": rating["tier"],
            })

        standings.sort(key=lambda r: (-r["rating"], -(r["best_score"] or 0)))
        for rank, row in enumerate(standings[:limit], start=1):
            row["rank"] = rank
        return standings[:limit]


contest_service = ContestService()
