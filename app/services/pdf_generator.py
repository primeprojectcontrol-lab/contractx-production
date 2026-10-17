import io
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
)

def build_contract_review_pdf(review_data: Dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    story = []
    styles = getSampleStyleSheet()

    # Custom Color Palette
    PRIMARY = colors.HexColor("#1E293B")      # Dark Slate
    SECONDARY = colors.HexColor("#0F172A")    # Deep Navy
    ACCENT_RED = colors.HexColor("#DC2626")   # Critical Risk
    ACCENT_AMBER = colors.HexColor("#D97706") # Medium Risk
    ACCENT_GREEN = colors.HexColor("#16A34A") # Low Risk
    TEXT_MUTED = colors.HexColor("#64748B")
    BG_LIGHT = colors.HexColor("#F8FAFC")

    # Custom Typography Styles
    style_title = ParagraphStyle(
        "DocTitle", parent=styles["Heading1"],
        fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=PRIMARY
    )
    style_subtitle = ParagraphStyle(
        "DocSubTitle", parent=styles["Normal"],
        fontName="Helvetica", fontSize=10, leading=14, textColor=TEXT_MUTED
    )
    style_h2 = ParagraphStyle(
        "SectionH2", parent=styles["Heading2"],
        fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=SECONDARY, spaceBefore=12, spaceAfter=6
    )
    style_body = ParagraphStyle(
        "Body", parent=styles["Normal"],
        fontName="Helvetica", fontSize=9, leading=13, textColor=PRIMARY
    )
    style_table_header = ParagraphStyle(
        "TableHeader", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=colors.white
    )

    # --- Header Banner ---
    story.append(Paragraph("ContractX.ai | Executive Contract Risk Audit", style_title))
    story.append(Spacer(1, 4))
    meta_text = f"Project: {review_data.get('project_name', 'Default Project')} | Document: {review_data.get('document_name', 'Sub-Contract Agreement')} | Region: {review_data.get('region', 'UAE_GCC')}"
    story.append(Paragraph(meta_text, style_subtitle))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceAfter=15))

    # --- Executive Summary & Overall Risk ---
    risk_level = review_data.get("overall_risk", "HIGH").upper()
    badge_color = ACCENT_RED if "HIGH" in risk_level or "CRITICAL" in risk_level else (ACCENT_AMBER if "MEDIUM" in risk_level else ACCENT_GREEN)

    summary_html = f"<b>Overall Contract Risk Profile:</b> <font color='{badge_color.hexval()}'><b>{risk_level}</b></font><br/><br/>{review_data.get('executive_summary', '')}"
    
    summary_table = Table([[Paragraph(summary_html, style_body)]], colWidths=[540])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('PADDING', (0,0), (-1,-1), 10),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 15))

    # --- Key Deviations & Onerous Clauses ---
    story.append(Paragraph("Contractual Deviations & Risk Matrix", style_h2))

    table_data = [[
        Paragraph("Executed Clause", style_table_header),
        Paragraph("Standard Reference", style_table_header),
        Paragraph("Identified Deviation & Impact", style_table_header),
        Paragraph("Risk Level", style_table_header)
    ]]

    deviations: List[Dict[str, Any]] = review_data.get("contractual_flaws_and_deviations", [])
    
    for dev in deviations:
        r_level = dev.get("risk_level", "MEDIUM").upper()
        r_color = ACCENT_RED if "CRITICAL" in r_level or "HIGH" in r_level else (ACCENT_AMBER if "MEDIUM" in r_level else ACCENT_GREEN)
        
        table_data.append([
            Paragraph(f"<b>{dev.get('executed_clause', 'N/A')}</b>", style_body),
            Paragraph(dev.get("standard_reference", "N/A"), style_body),
            Paragraph(f"<b>{dev.get('issue', '')}</b><br/><font color='{TEXT_MUTED.hexval()}'>{dev.get('impact_analysis', '')}</font>", style_body),
            Paragraph(f"<font color='{r_color.hexval()}'><b>{r_level}</b></font>", style_body)
        ])

    dev_table = Table(table_data, colWidths=[90, 110, 260, 80])
    dev_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(dev_table)
    story.append(Spacer(1, 15))

    # --- Strategic Recommendations ---
    story.append(Paragraph("Strategic Legal Advisory & Risk Mitigation", style_h2))
    rec_text = review_data.get("advisory_recommendation", "No specific recommendations provided.")
    rec_table = Table([[Paragraph(rec_text, style_body)]], colWidths=[540])
    rec_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#FEF2F2")),
        ('PADDING', (0,0), (-1,-1), 10),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#FECACA")),
    ]))
    story.append(rec_table)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
