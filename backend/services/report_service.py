"""
Report Generation Service
- Uses Gemini (Free) or Anthropic (Paid) for clinical-style reports
- Fallback to template-based generation
"""

import logging
import os
from datetime import datetime
from typing import Dict, Any, Optional

from services.nlp_service import NLPFeatures
from services.risk_service import RiskAssessment, RiskLevel

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


class ReportGenerator:
    """
    Generates clinical-style psychological pre-assessment reports.
    Primary: Gemini 1.5 Flash (Free Tier)
    Secondary: Anthropic Claude API
    """

    def __init__(self):
        self.has_gemini = bool(GEMINI_API_KEY and "your_" not in GEMINI_API_KEY)
        self.has_anthropic = bool(ANTHROPIC_API_KEY and "your_" not in ANTHROPIC_API_KEY)
        self._llm_available = self.has_gemini or self.has_anthropic

    async def generate_report(
        self,
        patient_id: str,
        nlp_features: NLPFeatures,
        risk_assessment: RiskAssessment,
        phq9_score: int,
        gad7_score: int,
        mood_score: int,
        conversation_summary: str,
        phq9_answers: list,
        gad7_answers: list,
        patient_name: str = "Patient"
    ) -> Dict[str, Any]:
        """Generate full psychological pre-assessment report."""

        report_data = {
            "patient_id": patient_id,
            "patient_name": patient_name,
            "generated_at": datetime.utcnow().isoformat(),
            "assessment_type": "Mental Health Pre-Assessment",
            "disclaimer": (
                "This is an AI-generated pre-screening report intended to assist "
                "licensed mental health professionals. It does NOT constitute a diagnosis."
            ),
            "sections": {}
        }

        try:
            if self.has_gemini:
                sections = await self._generate_with_gemini(
                    nlp_features, risk_assessment, phq9_score, gad7_score,
                    mood_score, conversation_summary, patient_name
                )
            elif self.has_anthropic:
                sections = await self._generate_with_llm( # Original LLM logic (Anthropic)
                    nlp_features, risk_assessment, phq9_score, gad7_score,
                    mood_score, conversation_summary, patient_name
                )
            else:
                sections = self._generate_template_report(
                    nlp_features, risk_assessment, phq9_score, gad7_score,
                    mood_score, conversation_summary, patient_name
                )
        except Exception as e:
            logger.error(f"Report generation error: {e}")
            sections = self._generate_template_report(
                nlp_features, risk_assessment, phq9_score, gad7_score,
                mood_score, conversation_summary, patient_name
            )

        report_data["sections"] = sections
        report_data["metadata"] = {
            "risk_level": risk_assessment.risk_level.value,
            "depression_probability": risk_assessment.depression_probability,
            "anxiety_probability": risk_assessment.anxiety_probability,
            "phq9_score": phq9_score,
            "phq9_severity": risk_assessment.phq9_severity,
            "gad7_score": gad7_score,
            "gad7_severity": risk_assessment.gad7_severity,
            "mood_score": mood_score,
            "primary_emotion": nlp_features.emotion_label,
            "sentiment": nlp_features.sentiment_label,
            "detected_keywords": nlp_features.detected_keywords,
            "psychological_markers": nlp_features.psychological_markers
        }

        return report_data

    async def _generate_with_gemini(self, nlp, risk, phq9, gad7, mood, conversation, patient_name) -> Dict[str, str]:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = self._build_llm_prompt(nlp, risk, phq9, gad7, mood, conversation, patient_name)
        response = model.generate_content(prompt)
        return self._parse_llm_response(response.text)

    async def _generate_with_llm(self, nlp, risk, phq9, gad7, mood, conversation, patient_name) -> Dict[str, str]:
        """Original Anthropic logic."""
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        prompt = self._build_llm_prompt(nlp, risk, phq9, gad7, mood, conversation, patient_name)
        message = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )
        return self._parse_llm_response(message.content[0].text)

    def _build_llm_prompt(self, nlp, risk, phq9, gad7, mood, conversation, patient_name) -> str:
        return f"""You are an AI clinical support system generating a personalized mental health pre-assessment report for {patient_name}.
Write a structured clinical-style report based on the following data.
Address {patient_name}'s specific situation based on their inputs.

ASSESSMENT DATA FOR {patient_name}:
- PHQ-9 Score: {phq9}/27 ({risk.phq9_severity} depression)
- GAD-7 Score: {gad7}/21 ({risk.gad7_severity} anxiety)
- Mood: {mood}/10
- Primary emotion: {nlp.emotion_label}
- Depression probability: {risk.depression_probability:.0%}
- Anxiety probability: {risk.anxiety_probability:.0%}
- Risk level: {risk.risk_level.value}
- Conversation: "{conversation[:500]}"

Use these exact headers:
## 0. CLINICAL SUMMARY
## 1. EMOTIONAL OVERVIEW
## 2. BEHAVIORAL OBSERVATIONS
## 3. DEPRESSION RISK ANALYSIS
## 4. ANXIETY RISK ANALYSIS
## 5. WARNING SIGNS DETECTED
## 6. RECOMMENDED NEXT STEPS
## 7. PROFESSIONAL CONSULTATION RECOMMENDATION"""

    def _parse_llm_response(self, text: str) -> Dict[str, str]:
        sections = {}
        section_map = {
            "0. CLINICAL SUMMARY": "clinical_summary",
            "1. EMOTIONAL OVERVIEW": "emotional_overview",
            "2. BEHAVIORAL OBSERVATIONS": "behavioral_observations",
            "3. DEPRESSION RISK ANALYSIS": "depression_risk_analysis",
            "4. ANXIETY RISK ANALYSIS": "anxiety_risk_analysis",
            "5. WARNING SIGNS DETECTED": "warning_signs",
            "6. RECOMMENDED NEXT STEPS": "recommended_next_steps",
            "7. PROFESSIONAL CONSULTATION RECOMMENDATION": "consultation_recommendation"
        }
        current_section = None
        current_content = []
        for line in text.split('\n'):
            matched = False
            for header, key in section_map.items():
                if header in line:
                    if current_section: sections[current_section] = '\n'.join(current_content).strip()
                    current_section = key
                    current_content = []
                    matched = True
                    break
            if not matched and current_section: current_content.append(line)
        if current_section: sections[current_section] = '\n'.join(current_content).strip()
        for key in section_map.values():
            if key not in sections: sections[key] = "Insufficient data."
        return sections

    def _generate_template_report(self, nlp, risk, phq9, gad7, mood, conversation, patient_name) -> Dict[str, str]:
        # Simple template (already personalized in previous step)
        return {
            "clinical_summary": f"Initial assessment for {patient_name} based on core emotional markers and scoring.",
            "emotional_overview": f"The patient {patient_name} shows {nlp.sentiment_label.lower()} tone.",
            "behavioral_observations": f"Detected markers: {', '.join(nlp.psychological_markers)}",
            "depression_risk_analysis": f"PHQ-9: {phq9} ({risk.phq9_severity})",
            "anxiety_risk_analysis": f"GAD-7: {gad7} ({risk.gad7_severity})",
            "warning_signs": "No critical signs." if risk.risk_level != RiskLevel.CRITICAL else "CRITICAL RISK.",
            "recommended_next_steps": "Follow up in 1-2 weeks.",
            "consultation_recommendation": "Standard follow-up."
        }


report_generator = ReportGenerator()
