import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

# Penalty per occurrence, and the ceiling any single event type can cost.
# A candidate who tabs out once is careless; one who tabs out twenty times is
# reading something, so repeats cost more but saturate.
EVENT_RULES: Dict[str, Dict[str, Any]] = {
    "tab_hidden":       {"penalty": 16.0, "cap": 48.0, "label": "Left the interview tab"},
    "window_blur":      {"penalty": 6.0,  "cap": 25.0, "label": "Interview window lost focus"},
    "fullscreen_exit":  {"penalty": 8.0,  "cap": 20.0, "label": "Exited fullscreen"},
    "second_display":   {"penalty": 10.0, "cap": 10.0, "label": "A second display is attached"},
    "viewport_shift":   {"penalty": 5.0,  "cap": 15.0, "label": "Browser chrome changed size mid-answer (toolbar, devtools or extension panel)"},
    "injected_overlay": {"penalty": 15.0, "cap": 30.0, "label": "An element not belonging to IntervuX was injected into the page"},
    "paste":            {"penalty": 10.0, "cap": 20.0, "label": "Content pasted into the page"},
    "screen_share_denied": {"penalty": 10.0, "cap": 10.0, "label": "Screen visibility check declined"},
}


class ProctorService:
    """
    Session integrity tracking. Combines browser-reported environment events with
    the vision service's observable signals into one integrity score plus flags.

    Honest about its ceiling: a web page cannot see other processes. A well-built
    always-on-top answer overlay (Parakeet-style) renders outside the page and
    excludes itself from screen capture, so no browser API reveals it. What *is*
    observable is the behaviour of using one: eyes parked off-lens while speaking
    fluently, focus leaving the tab, a second display, an injected DOM node, or a
    browser window that suddenly changed size. Those are what this scores.

    ponytail: heuristic behavioural scoring, not proof of cheating. Treat the
    output as flags for a human to review, never as an automated verdict.
    Upgrade path: mandatory getDisplayMedia("monitor") recording plus per-frame
    OCR of the shared screen, if the product ever needs evidence rather than signal.
    """

    def __init__(self):
        self._sessions: Dict[int, Dict[str, Any]] = {}

    def _session(self, interview_id: int) -> Dict[str, Any]:
        return self._sessions.setdefault(
            interview_id, {"counts": {}, "events": [], "hidden_seconds": 0.0}
        )

    def reset_session(self, interview_id: int) -> None:
        self._sessions.pop(interview_id, None)

    def record_event(self, interview_id: int, event_type: str, detail: Dict[str, Any] | None = None) -> None:
        """Record one browser-reported environment event. Unknown types are ignored."""
        if event_type not in EVENT_RULES:
            logger.debug(f"Ignoring unknown integrity event '{event_type}'")
            return

        session = self._session(interview_id)
        session["counts"][event_type] = session["counts"].get(event_type, 0) + 1
        session["events"].append({"type": event_type, "detail": detail or {}})
        if event_type == "tab_hidden":
            session["hidden_seconds"] += float((detail or {}).get("seconds", 0.0))

    def summarize(self, interview_id: int, vision: Dict[str, Any] | None = None) -> Dict[str, Any]:
        """
        Integrity score (0-100) and the flags behind it.
        `vision` is the aggregate from VisionService for the answer just finished.
        """
        session = self._session(interview_id)
        flags: List[Dict[str, Any]] = []
        penalty = 0.0

        for event_type, count in sorted(session["counts"].items()):
            rule = EVENT_RULES[event_type]
            cost = min(rule["cap"], rule["penalty"] * count)
            penalty += cost
            flags.append({
                "type": event_type,
                "label": rule["label"],
                "count": count,
                "severity": "high" if cost >= 15 else "medium" if cost >= 8 else "low",
            })

        vision = vision or {}

        away_ratio = float(vision.get("looking_away_ratio", 0.0))
        if away_ratio >= 35.0:
            cost = min(30.0, (away_ratio - 35.0) / 65.0 * 30.0 + 10.0)
            penalty += cost
            flags.append({
                "type": "gaze_off_screen",
                "label": f"Eyes off the lens for {away_ratio:.0f}% of sampled frames",
                "count": 1,
                "severity": "high" if away_ratio >= 60.0 else "medium",
            })

        if int(vision.get("max_person_count", 1)) > 1:
            penalty += 20.0
            flags.append({
                "type": "second_person",
                "label": "Another person appeared in frame",
                "count": int(vision["max_person_count"]) - 1,
                "severity": "high",
            })

        bg_motion = float(vision.get("avg_background_motion", 0.0))
        if bg_motion >= 4.0:
            penalty += min(12.0, bg_motion)
            flags.append({
                "type": "background_activity",
                "label": f"Sustained movement behind the candidate ({bg_motion:.1f}% of frame)",
                "count": 1,
                "severity": "medium" if bg_motion < 10.0 else "high",
            })

        score = round(max(0.0, 100.0 - penalty), 1)
        return {
            "integrity_score": score,
            "status": "clean" if score >= 85 else "review" if score >= 60 else "flagged",
            "flags": flags,
            "hidden_seconds": round(session["hidden_seconds"], 1),
            "event_count": len(session["events"]),
        }


proctor_service = ProctorService()
