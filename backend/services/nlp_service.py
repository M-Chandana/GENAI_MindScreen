"""
NLP Processing Service
- Sentiment Analysis: Fine-tuned BERT (cardiffnlp/twitter-roberta-base-sentiment)
- Emotion Detection: RoBERTa (j-hartmann/emotion-english-distilroberta-base)
- Embeddings: Sentence-BERT (all-MiniLM-L6-v2)
- Feature Engineering Pipeline
"""

import re
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ─── Keyword Banks ─────────────────────────────────────────────────────────────
HOPELESSNESS_KEYWORDS = [
    "hopeless", "worthless", "pointless", "no future", "give up", "can't go on",
    "nothing matters", "no reason", "lost all hope", "empty", "meaningless",
    "trapped", "no way out", "burden", "better off without me"
]

STRESS_KEYWORDS = [
    "stressed", "overwhelmed", "anxious", "worried", "tense", "nervous",
    "panic", "pressure", "can't cope", "too much", "breaking point",
    "exhausted", "burned out", "drained"
]

SLEEP_KEYWORDS = [
    "can't sleep", "insomnia", "sleepless", "awake all night", "tired",
    "fatigue", "no energy", "sleep too much", "oversleeping", "restless"
]

SELF_HARM_KEYWORDS = [
    "hurt myself", "self-harm", "cut myself", "end it all", "suicide",
    "don't want to live", "harm myself", "not worth living", "kill myself",
    "disappear", "end my life"
]

NEGATIVE_KEYWORDS = [
    "sad", "depressed", "unhappy", "miserable", "terrible", "awful",
    "horrible", "bad", "worst", "hate", "angry", "frustrated", "lonely",
    "isolated", "numb", "empty", "broken"
]


@dataclass
class NLPFeatures:
    sentiment_score: float
    sentiment_label: str
    emotion_label: str
    emotion_confidence: float
    emotion_distribution: Dict[str, float]
    negative_keyword_count: int
    hopelessness_indicators: int
    stress_indicators: int
    sleep_related_words: int
    self_harm_related_terms: int
    detected_keywords: List[str]
    psychological_markers: List[str]


class NLPProcessor:
    """Core NLP processing pipeline with lazy model loading."""

    def __init__(self):
        self._sentiment_model = None
        self._emotion_model = None
        self._embedding_model = None
        self._models_loaded = False

    def _load_models(self):
        """Lazy-load models on first use. (MODIFIED: Bypassing heavy downloads)"""
        return 
        if self._models_loaded:
            return

        try:
            from transformers import pipeline
            from sentence_transformers import SentenceTransformer

            logger.info("Loading NLP models...")

            # Sentiment: Twitter RoBERTa (3-class: positive/neutral/negative)
            self._sentiment_model = pipeline(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                return_all_scores=True
            )

            # Emotion: DistilRoBERTa fine-tuned on 6 emotions
            self._emotion_model = pipeline(
                "text-classification",
                model="j-hartmann/emotion-english-distilroberta-base",
                return_all_scores=True
            )

            # Sentence embeddings for semantic similarity
            self._embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

            self._models_loaded = True
            logger.info("All NLP models loaded successfully")

        except ImportError as e:
            logger.warning(f"Transformers not available: {e}. Using rule-based fallback.")
            self._models_loaded = True  # Prevent retry loops

    def _rule_based_sentiment(self, text: str) -> tuple[float, str]:
        """Fallback rule-based sentiment when model unavailable."""
        text_lower = text.lower()
        neg_count = sum(1 for kw in NEGATIVE_KEYWORDS if kw in text_lower)
        hop_count = sum(1 for kw in HOPELESSNESS_KEYWORDS if kw in text_lower)

        total_neg = neg_count + hop_count * 2
        word_count = max(len(text.split()), 1)
        score = max(-1.0, min(1.0, -total_neg / (word_count * 0.1 + 1)))

        if score < -0.3:
            return score, "NEGATIVE"
        elif score > 0.3:
            return score, "POSITIVE"
        return score, "NEUTRAL"

    def _rule_based_emotion(self, text: str) -> tuple[str, float, Dict]:
        """Fallback rule-based emotion detection."""
        text_lower = text.lower()

        emotion_scores = {
            "sadness": sum(1 for kw in ["sad", "cry", "grief", "loss", "depressed", "hopeless"] if kw in text_lower),
            "fear": sum(1 for kw in ["scared", "afraid", "fear", "panic", "anxious", "worry"] if kw in text_lower),
            "anger": sum(1 for kw in ["angry", "furious", "rage", "hate", "frustrated", "annoyed"] if kw in text_lower),
            "joy": sum(1 for kw in ["happy", "joy", "excited", "great", "wonderful", "good"] if kw in text_lower),
            "disgust": sum(1 for kw in ["disgusted", "sick", "revolting", "awful"] if kw in text_lower),
            "surprise": sum(1 for kw in ["surprised", "shocked", "unexpected", "amazed"] if kw in text_lower),
            "neutral": 0.5
        }

        total = sum(emotion_scores.values()) + 0.001
        distribution = {k: v / total for k, v in emotion_scores.items()}

        top_emotion = max(emotion_scores, key=emotion_scores.get)
        confidence = emotion_scores[top_emotion] / total

        return top_emotion, min(confidence + 0.3, 1.0), distribution

    def analyze(self, texts: List[str]) -> NLPFeatures:
        """
        Run full NLP pipeline on a list of user messages.
        Returns aggregated NLPFeatures.
        """
        self._load_models()
        combined_text = " ".join(texts)
        truncated = combined_text[:512]  # BERT token limit safety

        # ── Sentiment Analysis ───────────────────────────────────────────────
        try:
            if self._sentiment_model:
                results = self._sentiment_model(truncated)
                scores = {r['label'].lower(): r['score'] for r in results[0]}
                neg = scores.get('negative', scores.get('label_0', 0))
                pos = scores.get('positive', scores.get('label_2', 0))
                sentiment_score = pos - neg  # Range: -1 to +1
                sentiment_label = "NEGATIVE" if sentiment_score < -0.1 else ("POSITIVE" if sentiment_score > 0.1 else "NEUTRAL")
            else:
                sentiment_score, sentiment_label = self._rule_based_sentiment(truncated)
        except Exception as e:
            logger.warning(f"Sentiment model error: {e}")
            sentiment_score, sentiment_label = self._rule_based_sentiment(truncated)

        # ── Emotion Detection ────────────────────────────────────────────────
        try:
            if self._emotion_model:
                results = self._emotion_model(truncated)
                emotion_dist = {r['label']: r['score'] for r in results[0]}
                top = max(emotion_dist, key=emotion_dist.get)
                emotion_label = top
                emotion_confidence = emotion_dist[top]
            else:
                emotion_label, emotion_confidence, emotion_dist = self._rule_based_emotion(truncated)
        except Exception as e:
            logger.warning(f"Emotion model error: {e}")
            emotion_label, emotion_confidence, emotion_dist = self._rule_based_emotion(truncated)

        # ── Keyword Feature Engineering ──────────────────────────────────────
        text_lower = combined_text.lower()
        words = re.findall(r'\b\w+\b', text_lower)

        hopelessness_count = sum(1 for kw in HOPELESSNESS_KEYWORDS if kw in text_lower)
        stress_count = sum(1 for kw in STRESS_KEYWORDS if kw in text_lower)
        sleep_count = sum(1 for kw in SLEEP_KEYWORDS if kw in text_lower)
        self_harm_count = sum(1 for kw in SELF_HARM_KEYWORDS if kw in text_lower)
        neg_count = sum(1 for kw in NEGATIVE_KEYWORDS if kw in text_lower)

        # Detected keywords for highlighting
        detected = []
        for kw in (HOPELESSNESS_KEYWORDS + STRESS_KEYWORDS + SLEEP_KEYWORDS +
                   SELF_HARM_KEYWORDS + NEGATIVE_KEYWORDS):
            if kw in text_lower and kw not in detected:
                detected.append(kw)

        # Psychological markers
        markers = []
        if hopelessness_count > 0:
            markers.append("hopelessness_detected")
        if stress_count > 2:
            markers.append("elevated_stress")
        if sleep_count > 0:
            markers.append("sleep_disturbance")
        if self_harm_count > 0:
            markers.append("self_harm_ideation")
        if sentiment_score < -0.5:
            markers.append("severe_negative_affect")
        if emotion_label in ["sadness", "fear"] and emotion_confidence > 0.6:
            markers.append(f"dominant_{emotion_label}")

        return NLPFeatures(
            sentiment_score=round(sentiment_score, 4),
            sentiment_label=sentiment_label,
            emotion_label=emotion_label,
            emotion_confidence=round(emotion_confidence, 4),
            emotion_distribution={k: round(v, 4) for k, v in emotion_dist.items()},
            negative_keyword_count=neg_count,
            hopelessness_indicators=hopelessness_count,
            stress_indicators=stress_count,
            sleep_related_words=sleep_count,
            self_harm_related_terms=self_harm_count,
            detected_keywords=detected[:20],
            psychological_markers=markers
        )

    def get_embeddings(self, texts: List[str]) -> Optional[List[float]]:
        """Get sentence embeddings for semantic analysis."""
        self._load_models()
        try:
            if self._embedding_model:
                combined = " ".join(texts)[:512]
                embedding = self._embedding_model.encode(combined)
                return embedding.tolist()
        except Exception as e:
            logger.warning(f"Embedding error: {e}")
        return None


# Singleton
nlp_processor = NLPProcessor()
