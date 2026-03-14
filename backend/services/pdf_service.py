"""
PDF Report Generator using ReportLab
Generates professional clinical-style PDF reports
"""

import io
import logging
from datetime import datetime
from typing import Dict, Any

logger = logging.getLogger(__name__)


def generate_pdf_report(report_data: Dict[str, Any], patient_name: str = "Patient") -> bytes:
    """Generate a clinical PDF report from report data."""
    try:
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, KeepTogether
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics.charts.barcharts import VerticalBarChart
        from reportlab.graphics.charts.legends import Legend

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch
        )

        # ── Color Palette ────────────────────────────────────────────────────
        DEEP_TEAL = colors.HexColor('#0d4f6c')
        MED_TEAL = colors.HexColor('#1a7a9a')
        LIGHT_TEAL = colors.HexColor('#e8f4f8')
        ACCENT_BLUE = colors.HexColor('#2196F3')
        CRITICAL_RED = colors.HexColor('#d32f2f')
        HIGH_ORANGE = colors.HexColor('#f57c00')
        MOD_YELLOW = colors.HexColor('#f9a825')
        LOW_GREEN = colors.HexColor('#388e3c')
        TEXT_DARK = colors.HexColor('#1a1a2e')
        TEXT_GRAY = colors.HexColor('#546e7a')
        BG_LIGHT = colors.HexColor('#f0f7fa')

        risk_colors = {
            "CRITICAL": CRITICAL_RED, "HIGH": HIGH_ORANGE,
            "MODERATE": MOD_YELLOW, "LOW": LOW_GREEN
        }

        # ── Styles ───────────────────────────────────────────────────────────
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle('Title', fontSize=20, textColor=DEEP_TEAL,
                                      spaceAfter=4, fontName='Helvetica-Bold', alignment=TA_CENTER)
        subtitle_style = ParagraphStyle('Subtitle', fontSize=11, textColor=MED_TEAL,
                                         spaceAfter=2, fontName='Helvetica', alignment=TA_CENTER)
        disclaimer_style = ParagraphStyle('Disclaimer', fontSize=8, textColor=TEXT_GRAY,
                                           spaceAfter=8, fontName='Helvetica-Oblique',
                                           alignment=TA_CENTER, borderPadding=6)
        section_header_style = ParagraphStyle('SectionHeader', fontSize=12, textColor=DEEP_TEAL,
                                               spaceBefore=14, spaceAfter=6,
                                               fontName='Helvetica-Bold', borderPadding=(0, 0, 4, 0))
        body_style = ParagraphStyle('Body', fontSize=9.5, textColor=TEXT_DARK,
                                     spaceAfter=6, fontName='Helvetica',
                                     leading=14, alignment=TA_JUSTIFY)
        meta_key_style = ParagraphStyle('MetaKey', fontSize=9, textColor=TEXT_GRAY,
                                         fontName='Helvetica-Bold')
        meta_val_style = ParagraphStyle('MetaVal', fontSize=9, textColor=TEXT_DARK,
                                         fontName='Helvetica')

        # ── Build Content ────────────────────────────────────────────────────
        story = []
        meta = report_data.get("metadata", {})
        sections = report_data.get("sections", {})
        risk_level = meta.get("risk_level", "UNKNOWN")
        risk_color = risk_colors.get(risk_level, TEXT_GRAY)

        # Header
        story.append(Paragraph("MindScreen", title_style))
        story.append(Paragraph("AI-Powered Mental Health Pre-Assessment Report", subtitle_style))
        story.append(Spacer(1, 6))
        story.append(HRFlowable(width="100%", thickness=2, color=DEEP_TEAL))
        story.append(Spacer(1, 4))

        # Disclaimer box
        disclaimer_table = Table(
            [[Paragraph(report_data.get("disclaimer", "Decision support tool only."), disclaimer_style)]],
            colWidths=['100%']
        )
        disclaimer_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BG_LIGHT),
            ('BOX', (0, 0), (-1, -1), 0.5, MED_TEAL),
            ('ROUNDEDCORNERS', [4]),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(disclaimer_table)
        story.append(Spacer(1, 12))

        # Patient & report info table
        now = datetime.utcnow().strftime("%B %d, %Y at %H:%M UTC")
        info_data = [
            [Paragraph("Patient:", meta_key_style), Paragraph(patient_name, meta_val_style),
             Paragraph("Generated:", meta_key_style), Paragraph(now, meta_val_style)],
            [Paragraph("Patient ID:", meta_key_style), Paragraph(report_data.get("patient_id", "N/A"), meta_val_style),
             Paragraph("Assessment:", meta_key_style), Paragraph("Mental Health Pre-Screening", meta_val_style)],
        ]
        info_table = Table(info_data, colWidths=[1.2*inch, 2.3*inch, 1.2*inch, 2.3*inch])
        info_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, BG_LIGHT]),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 12))

        # Risk Summary Banner
        risk_data = [[
            Paragraph(f"RISK LEVEL: {risk_level}", ParagraphStyle(
                'RiskBanner', fontSize=14, textColor=colors.white,
                fontName='Helvetica-Bold', alignment=TA_CENTER
            )),
            Paragraph(
                f"Depression Risk: {meta.get('depression_probability', 0):.0%}   |   "
                f"Anxiety Risk: {meta.get('anxiety_probability', 0):.0%}",
                ParagraphStyle('RiskSub', fontSize=10, textColor=colors.white,
                               fontName='Helvetica', alignment=TA_CENTER)
            )
        ]]
        risk_table = Table([[
            Paragraph(f"RISK LEVEL: {risk_level}", ParagraphStyle(
                'RiskBanner', fontSize=14, textColor=colors.white,
                fontName='Helvetica-Bold', alignment=TA_CENTER
            )),
        ]], colWidths=['100%'])
        risk_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), risk_color),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LEFTPADDING', (0, 0), (-1, -1), 16),
            ('RIGHTPADDING', (0, 0), (-1, -1), 16),
        ]))
        story.append(risk_table)
        story.append(Spacer(1, 4))
        
        # ── Visual Analytics Section (Graph) ─────────────────────────────────
        story.append(Paragraph("Visual Analysis", section_header_style))
        story.append(HRFlowable(width="100%", thickness=1, color=MED_TEAL))
        story.append(Spacer(1, 10))
        
        # Chart Data: Normalize scores to percentages for comparison
        phq_pct = (meta.get('phq9_score', 0) / 27) * 100
        gad_pct = (meta.get('gad7_score', 0) / 21) * 100
        mood_pct = (meta.get('mood_score', 0) / 10) * 100
        
        drawing = Drawing(400, 150)
        bc = VerticalBarChart()
        bc.x = 50
        bc.y = 50
        bc.height = 100
        bc.width = 300
        bc.data = [[phq_pct, gad_pct, mood_pct]]
        bc.strokeColor = colors.white
        bc.valueAxis.valueMin = 0
        bc.valueAxis.valueMax = 100
        bc.valueAxis.valueStep = 20
        bc.categoryAxis.labels.boxAnchor = 'ne'
        bc.categoryAxis.labels.dx = 8
        bc.categoryAxis.labels.dy = -2
        bc.categoryAxis.categoryNames = ['Depression (PHQ)', 'Anxiety (GAD)', 'Mood (Self)']
        bc.bars[0].fillColor = MED_TEAL
        
        drawing.add(bc)
        story.append(drawing)
        story.append(Paragraph("<center><i>Normalized Severity Index (%)</i></center>", body_style))
        story.append(Spacer(1, 12))

        # Score summary
        scores_data = [
            ["Metric", "Score", "Severity / Category"],
            ["PHQ-9 (Depression)", f"{meta.get('phq9_score', 0)}/27", meta.get('phq9_severity', 'N/A')],
            ["GAD-7 (Anxiety)", f"{meta.get('gad7_score', 0)}/21", meta.get('gad7_severity', 'N/A')],
            ["Mood Self-Report", f"{meta.get('mood_score', 0)}/10", "Patient-reported"],
            ["Primary Emotion", meta.get('primary_emotion', 'N/A').title(), meta.get('sentiment', 'N/A')],
        ]
        scores_table = Table(scores_data, colWidths=[2.2*inch, 1.5*inch, 3.3*inch])
        scores_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), DEEP_TEAL),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_TEAL]),
            ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#cccccc')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(scores_table)
        story.append(Spacer(1, 16))
        
        # ── Conversational Insight (Pre-PHQ/GAD Summary) ─────────────────────
        if meta.get("conversation_summary"):
            story.append(Paragraph("Conversational Clinical Insight", section_header_style))
            story.append(HRFlowable(width="100%", thickness=1, color=MED_TEAL))
            story.append(Spacer(1, 4))
            story.append(Paragraph(meta["conversation_summary"], body_style))
            story.append(Spacer(1, 12))

        # Report sections
        section_order = [
            ("clinical_summary", "0. Clinical Summary"),
            ("emotional_overview", "1. Emotional Overview"),
            ("behavioral_observations", "2. Behavioral Observations"),
            ("depression_risk_analysis", "3. Depression Risk Analysis"),
            ("anxiety_risk_analysis", "4. Anxiety Risk Analysis"),
            ("warning_signs", "5. Warning Signs Detected"),
            ("recommended_next_steps", "6. Recommended Next Steps"),
            ("consultation_recommendation", "7. Professional Consultation Recommendation"),
        ]

        for key, title in section_order:
            content = sections.get(key, "Not generated.")
            story.append(Paragraph(title, section_header_style))
            story.append(HRFlowable(width="100%", thickness=0.5, color=MED_TEAL))
            story.append(Spacer(1, 4))
            for para in content.split('\n\n'):
                if para.strip():
                    story.append(Paragraph(para.strip().replace('\n', ' '), body_style))
            story.append(Spacer(1, 8))

        # Footer keywords
        if meta.get('detected_keywords'):
            story.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT_TEAL))
            story.append(Spacer(1, 6))
            keywords_str = "Detected Keywords: " + ", ".join(meta['detected_keywords'][:15])
            story.append(Paragraph(keywords_str, ParagraphStyle(
                'Keywords', fontSize=8, textColor=TEXT_GRAY, fontName='Helvetica-Oblique'
            )))

        # Build PDF
        doc.build(story)
        return buffer.getvalue()

    except ImportError:
        logger.error("ReportLab not installed. Cannot generate PDF.")
        return b""
    except Exception as e:
        logger.error(f"PDF generation error: {e}")
        raise
