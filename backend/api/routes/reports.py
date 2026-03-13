"""Reports API Routes"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from api.routes.assessment import _assessments
from services.pdf_service import generate_pdf_report

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
