"""
Risk Classification Service
- Feature Fusion Module (text features + questionnaire scores)
- Logistic Regression classifier
- Outputs: Depression probability, Anxiety probability, Risk Level
"""

import numpy as np
import logging
from typing import Dict, Any, Tuple
from dataclasses import dataclass
from enum import Enum

from services.nlp_service import NLPFeatures

logger = logging.getLogger(__name__)


class RiskLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass
class RiskAssessment:
    depression_probability: float
    anxiety_probability: float
    risk_level: RiskLevel
    risk_score: float
    contributing_factors: list
    feature_vector: list
    phq9_severity: str
    gad7_severity: str


def phq9_severity(score: int) -> str:
    if score <= 4:   return "Minimal"
    if score <= 9:   return "Mild"
    if score <= 14:  return "Moderate"
    if score <= 19:  return "Moderately Severe"
    return "Severe"


def gad7_severity(score: int) -> str:
    if score <= 4:   return "Minimal"
    if score <= 9:   return "Mild"
    if score <= 14:  return "Moderate"
    return "Severe"


class FeatureFusionModule:
    """Combines NLP features with questionnaire scores into a unified feature vector."""

    def build_vector(
        self,
        nlp_features: NLPFeatures,
        phq9_score: int,
        gad7_score: int,
        mood_score: int
    ) -> np.ndarray:
        """
        Feature vector (18 dimensions):
        [0]  sentiment_score (normalized -1 to 1)
        [1]  emotion_confidence
        [2]  negative_keyword_count (normalized)
        [3]  hopelessness_indicators (normalized)
        [4]  stress_indicators (normalized)
        [5]  sleep_related_words (normalized)
        [6]  self_harm_flag (0/1)
        [7]  sadness_score (from emotion distribution)
        [8]  fear_score (from emotion distribution)
        [9]  anger_score (from emotion distribution)
        [10] joy_score (from emotion distribution, inverted)
        [11] phq9_normalized (0-27 → 0-1)
        [12] gad7_normalized (0-21 → 0-1)
        [13] mood_inverted (10-1 → 0-1, lower mood = higher risk)
        [14] phq9_severity_encoded
        [15] gad7_severity_encoded
        [16] combined_questionnaire_risk
        [17] marker_count (normalized)
        """
        ed = nlp_features.emotion_distribution

        sentiment_normalized = (nlp_features.sentiment_score + 1) / 2  # → 0-1, lower = worse
        sentiment_risk = 1 - sentiment_normalized  # Invert: negative sentiment = higher risk

        phq9_norm = min(phq9_score / 27.0, 1.0)
        gad7_norm = min(gad7_score / 21.0, 1.0)
        mood_risk = (10 - mood_score) / 9.0  # Low mood = high risk

        # PHQ-9 severity code (0-4)
        phq9_sev = 0 if phq9_score <= 4 else 1 if phq9_score <= 9 else 2 if phq9_score <= 14 else 3 if phq9_score <= 19 else 4
        gad7_sev = 0 if gad7_score <= 4 else 1 if gad7_score <= 9 else 2 if gad7_score <= 14 else 3

        combined_q = (phq9_norm * 0.5 + gad7_norm * 0.35 + mood_risk * 0.15)

        vector = np.array([
            sentiment_risk,
            nlp_features.emotion_confidence,
            min(nlp_features.negative_keyword_count / 10.0, 1.0),
            min(nlp_features.hopelessness_indicators / 5.0, 1.0),
            min(nlp_features.stress_indicators / 5.0, 1.0),
            min(nlp_features.sleep_related_words / 3.0, 1.0),
            1.0 if nlp_features.self_harm_related_terms > 0 else 0.0,
            ed.get("sadness", 0),
            ed.get("fear", 0),
            ed.get("anger", 0),
            1 - ed.get("joy", 0.5),  # Invert joy
            phq9_norm,
            gad7_norm,
            mood_risk,
            phq9_sev / 4.0,
            gad7_sev / 3.0,
            combined_q,
            min(len(nlp_features.psychological_markers) / 6.0, 1.0)
        ], dtype=np.float32)

        return vector


class RiskClassifier:
    """
    Logistic Regression classifier for mental health risk.
    Uses calibrated weights based on clinical literature thresholds.
    PHQ-9 ≥ 10 clinically significant depression.
    GAD-7 ≥ 10 clinically significant anxiety.
    """

    def __init__(self):
        self.fusion = FeatureFusionModule()

        # Depression weights (18 features)
        # PHQ-9 and hopelessness features have higher weight
        self._depression_weights = np.array([
            0.8,   # sentiment_risk
            0.3,   # emotion_confidence
            0.5,   # negative_keywords
            1.2,   # hopelessness (strong predictor)
            0.4,   # stress
            0.6,   # sleep
            2.0,   # self_harm (critical)
            1.0,   # sadness
            0.2,   # fear
            0.3,   # anger
            0.5,   # joy_inverted
            1.8,   # phq9_norm (primary scale)
            0.6,   # gad7_norm
            0.9,   # mood_risk
            1.5,   # phq9_severity
            0.4,   # gad7_severity
            0.8,   # combined_q
            0.7,   # marker_count
        ], dtype=np.float32)
        self._depression_bias = -1.2

        # Anxiety weights
        # GAD-7 and stress features have higher weight
        self._anxiety_weights = np.array([
            0.5,   # sentiment_risk
            0.4,   # emotion_confidence
            0.4,   # negative_keywords
            0.5,   # hopelessness
            1.3,   # stress (strong predictor for anxiety)
            0.5,   # sleep
            1.5,   # self_harm
            0.4,   # sadness
            1.2,   # fear (strong predictor for anxiety)
            0.5,   # anger
            0.4,   # joy_inverted
            0.7,   # phq9_norm
            1.9,   # gad7_norm (primary scale)
            0.6,   # mood_risk
            0.5,   # phq9_severity
            1.6,   # gad7_severity
            0.9,   # combined_q
            0.6,   # marker_count
        ], dtype=np.float32)
        self._anxiety_bias = -1.3

    def _sigmoid(self, x: float) -> float:
        return 1.0 / (1.0 + np.exp(-np.clip(x, -10, 10)))

    def classify(
        self,
        nlp_features: NLPFeatures,
        phq9_score: int,
        gad7_score: int,
        mood_score: int
    ) -> RiskAssessment:
        """Run risk classification pipeline."""

        vector = self.fusion.build_vector(nlp_features, phq9_score, gad7_score, mood_score)

        # Logistic Regression forward pass
        dep_logit = np.dot(self._depression_weights, vector) + self._depression_bias
        anx_logit = np.dot(self._anxiety_weights, vector) + self._anxiety_bias

        dep_prob = float(self._sigmoid(dep_logit))
        anx_prob = float(self._sigmoid(anx_logit))

        # Critical override: self-harm present
        if nlp_features.self_harm_related_terms > 0:
            dep_prob = max(dep_prob, 0.85)
            anx_prob = max(anx_prob, 0.70)

        # Overall risk score (composite)
        risk_score = (
            dep_prob * 0.45 +
            anx_prob * 0.35 +
            (phq9_score / 27.0) * 0.15 +
            (gad7_score / 21.0) * 0.05
        )

        # Risk level classification
        if risk_score >= 0.75 or nlp_features.self_harm_related_terms > 0:
            risk_level = RiskLevel.CRITICAL
        elif risk_score >= 0.55:
            risk_level = RiskLevel.HIGH
        elif risk_score >= 0.35:
            risk_level = RiskLevel.MODERATE
        else:
            risk_level = RiskLevel.LOW

        # Contributing factors narrative
        factors = []
        if phq9_score >= 10:
            factors.append(f"PHQ-9 score of {phq9_score} indicates clinically significant depression")
        if gad7_score >= 10:
            factors.append(f"GAD-7 score of {gad7_score} indicates clinically significant anxiety")
        if nlp_features.hopelessness_indicators > 0:
            factors.append("Hopelessness language detected in conversation")
        if nlp_features.self_harm_related_terms > 0:
            factors.append("⚠️ Self-harm related language detected — immediate clinical review required")
        if nlp_features.sleep_related_words > 0:
            factors.append("Sleep disturbance indicators present")
        if nlp_features.stress_indicators > 2:
            factors.append("Elevated stress language patterns")
        if mood_score <= 3:
            factors.append(f"Reported mood score of {mood_score}/10 — critically low")
        elif mood_score <= 5:
            factors.append(f"Reported mood score of {mood_score}/10 — below average")
        if nlp_features.sentiment_label == "NEGATIVE":
            factors.append("Predominantly negative sentiment throughout conversation")

        return RiskAssessment(
            depression_probability=round(dep_prob, 4),
            anxiety_probability=round(anx_prob, 4),
            risk_level=risk_level,
            risk_score=round(risk_score, 4),
            contributing_factors=factors,
            feature_vector=vector.tolist(),
            phq9_severity=phq9_severity(phq9_score),
            gad7_severity=gad7_severity(gad7_score)
        )


risk_classifier = RiskClassifier()
