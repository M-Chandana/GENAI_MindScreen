"""
Pydantic Data Models - Request/Response schemas
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class RiskLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# ── Auth Models ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "patient"  # patient | clinician


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str


# ── Questionnaire Models ─────────────────────────────────────────────────────

class PHQ9Response(BaseModel):
    """PHQ-9: 9 questions, each 0-3 (Not at all / Several days / More than half / Nearly every day)"""
    answers: List[int] = Field(..., min_items=9, max_items=9,
                                description="List of 9 answers (0-3)")

    @property
    def total_score(self) -> int:
        return sum(self.answers)


class GAD7Response(BaseModel):
    """GAD-7: 7 questions, each 0-3"""
    answers: List[int] = Field(..., min_items=7, max_items=7,
                                description="List of 7 answers (0-3)")

    @property
    def total_score(self) -> int:
        return sum(self.answers)


# ── Assessment Models ────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    timestamp: Optional[datetime] = None


class AssessmentSubmitRequest(BaseModel):
    patient_id: str
    conversation: List[ChatMessage]
    phq9_answers: List[int] = Field(..., min_items=9, max_items=9)
    gad7_answers: List[int] = Field(..., min_items=7, max_items=7)
    mood_score: int = Field(..., ge=1, le=10)
    patient_name: Optional[str] = "Anonymous"


class NLPFeaturesResponse(BaseModel):
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


class RiskAssessmentResponse(BaseModel):
    depression_probability: float
    anxiety_probability: float
    risk_level: RiskLevel
    risk_score: float
    contributing_factors: List[str]
    phq9_severity: str
    gad7_severity: str


class AssessmentResponse(BaseModel):
    assessment_id: str
    patient_id: str
    created_at: datetime
    nlp_features: NLPFeaturesResponse
    risk_assessment: RiskAssessmentResponse
    report: Dict[str, Any]
    phq9_score: int
    gad7_score: int
    mood_score: int


# ── Dashboard Models ─────────────────────────────────────────────────────────

class PatientSummary(BaseModel):
    patient_id: str
    patient_name: str
    assessment_id: str
    created_at: datetime
    risk_level: RiskLevel
    depression_probability: float
    anxiety_probability: float
    phq9_score: int
    gad7_score: int
    mood_score: int
    primary_emotion: str


class DashboardStats(BaseModel):
    total_assessments: int
    critical_count: int
    high_count: int
    moderate_count: int
    low_count: int
    avg_phq9: float
    avg_gad7: float
    avg_mood: float
