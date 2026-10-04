import cv2
import numpy as np
import base64
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Gaze calibration. The eye band is expressed as a fraction of the detected head
# box height, and the bias terms absorb the systematic offset left by a given
# webcam height and lens. Tune these per deployment rather than per frame:
# park the candidate looking straight at the lens and nudge the biases until
# gaze_offset_x / gaze_offset_y read ~0.
EYE_BAND = (0.25, 0.55)
GAZE_BIAS_X = 0.0
GAZE_BIAS_Y = 0.0
# Pupils past these offsets count as looking away from the lens.
GAZE_THRESHOLD_X = 0.18
GAZE_THRESHOLD_Y = 0.20

class VisionService:
    """
    Analyzes visual behavioral signals from webcam frames using OpenCV and MediaPipe.
    Measures observable metrics:
    - Face detection & visibility
    - Approximate eye contact
    - Head orientation (pitch/yaw/roll estimation)
    - Posture stability / alignment
    - Gesture / hand activity level
    
    IMPORTANT: We report observable physical metrics only.
    No psychological or internal emotion states are inferred.
    """

    def __init__(self):
        self.prev_gray: Optional[np.ndarray] = None
        self.frame_count: int = 0
        self.metrics_history: list[Dict[str, Any]] = []
        self.face_centers: list[tuple[float, float]] = []

    def reset_session(self):
        self.prev_gray = None
        self.frame_count = 0
        self.metrics_history = []
        self.face_centers = []

    def decode_frame(self, frame_data: str) -> Optional[np.ndarray]:
        """Decode base64 encoded image frame into OpenCV BGR numpy array."""
        try:
            if "," in frame_data:
                frame_data = frame_data.split(",", 1)[1]
            img_bytes = base64.b64decode(frame_data)
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return frame
        except Exception as e:
            logger.warning(f"Failed to decode frame: {e}")
            return None

    def analyze_frame(self, frame: np.ndarray, record: bool = True) -> Dict[str, Any]:
        """
        Analyze a single video frame.

        `record=False` analyses the frame for the live readout without adding it
        to the session history. The client samples continuously so the meters stay
        alive between questions, and only frames captured while the candidate is
        actually answering belong in that answer's aggregate.
        Returns observable metrics:
        - face_detected: bool
        - eye_contact: float (0-100%)
        - face_visibility: float (0-100%)
        - head_orientation: str ('Mostly centered', 'Looking left', 'Looking right', 'Looking down')
        - posture_score: float (0-100)
        - gesture_score: float (0-100)
        """
        if frame is None or frame.size == 0:
            return self._default_metrics()

        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # 1. Skin & Face Presence Detection via Color Space & Morphological Filtering
        # Convert to YCrCb for skin tone segmentation
        ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
        lower_skin = np.array([0, 133, 77], dtype=np.uint8)
        upper_skin = np.array([255, 173, 127], dtype=np.uint8)
        skin_mask = cv2.inRange(ycrcb, lower_skin, upper_skin)

        # Morphological clean up
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_OPEN, kernel)
        skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_DILATE, kernel)

        # Find largest face-like contour in top half
        contours, _ = cv2.findContours(skin_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_face_area = (h * w) * 0.02 # at least 2% of frame

        candidates = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > min_face_area:
                x, y, cw, ch = cv2.boundingRect(cnt)
                aspect_ratio = float(ch) / cw if cw > 0 else 0
                # Faces typically have vertical aspect ratio roughly 1.0 to 1.8
                if 0.7 <= aspect_ratio <= 2.2 and y < h * 0.7:
                    candidates.append((area, (x, y, cw, ch)))

        candidates.sort(key=lambda c: c[0], reverse=True)
        face_contour = candidates[0][1] if candidates else None
        # A second face-sized skin region usually means another person is in frame.
        person_count = len(candidates)
        face_detected = face_contour is not None

        if face_detected:
            x, y, cw, ch = face_contour
            face_center_x = x + cw / 2.0
            face_center_y = y + ch / 2.0
            frame_center_x = w / 2.0
            frame_center_y = h / 2.0

            # Calculate horizontal and vertical offset ratios (-0.5 to 0.5)
            offset_x = (face_center_x - frame_center_x) / float(w)
            offset_y = (face_center_y - frame_center_y) / float(h)

            # Face visibility: proportion of face area compared to optimal framing (10-25% of screen)
            face_area_ratio = float(cw * ch) / float(w * h)
            if 0.08 <= face_area_ratio <= 0.40:
                face_visibility = min(98.0, 85.0 + (face_area_ratio / 0.25) * 12.0)
            else:
                face_visibility = max(40.0, 70.0 - abs(face_area_ratio - 0.20) * 100.0)

            # Head orientation estimation
            if abs(offset_x) <= 0.08 and abs(offset_y) <= 0.12:
                head_orientation = "Mostly centered"
                alignment_factor = 1.0 - (abs(offset_x) / 0.08) * 0.15
            elif offset_x < -0.08:
                head_orientation = "Looking slightly left"
                alignment_factor = max(0.4, 0.85 - abs(offset_x))
            elif offset_x > 0.08:
                head_orientation = "Looking slightly right"
                alignment_factor = max(0.4, 0.85 - abs(offset_x))
            elif offset_y > 0.12:
                head_orientation = "Looking down"
                alignment_factor = 0.5
            else:
                head_orientation = "Looking up"
                alignment_factor = 0.65

            # Eye contact estimation from measured pupil offset inside the eye band
            gaze = self._estimate_gaze(gray, face_contour)
            if gaze is None:
                gaze_x, gaze_y = 0.0, 0.0
                gaze_penalty = 0.45  # eyes not resolvable at this framing/lighting
                gaze_direction = "Eyes not resolvable"
            else:
                gaze_x, gaze_y = gaze
                gaze_penalty = min(1.0, (abs(gaze_x) / 0.30 + abs(gaze_y) / 0.35) / 2.0)
                if abs(gaze_x) > GAZE_THRESHOLD_X:
                    gaze_direction = "Eyes left of lens" if gaze_x < 0 else "Eyes right of lens"
                elif gaze_y > GAZE_THRESHOLD_Y:
                    gaze_direction = "Eyes down (reading something)"
                elif gaze_y < -GAZE_THRESHOLD_Y:
                    gaze_direction = "Eyes up"
                else:
                    gaze_direction = "On camera"

            eye_contact = round(min(96.0, max(10.0, alignment_factor * 95.0 * (1.0 - 0.55 * gaze_penalty))), 1)
            looking_away = bool(gaze_penalty > 0.55 or alignment_factor < 0.6)

            # Posture estimation based on face elevation and centering
            # Ideal webcam position has face in upper third to middle of frame
            ideal_y_range = (0.2 * h, 0.45 * h)
            if ideal_y_range[0] <= face_center_y <= ideal_y_range[1]:
                posture_score = min(95.0, 88.0 + (1.0 - abs(offset_x)) * 7.0)
            elif face_center_y > ideal_y_range[1]:
                # Slouching too low in frame
                slouch_penalty = (face_center_y - ideal_y_range[1]) / (h * 0.5) * 40.0
                posture_score = max(40.0, 85.0 - slouch_penalty)
            else:
                posture_score = 75.0 # Too high in frame
            # Posture stability: drift of the head centre across the session so far
            if record:
                self.face_centers.append((face_center_x / float(w), face_center_y / float(h)))
            if len(self.face_centers) >= 3:
                recent = self.face_centers[-20:]
                drift = float(np.std([c[0] for c in recent]) + np.std([c[1] for c in recent]))
                stability = max(0.0, 100.0 - drift * 600.0)
                posture_score = posture_score * 0.6 + stability * 0.4
            posture_score = round(posture_score, 1)

        else:
            # Face not clearly detected
            face_visibility = 25.0
            eye_contact = 20.0
            head_orientation = "Not clearly detected"
            posture_score = 45.0
            gaze_x = gaze_y = 0.0
            gaze_direction = "Face not in frame"
            looking_away = True

        # 2. Gesture / Hand Movement Activity via Frame Differencing
        gesture_score = 70.0 # Default baseline
        background_motion = 0.0
        if self.prev_gray is not None and self.prev_gray.shape == gray.shape:
            # Motion outside the candidate's own head region = something moving behind them
            bg_diff = cv2.absdiff(gray, self.prev_gray)
            if face_detected:
                x, y, cw, ch = face_contour
                bg_diff[max(0, y - 10):y + ch + 10, max(0, x - 10):x + cw + 10] = 0
            _, bg_thresh = cv2.threshold(bg_diff, 30, 255, cv2.THRESH_BINARY)
            background_motion = round(cv2.countNonZero(bg_thresh) / float(h * w) * 100.0, 2)
        if self.prev_gray is not None and self.prev_gray.shape == gray.shape:
            # Check motion delta in lower half of frame where hand gestures occur
            lower_h = int(h * 0.5)
            diff = cv2.absdiff(gray[lower_h:, :], self.prev_gray[lower_h:, :])
            _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
            motion_pixels = cv2.countNonZero(thresh)
            motion_ratio = motion_pixels / float((h - lower_h) * w)

            # Natural speaking gestures are moderate (1% to 12% pixel delta)
            if 0.01 <= motion_ratio <= 0.15:
                gesture_score = min(92.0, 75.0 + (motion_ratio / 0.15) * 17.0)
            elif motion_ratio > 0.15:
                # Excessive motion or fidgeting
                gesture_score = max(50.0, 85.0 - (motion_ratio - 0.15) * 120.0)
            else:
                # Very still / minimal gesture
                gesture_score = 65.0

        # prev_gray always advances: motion differencing needs the previous frame
        # whether or not this one is being recorded. The count is of recorded
        # frames only, since that is what the aggregate is built from.
        self.prev_gray = gray.copy()
        if record:
            self.frame_count += 1

        metric = {
            "face_detected": face_detected,
            "eye_contact": float(eye_contact),
            "face_visibility": float(face_visibility),
            "head_orientation": str(head_orientation),
            "posture_score": float(posture_score),
            "gesture_score": float(round(gesture_score, 1)),
            "gaze_direction": str(gaze_direction),
            "gaze_offset_x": round(float(gaze_x), 3),
            "gaze_offset_y": round(float(gaze_y), 3),
            "looking_away": bool(looking_away),
            "person_count": int(person_count),
            "background_motion": float(background_motion)
        }

        if record:
            self.metrics_history.append(metric)
        return metric

    def _estimate_gaze(self, gray: np.ndarray, face_box: tuple) -> Optional[tuple[float, float]]:
        """
        Measure pupil position inside each eye socket and return the mean offset
        from the socket centre, as (x, y) in roughly -0.5..0.5.
        Negative x = pupils toward image-left, positive y = pupils downward.

        ponytail: pupil = darkest blob in the eye band, which is cheap and
        model-free but drifts under harsh side lighting or heavy glasses glare.
        Upgrade path: MediaPipe FaceLandmarker iris landmarks (needs the
        face_landmarker.task model file downloaded at startup).
        """
        x, y, cw, ch = face_box
        top, bottom = y + int(EYE_BAND[0] * ch), y + int(EYE_BAND[1] * ch)
        top, bottom = max(0, top), min(gray.shape[0], bottom)
        left, right = max(0, x), min(gray.shape[1], x + cw)
        if bottom - top < 6 or right - left < 20:
            return None

        band = cv2.GaussianBlur(gray[top:bottom, left:right], (5, 5), 0)
        bh, bw = band.shape
        offsets = []
        # Inset the outer edges: hair and ear shadows are darker than any pupil.
        for x0, x1 in ((int(bw * 0.10), bw // 2), (bw // 2, int(bw * 0.90))):
            roi = band[:, x0:x1]
            if roi.shape[1] < 6:
                continue
            # Centroid of the darkest blob, not the single darkest pixel: a pupil is
            # a flat dark disc, so argmin lands on whichever edge it scans first.
            darkest = float(roi.min())
            dark_mask = cv2.inRange(roi, darkest, darkest + 25.0)
            m = cv2.moments(dark_mask, binaryImage=True)
            if m["m00"] <= 0:
                continue
            px, py = m["m10"] / m["m00"], m["m01"] / m["m00"]
            offsets.append((px / float(roi.shape[1] - 1) - 0.5, py / float(roi.shape[0] - 1) - 0.5))

        if not offsets:
            return None
        return (
            sum(o[0] for o in offsets) / len(offsets) - GAZE_BIAS_X,
            sum(o[1] for o in offsets) / len(offsets) - GAZE_BIAS_Y,
        )

    def get_aggregate_metrics(self) -> Dict[str, Any]:
        """Aggregate all analyzed frames for the current response/session."""
        if not self.metrics_history:
            return self._default_metrics()

        avg_eye_contact = sum(m["eye_contact"] for m in self.metrics_history) / len(self.metrics_history)
        avg_face_visibility = sum(m["face_visibility"] for m in self.metrics_history) / len(self.metrics_history)
        avg_posture = sum(m["posture_score"] for m in self.metrics_history) / len(self.metrics_history)
        avg_gesture = sum(m["gesture_score"] for m in self.metrics_history) / len(self.metrics_history)

        # Most common head orientation
        orientations = [m["head_orientation"] for m in self.metrics_history]
        most_common_orientation = max(set(orientations), key=orientations.count)

        return {
            "eye_contact": round(avg_eye_contact, 1),
            "face_visibility": round(avg_face_visibility, 1),
            "head_orientation": most_common_orientation,
            "posture_score": round(avg_posture, 1),
            "gesture_score": round(avg_gesture, 1),
            "frame_count": self.frame_count,
            "looking_away_ratio": round(
                sum(1 for m in self.metrics_history if m.get("looking_away")) / len(self.metrics_history) * 100.0, 1
            ),
            "max_person_count": max(m.get("person_count", 1) for m in self.metrics_history),
            "avg_background_motion": round(
                sum(m.get("background_motion", 0.0) for m in self.metrics_history) / len(self.metrics_history), 2
            ),
            "gaze_direction": max(
                set(m.get("gaze_direction", "On camera") for m in self.metrics_history),
                key=[m.get("gaze_direction", "On camera") for m in self.metrics_history].count
            )
        }

    def _default_metrics(self) -> Dict[str, Any]:
        return {
            "eye_contact": 75.0,
            "face_visibility": 90.0,
            "head_orientation": "Mostly centered",
            "posture_score": 82.0,
            "gesture_score": 75.0,
            "frame_count": 0,
            "gaze_direction": "On camera",
            "gaze_offset_x": 0.0,
            "gaze_offset_y": 0.0,
            "looking_away": False,
            "person_count": 1,
            "background_motion": 0.0,
            "looking_away_ratio": 0.0,
            "max_person_count": 1,
            "avg_background_motion": 0.0
        }

vision_service = VisionService()
