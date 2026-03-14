"""Reports API Routes"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from api.routes.assessment import _assessments
from services.pdf_service import generate_pdf_report
from typing import Dict, Any

router = APIRouter()

@router.get("/{assessment_id}/pdf")
async def download_pdf_report(assessment_id: str):
    """Generate and download PDF report."""
    assessment = _assessments.get(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    try:
        pdf_bytes = generate_pdf_report(
            assessment["report"],
            patient_name=assessment.get("patient_name", "Patient")
        )
        if not pdf_bytes:
            raise HTTPException(status_code=500, detail="PDF generation failed - ReportLab may not be installed")
        
        filename = f"mindscreen_report_{assessment_id[:8]}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/demo/pdf")
async def generate_demo_pdf(data: Dict[str, Any]):
    """Generate a PDF for demo data without saving it."""
    try:
        report_data = data.get("report", {})
        patient_name = data.get("patient_name", "Demo Patient")
        assessment_id = data.get("assessment_id", "demo")
        
        pdf_bytes = generate_pdf_report(report_data, patient_name=patient_name)
        if not pdf_bytes:
            raise HTTPException(status_code=500, detail="PDF generation failed - ReportLab may not be installed")
            
        filename = f"mindscreen_report_{assessment_id[:8]}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
