"""Dashboard API Routes"""
from fastapi import APIRouter
from api.routes.assessment import _assessments
import statistics

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats():
    """Get aggregate statistics for the dashboard."""
    all_a = list(_assessments.values())
    if not all_a:
        return {"total_assessments": 0, "critical_count": 0, "high_count": 0,
                "moderate_count": 0, "low_count": 0, "avg_phq9": 0, "avg_gad7": 0, "avg_mood": 0}

    risk_counts = {"CRITICAL": 0, "HIGH": 0, "MODERATE": 0, "LOW": 0}
    for a in all_a:
        rl = a["risk_assessment"]["risk_level"]
        risk_counts[rl] = risk_counts.get(rl, 0) + 1

    return {
        "total_assessments": len(all_a),
        "critical_count": risk_counts["CRITICAL"],
        "high_count": risk_counts["HIGH"],
        "moderate_count": risk_counts["MODERATE"],
        "low_count": risk_counts["LOW"],
        "avg_phq9": round(statistics.mean(a["phq9_score"] for a in all_a), 1),
        "avg_gad7": round(statistics.mean(a["gad7_score"] for a in all_a), 1),
        "avg_mood": round(statistics.mean(a["mood_score"] for a in all_a), 1),
    }

@router.get("/patients")
async def get_all_patients():
    """Get patient list for dashboard."""
    all_a = list(_assessments.values())
    return sorted([
        {
            "patient_id": a["patient_id"],
            "patient_name": a.get("patient_name", "Anonymous"),
            "assessment_id": a["assessment_id"],
            "created_at": a["created_at"],
            "risk_level": a["risk_assessment"]["risk_level"],
            "depression_probability": a["risk_assessment"]["depression_probability"],
            "anxiety_probability": a["risk_assessment"]["anxiety_probability"],
            "phq9_score": a["phq9_score"],
            "gad7_score": a["gad7_score"],
            "mood_score": a["mood_score"],
            "primary_emotion": a["nlp_features"]["emotion_label"],
        }
        for a in all_a
    ], key=lambda x: x["created_at"], reverse=True)
