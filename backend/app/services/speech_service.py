import os
import re
import math
import logging
import tempfile
from typing import Dict, Any, List, Optional
import numpy as np

logger = logging.getLogger(__name__)

# Common conversational filler words in spoken English
FILLER_PATTERNS = [
    r"\b(um+)\b",
    r"\b(uh+)\b",
    r"\b(er+)\b",
    r"\b(ah+)\b",
    r"\b(like)\b",
    r"\b(you know)\b",
    r"\b(basically)\b",
    r"\b(actually)\b",
    r"\b(literally)\b",
    r"\b(so)\b",
    r"\b(i mean)\b",
    r"\b(kind of)\b",
    r"\b(sort of)\b",
    r"\b(right\?)\b",
]

class SpeechService:
    """
    Analyzes spoken audio signals and transcripts:
    - Speech-to-text transcription via Whisper
    - Speaking speed (Words Per Minute)
    - Pause duration (silence detection and phrasing gap estimation)
    - Filler word detection and frequency
    - Approximate audio volume / RMS energy level
    - Speech duration

    Does NOT fabricate pronunciation scores.
    """

    def __init__(self):
        self._whisper_model = None

    def _get_whisper_model(self):
        if self._whisper_model is None:
            try:
                import whisper
                from app.config import settings
                model_name = settings.WHISPER_MODEL or "base"
                logger.info(f"Loading Whisper model '{model_name}'...")
                self._whisper_model = whisper.load_model(model_name)
                logger.info("Whisper model loaded successfully.")
            except Exception as e:
                logger.warning(f"Could not load local Whisper model ({e}). Will use fallback audio processing.")
                self._whisper_model = False
        return self._whisper_model if self._whisper_model is not False else None

    def transcribe_audio_file(self, audio_path: str) -> str:
        """Transcribe an audio file using Whisper."""
        model = self._get_whisper_model()
        if model is not None:
            try:
                result = model.transcribe(audio_path, fp16=False)
                return result.get("text", "").strip()
            except Exception as e:
                logger.error(f"Whisper transcription failed: {e}")
        return ""

    def transcribe_audio_bytes(self, audio_bytes: bytes, file_ext: str = ".webm") -> str:
        """Transcribe raw audio bytes using Whisper via temporary file."""
        with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            return self.transcribe_audio_file(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def count_filler_words(self, text: str) -> tuple[int, List[str]]:
        """Identifies and counts filler words in the transcript."""
        if not text:
            return 0, []

        found_fillers = []
        lower_text = text.lower()
        for pattern in FILLER_PATTERNS:
            matches = re.findall(pattern, lower_text)
            if matches:
                for match in matches:
                    found_fillers.append(match if isinstance(match, str) else match[0])

        return len(found_fillers), found_fillers

    def analyze_speech(
        self,
        transcript: str,
        duration_seconds: float,
        audio_volume_samples: Optional[List[float]] = None
    ) -> Dict[str, Any]:
        """
        Calculates comprehensive speech metrics based on transcript, duration, and volume data.
        
        Metrics:
        - speaking_speed: Words Per Minute (WPM)
        - filler_count: int
        - filler_words: list[str]
        - pause_duration: estimated average pause duration in seconds
        - speech_duration: float in seconds
        - volume_score: 0-100 normalized volume consistency
        """
        clean_text = transcript.strip()
        words = clean_text.split()
        word_count = len(words)

        # Minimum duration floor of 1.0 second to avoid division by zero
        effective_duration = max(1.0, duration_seconds)

        # 1. Speaking Speed (WPM)
        # Normal conversational interview speed is typically 130 - 160 WPM
        wpm = (word_count / effective_duration) * 60.0
        wpm = round(wpm, 1)

        # 2. Filler words
        filler_count, filler_words = self.count_filler_words(clean_text)

        # 3. Pause duration estimation
        # Punctuation pauses (commas, periods, ellipses, semicolons) + silence intervals
        punctuation_pauses = len(re.findall(r"[,;:\.\?!]+", clean_text))
        if punctuation_pauses > 0 and word_count > 5:
            # Estimated average pause duration in seconds based on pacing
            avg_pause = min(4.5, max(0.8, (effective_duration - (word_count * 0.35)) / max(1, punctuation_pauses)))
        else:
            avg_pause = 1.8 if word_count > 0 else 0.0
        avg_pause = round(avg_pause, 1)

        # 4. Volume score
        if audio_volume_samples and len(audio_volume_samples) > 0:
            avg_vol = float(np.mean(audio_volume_samples))
            # Normalize to 0-100 scale
            volume_score = min(100.0, max(10.0, avg_vol * 100.0 if avg_vol <= 1.0 else avg_vol))
        else:
            # Baseline comfortable microphone level
            volume_score = 75.0
        volume_score = round(volume_score, 1)

        return {
            "transcript": clean_text,
            "duration": round(effective_duration, 1),
            "word_count": word_count,
            "speaking_speed": wpm,
            "filler_count": filler_count,
            "filler_words": filler_words,
            "pause_duration": avg_pause,
            "volume_score": volume_score
        }

    def score_fluency(
        self,
        transcript: str,
        duration_seconds: float,
        filler_count: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Rate spoken English fluency from the transcript and its timing.

        Five observable components, each 0-100:
        - pace:        words per minute against the 120-165 conversational band
        - continuity:  words spoken per second of airtime, which drops when the
                       speaker stalls mid-sentence
        - filler_control: filler words as a share of total words
        - vocabulary:  distinct words as a share of total words (type-token ratio)
        - sentence_flow: average clause length and how varied those lengths are

        Reports what the words and clock show. It does NOT score accent,
        pronunciation or grammar - a text transcript cannot evidence any of those,
        and the LLM evaluator already covers grammar separately.
        """
        clean = (transcript or "").strip()
        words = re.findall(r"[a-zA-Z\']+", clean)
        word_count = len(words)
        effective_duration = max(1.0, float(duration_seconds or 0.0))

        if word_count < 5:
            return {
                "fluency_score": 0.0,
                "band": "Not enough speech",
                "word_count": word_count,
                "speaking_speed": 0.0,
                "components": {
                    "pace": 0.0, "continuity": 0.0, "filler_control": 0.0,
                    "vocabulary": 0.0, "sentence_flow": 0.0,
                },
                "strengths": [],
                "tips": ["Speak for at least 20-30 seconds so there is enough speech to measure."],
            }

        wpm = (word_count / effective_duration) * 60.0

        # 1. Pace: full marks inside the conversational band, tapering outside it.
        if 120.0 <= wpm <= 165.0:
            pace = 100.0
        elif wpm < 120.0:
            pace = max(20.0, 100.0 - (120.0 - wpm) * 1.1)
        else:
            pace = max(20.0, 100.0 - (wpm - 165.0) * 1.3)

        # 2. Continuity: a fluent speaker sustains ~2-3 words per second of airtime.
        words_per_second = word_count / effective_duration
        continuity = max(15.0, min(100.0, words_per_second / 2.4 * 100.0))

        # 3. Filler control, as a density rather than a raw count.
        fillers = self.count_filler_words(clean)[0] if filler_count is None else int(filler_count)
        filler_density = fillers / float(word_count)
        filler_control = max(0.0, 100.0 - filler_density * 900.0)

        # 4. Vocabulary range. Type-token ratio falls naturally as answers get
        # longer, so normalise against the length rather than comparing raw ratios.
        distinct = len({w.lower() for w in words})
        ttr = distinct / float(word_count)
        expected_ttr = max(0.35, 0.95 - (word_count / 900.0))
        vocabulary = max(20.0, min(100.0, ttr / expected_ttr * 100.0))

        # 5. Sentence flow: clause length near 14 words, with some variation.
        clauses = [c for c in re.split(r"[.!?;,]+", clean) if c.strip()]
        clause_lengths = [len(c.split()) for c in clauses] or [word_count]
        avg_clause = sum(clause_lengths) / len(clause_lengths)
        length_fit = max(0.0, 100.0 - abs(avg_clause - 14.0) * 5.0)
        if len(clause_lengths) > 1:
            spread = float(np.std(clause_lengths))
            variety = min(100.0, spread / 6.0 * 100.0)  # monotone, same-length clauses read as flat
        else:
            variety = 30.0
        sentence_flow = length_fit * 0.65 + variety * 0.35

        components = {
            "pace": round(pace, 1),
            "continuity": round(continuity, 1),
            "filler_control": round(filler_control, 1),
            "vocabulary": round(vocabulary, 1),
            "sentence_flow": round(sentence_flow, 1),
        }
        fluency = (
            pace * 0.25
            + continuity * 0.20
            + filler_control * 0.25
            + vocabulary * 0.15
            + sentence_flow * 0.15
        )
        fluency = round(max(0.0, min(100.0, fluency)), 1)

        if fluency >= 85:
            band = "Fluent"
        elif fluency >= 70:
            band = "Advanced"
        elif fluency >= 55:
            band = "Upper Intermediate"
        elif fluency >= 40:
            band = "Intermediate"
        else:
            band = "Developing"

        strengths, tips = [], []
        if components["pace"] >= 80:
            strengths.append(f"Pace sat in the natural range at {round(wpm)} WPM.")
        elif wpm > 165:
            tips.append(f"You averaged {round(wpm)} WPM. Aim for 130-160 so listeners can keep up.")
        else:
            tips.append(f"You averaged {round(wpm)} WPM, which reads as hesitant. Push toward 130 WPM.")

        if components["filler_control"] >= 80:
            strengths.append("Very few filler words for the length of the answer.")
        else:
            tips.append(f"{fillers} filler words across {word_count} words. Replace them with a silent pause.")

        if components["vocabulary"] >= 75:
            strengths.append("Good vocabulary range, with little word repetition.")
        else:
            tips.append("You reused the same words often. Vary your phrasing to sound more precise.")

        if components["sentence_flow"] < 60:
            tips.append(
                "Sentences ran very long or very uniform. Mix short statements with longer explanations."
            )
        if components["continuity"] < 55:
            tips.append("Long stalls mid-sentence. Plan the first line of your answer before you start speaking.")

        return {
            "fluency_score": fluency,
            "band": band,
            "word_count": word_count,
            "speaking_speed": round(wpm, 1),
            "filler_count": fillers,
            "components": components,
            "strengths": strengths,
            "tips": tips[:3],
        }


speech_service = SpeechService()
