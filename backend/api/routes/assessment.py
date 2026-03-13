"""
Assessment API Routes
- POST /api/assessment/submit - Full assessment pipeline
- GET /api/assessment/{id} - Get assessment result
- GET /api/assessment/patient/{patient_id} - List patient assessments
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from datetime import datetime
import uuid
import logging
from typing import List

from models.schemas import AssessmentSubmitRequest, AssessmentResponse
from services.nlp_service import nlp_processor
from services.risk_service import risk_classifier
from services.report_service import report_generator
from services.llm_service import llm_service

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory storage
_assessments = {}

@router.post("/chat")
async def adaptive_chat(request: dict):
    """Get next adaptive question from LLM."""
    conversation = request.get("conversation", [])
    question = await llm_service.get_next_question(conversation)
    return {"question": question}


@router.post("/submit", response_model=dict)
async def submit_assessment(request: AssessmentSubmitRequest):
    """
    Full assessment pipeline:
    1. Extract user messages
    2. Run NLP analysis
    3. Score questionnaires
    4. Risk classification
    5. Generate report
    """
    try:
        assessment_id = str(uuid.uuid4())
        logger.info(f"Processing assessment {assessment_id} for patient {request.patient_id}")

        # Extract user messages for NLP
        user_messages = [
            msg.content for msg in request.conversation
            if msg.role == "user"
        ]

        if not user_messages:
            raise HTTPException(status_code=400, detail="No user messages found in conversation")

        # ── Step 1: NLP Analysis ─────────────────────────────────────────
        nlp_features = nlp_processor.analyze(user_messages)
        logger.info(f"NLP complete: sentiment={nlp_features.sentiment_label}, emotion={nlp_features.emotion_label}")

        # ── Step 2: Questionnaire Scores ─────────────────────────────────
        phq9_score = sum(request.phq9_answers)
        gad7_score = sum(request.gad7_answers)
        mood_score = request.mood_score

        # ── Step 3: Risk Classification ──────────────────────────────────
        risk_assessment = risk_classifier.classify(
            nlp_features, phq9_score, gad7_score, mood_score
        )
        logger.info(f"Risk: {risk_assessment.risk_level.value} (dep={risk_assessment.depression_probability:.2f})")

        # ── Step 4: Generate Report ──────────────────────────────────────
        conversation_summary = await llm_service.summarize_conversation(request.conversation)
        report = await report_generator.generate_report(
            patient_id=request.patient_id,
            nlp_features=nlp_features,
            risk_assessment=risk_assessment,
            phq9_score=phq9_score,
            gad7_score=gad7_score,
            mood_score=mood_score,
            conversation_summary=conversation_summary,
            phq9_answers=request.phq9_answers,
            gad7_answers=request.gad7_answers,
            patient_name=request.patient_name
        )

        # ── Step 5: Store Result ─────────────────────────────────────────
        result = {
            "assessment_id": assessment_id,
            "patient_id": request.patient_id,
            "patient_name": request.patient_name,
            "created_at": datetime.utcnow().isoformat(),
            "nlp_features": {
                "sentiment_score": nlp_features.sentiment_score,
                "sentiment_label": nlp_features.sentiment_label,
                "emotion_label": nlp_features.emotion_label,
                "emotion_confidence": nlp_features.emotion_confidence,
                "emotion_distribution": nlp_features.emotion_distribution,
                "negative_keyword_count": nlp_features.negative_keyword_count,
                "hopelessness_indicators": nlp_features.hopelessness_indicators,
                "stress_indicators": nlp_features.stress_indicators,
                "sleep_related_words": nlp_features.sleep_related_words,
                "self_harm_related_terms": nlp_features.self_harm_related_terms,
                "detected_keywords": nlp_features.detected_keywords,
                "psychological_markers": nlp_features.psychological_markers
            },
            "risk_assessment": {
                "depression_probability": risk_assessment.depression_probability,
                "anxiety_probability": risk_assessment.anxiety_probability,
                "risk_level": risk_assessment.risk_level.value,
                "risk_score": risk_assessment.risk_score,
                "contributing_factors": risk_assessment.contributing_factors,
                "phq9_severity": risk_assessment.phq9_severity,
                "gad7_severity": risk_assessment.gad7_severity
            },
            "report": report,
            "phq9_score": phq9_score,
            "phq9_answers": request.phq9_answers,
            "gad7_score": gad7_score,
            "gad7_answers": request.gad7_answers,
            "mood_score": mood_score,
            "conversation": [
                {"role": m.role, "content": m.content}
                for m in request.conversation
            ]
        }

        _assessments[assessment_id] = result

        logger.info(f"Assessment {assessment_id} complete")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Assessment pipeline error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Assessment processing failed: {str(e)}")


@router.get("/{assessment_id}")
async def get_assessment(assessment_id: str):
    """Retrieve a specific assessment by ID."""
    result = _assessments.get(assessment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/patient/{patient_id}")
async def get_patient_assessments(patient_id: str):
    """Get all assessments for a patient."""
    results = [
        a for a in _assessments.values()
        if a["patient_id"] == patient_id
    ]
    return sorted(results, key=lambda x: x["created_at"], reverse=True)


@router.get("/")
async def list_assessments(limit: int = 50):
    """List all assessments (for dashboard)."""
    all_results = list(_assessments.values())
    return sorted(all_results, key=lambda x: x["created_at"], reverse=True)[:limit]
