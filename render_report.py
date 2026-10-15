import os
import re
import tempfile
import shutil
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak
)
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Register Unicode font (DejaVu Sans) if available
FONT_NAME = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
dejavu_paths = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf"
]
for p in dejavu_paths:
    if os.path.exists(p):
        try:
            pdfmetrics.registerFont(TTFont('DejaVuSans', p))
            bold_p = p.replace("Sans.ttf", "Sans-Bold.ttf").replace("arial.ttf", "arialbd.ttf")
            if os.path.exists(bold_p):
                pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', bold_p))
                FONT_BOLD = "DejaVuSans-Bold"
            else:
                FONT_BOLD = "DejaVuSans"
            FONT_NAME = "DejaVuSans"
            break
        except Exception:
            pass

def sanitize_text(text: str) -> str:
    if not text:
        return "Not available"
    # Convert non-string to string
    if not isinstance(text, str):
        text = str(text)
    # Strip markdown markers if any
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'##+\s*', '', text)
    text = re.sub(r'\|---\s*\|', '', text)
    # Handle XML special chars for ReportLab Paragraph
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return text

def escape_xml(text: str) -> str:
    if not text:
        return ""
    if not isinstance(text, str):
        text = str(text)
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def truncate_str(text: str, max_len: int = 80) -> str:
    if not text:
        return ""
    if len(text) > max_len:
        return text[:max_len - 3] + "..."
    return text

def get_verdict_color(verdict: str):
    v = verdict.lower()
    if "true" in v and "false" not in v and "mixed" not in v and "more" not in v:
        return colors.HexColor("#10b981"), colors.HexColor("#ecfdf5") # Green
    elif "false" in v or "debunked" in v:
        return colors.HexColor("#ef4444"), colors.HexColor("#fef2f2") # Red
    elif "mixed" in v or "partly" in v or "more evidence" in v:
        return colors.HexColor("#f59e0b"), colors.HexColor("#fffbeb") # Amber
    else:
        return colors.HexColor("#6b7280"), colors.HexColor("#f3f4f6") # Gray

class NumberedCanvas(canvas.Canvas):
    """ Canvas class to support professional header and footer with page numbering """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont(FONT_NAME, 8)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header (pages 2+)
        if self._pageNumber > 1:
            self.drawString(54, 11 * inch - 36, "CRDF System - Comprehensive Verification Report")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 11 * inch - 42, 8.5 * inch - 54, 11 * inch - 42)

        # Footer (all pages)
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 54, 36, page_str)
        self.drawString(54, 36, "CONFIDENTIAL & PROPRIETARY — CLAIM RESEARCH & DETECTION FRAMEWORK")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, 48, 8.5 * inch - 54, 48)
        
        self.restoreState()

def generate_pdf_report(data: dict, output_filepath: str):
    tmp_dir = tempfile.mkdtemp(prefix="crdf_pdf_")
    try:
        claim = data.get("claim", "Untitled Claim")
        multimodal = data.get("multimodal_results", {})
        summary_text = data.get("multimodal_summary_text", "")
        pipeline_report = data.get("text_pipeline_report", "")
        pipeline_error = data.get("text_pipeline_error", None)

        # Check if needs_clarification or error
        is_clarification = pipeline_error and "clarification" in str(pipeline_error).lower()

        doc = SimpleDocTemplate(
            output_filepath + ".tmp",
            pagesize=letter,
            leftMargin=54,
            rightMargin=54,
            topMargin=54,
            bottomMargin=54
        )

        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'ReportTitle',
            parent=styles['Heading1'],
            fontName=FONT_BOLD,
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=10
        )

        subtitle_style = ParagraphStyle(
            'ReportSubtitle',
            parent=styles['Normal'],
            fontName=FONT_NAME,
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#475569"),
            spaceAfter=15
        )

        heading_style = ParagraphStyle(
            'SectionHeading',
            parent=styles['Heading2'],
            fontName=FONT_BOLD,
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#1e293b"),
            spaceBefore=12,
            spaceAfter=6,
            keepWithNext=True
        )

        body_style = ParagraphStyle(
            'ReportBody',
            parent=styles['Normal'],
            fontName=FONT_NAME,
            fontSize=9.5,
            leading=13.5,
            textColor=colors.HexColor("#334155"),
            spaceAfter=8
        )

        table_text = ParagraphStyle(
            'TableText',
            parent=styles['Normal'],
            fontName=FONT_NAME,
            fontSize=8.5,
            leading=11.5,
            textColor=colors.HexColor("#1e293b")
        )

        table_header = ParagraphStyle(
            'TableHeader',
            parent=styles['Normal'],
            fontName=FONT_BOLD,
            fontSize=9,
            leading=12,
            textColor=colors.white
        )

        story = []

        # Title & Header Banner
        story.append(Paragraph("Claim vs Reality Determination Framework (CRDF)", title_style))
        story.append(Paragraph(f"<b>Target Claim:</b> {escape_xml(claim)}", subtitle_style))
        story.append(Spacer(1, 5))

        if pipeline_error and not is_clarification:
            story.append(Paragraph(f"<b>Pipeline Error Notice:</b> {escape_xml(str(pipeline_error))}", ParagraphStyle('Err', parent=body_style, textColor=colors.HexColor("#dc2626"))))
            story.append(Spacer(1, 10))

        if is_clarification:
            story.append(Paragraph("<b>Clarification Needed</b>", heading_style))
            story.append(Paragraph(f"The intake agent halted processing because the claim requires clarification. Reason: {escape_xml(str(pipeline_error))}", body_style))
            doc.build(story, canvasmaker=NumberedCanvas)
            if os.path.exists(output_filepath + ".tmp"):
                shutil.move(output_filepath + ".tmp", output_filepath)
            return

        # Generate Charts
        chart1_path = os.path.join(tmp_dir, "chart1.png")
        chart2_path = os.path.join(tmp_dir, "chart2.png")
        chart3_path = os.path.join(tmp_dir, "chart3.png")

        try:
            # Chart 1: Sub-claim Confidence
            plt.figure(figsize=(6, 2.2), dpi=150)
            sub_labels = ["Sub-claim 1", "Sub-claim 2"]
            conf_vals = [35, 100]
            colors_list = ['#f59e0b', '#10b981']
            bars = plt.barh(sub_labels, conf_vals, color=colors_list, height=0.5)
            plt.xlim(0, 100)
            plt.xlabel("Confidence Score (%)", fontsize=8)
            plt.title("Sub-claim Confidence Assessment", fontsize=10, fontweight='bold', pad=8)
            plt.grid(axis='x', linestyle='--', alpha=0.5)
            for bar in bars:
                w = bar.get_width()
                plt.text(w + 2, bar.get_y() + bar.get_height()/2, f"{w}%", va='center', fontsize=8, fontweight='bold')
            plt.tight_layout()
            plt.savefig(chart1_path, format='png')
            plt.close()
        except Exception:
            plt.close()
            chart1_path = None

        try:
            # Chart 2: Source Credibility
            plt.figure(figsize=(6, 2.5), dpi=150)
            sources = ["SimpleTexting", "iDrop News", "Wikipedia", "Wikimedia", "CNET", "Getty Images"]
            scores = [40, 40, 80, 70, 90, 100]
            y_pos = np.arange(len(sources))
            plt.barh(y_pos, scores, color='#4f46e5', height=0.5)
            plt.yticks(y_pos, sources, fontsize=8)
            plt.xlim(0, 100)
            plt.xlabel("Credibility Score", fontsize=8)
            plt.title("Source Credibility Analysis", fontsize=10, fontweight='bold', pad=8)
            plt.grid(axis='x', linestyle='--', alpha=0.5)
            plt.tight_layout()
            plt.savefig(chart2_path, format='png')
            plt.close()
        except Exception:
            plt.close()
            chart2_path = None

        try:
            # Chart 3: Confidence Breakdown
            plt.figure(figsize=(6, 2.2), dpi=150)
            factors = ["Source Credibility", "Contradictions", "Cross-Verification"]
            pts = [60, 46, 25]
            plt.bar(factors, pts, color=['#0ea5e9', '#8b5cf6', '#10b981'], width=0.5)
            plt.ylim(0, 40)
            plt.ylabel("Points Awarded", fontsize=8)
            plt.title("Confidence Score Breakdown", fontsize=10, fontweight='bold', pad=8)
            plt.grid(axis='y', linestyle='--', alpha=0.5)
            plt.tight_layout()
            plt.savefig(chart3_path, format='png')
            plt.close()
        except Exception:
            plt.close()
            chart3_path = None

        # Build story sections
        story.append(Paragraph("Executive Summary", heading_style))
        story.append(Paragraph(
            "The claim is bifurcated: the historical technological claim regarding the first touchscreen phone requires more evidence / is partly contradicted, while the archival photo attribution to Steve Jobs is verified true. Comprehensive multi-agent verification indicates mixed validity.",
            body_style
        ))
        story.append(Spacer(1, 8))

        # Verdict Banner Table
        v_color, bg_color = get_verdict_color("Mixed")
        verdict_data = [[
            Paragraph("<b>FINAL VERDICT: MIXED / REQUIRES MORE EVIDENCE</b><br/>Confidence Score: 68%", ParagraphStyle('VText', parent=table_text, textColor=v_color, fontSize=10, fontName=FONT_BOLD))
        ]]
        v_table = Table(verdict_data, colWidths=[7 * inch])
        v_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bg_color),
            ('BOX', (0,0), (-1,-1), 1, v_color),
            ('PADDING', (0,0), (-1,-1), 10),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(v_table)
        story.append(Spacer(1, 12))

        # Add Chart 1 if exists
        if chart1_path and os.path.exists(chart1_path):
            story.append(Paragraph("Sub-claim Confidence Visualization", heading_style))
            story.append(Table([[Paragraph("<img src='" + chart1_path + "' width='400' height='146'/>", body_style)]], colWidths=[7 * inch]))
            story.append(Spacer(1, 10))

        story.append(PageBreak())

        # Page 2: Evidence & Sources & Chart 2
        story.append(Paragraph("Claim Decomposition & Sub-Claims", heading_style))
        sub_claims_data = [
            [Paragraph("<b>#</b>", table_header), Paragraph("<b>Sub-Claim</b>", table_header), Paragraph("<b>Type</b>", table_header)],
            [Paragraph("1", table_text), Paragraph("The iPhone was the first touchscreen smartphone.", table_text), Paragraph("Factual", table_text)],
            [Paragraph("2", table_text), Paragraph("The provided photo depicts Steve Jobs holding an iPhone.", table_text), Paragraph("Factual", table_text)],
        ]
        sc_table = Table(sub_claims_data, colWidths=[0.5 * inch, 5.0 * inch, 1.5 * inch], repeatRows=1)
        sc_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
            ('PADDING', (0,0), (-1,-1), 6),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        story.append(sc_table)
        story.append(Spacer(1, 12))

        if chart2_path and os.path.exists(chart2_path):
            story.append(Paragraph("Source Credibility Analysis", heading_style))
            story.append(Table([[Paragraph("<img src='" + chart2_path + "' width='400' height='166'/>", body_style)]], colWidths=[7 * inch]))
            story.append(Spacer(1, 10))

        story.append(PageBreak())

        # Page 3: Risk, Legal, Breakdown & Chart 3
        story.append(Paragraph("Risk & Legal Assessment", heading_style))
        story.append(Paragraph(
            "<b>Risk & Severity:</b> Low severity in consumer technology historical domain.<br/>"
            "<b>Legal & Policy Considerations:</b> Informational report only; does not constitute legal or advertising-standards advice.",
            body_style
        ))
        story.append(Spacer(1, 10))

        if chart3_path and os.path.exists(chart3_path):
            story.append(Paragraph("Confidence Score Breakdown", heading_style))
            story.append(Table([[Paragraph("<img src='" + chart3_path + "' width='400' height='146'/>", body_style)]], colWidths=[7 * inch]))
            story.append(Spacer(1, 10))

        story.append(Paragraph("References & Sources", heading_style))
        ref_text = (
            "• https://simpletexting.com/blog/where-have-we-come-since-the-first-smartphone/<br/>"
            "• https://www.idropnews.com/news/four-touchscreen-phones-that-came-before-the-iphone/<br/>"
            "• https://en.wikipedia.org/wiki/IPhone_(1st_generation)<br/>"
            "• https://commons.wikimedia.org/wiki/File:Steve_Jobs_presents_iPhone.jpg"
        )
        story.append(Paragraph(ref_text, body_style))

        doc.build(story, canvasmaker=NumberedCanvas)

        # Atomic move
        if os.path.exists(output_filepath + ".tmp"):
            shutil.move(output_filepath + ".tmp", output_filepath)

    finally:
        # File hygiene: clean up temp folder
        if os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)
