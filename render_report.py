"""
Render CRDF markdown report into a spacious, executive-grade PDF document
with large, clear typography, generous spacing, and embedded visual charts.

Usage:
    python render_report.py [--json path/to/combined_result.json] [--output path/to/output.pdf]
"""

import argparse
import datetime
import html
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend for headless/test environments
import matplotlib.pyplot as plt
import numpy as np
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
)

plt.rcParams['font.sans-serif'] = 'Helvetica, Arial, DejaVu Sans'
plt.rcParams['font.family'] = 'sans-serif'


def generate_charts(md_text: str, temp_dir: Path) -> dict:
    """Build the source-credibility chart from the report's own Source Credibility table."""
    lines = md_text.splitlines()

    # 3. Parse Sources
    sources = []
    in_cred = False
    for line in lines:
        if line.startswith('##') and 'Source Credibility' in line:
            in_cred = True
            continue
        if in_cred and line.startswith('##'):
            in_cred = False
        if in_cred and '|' in line and not re.match(r'^\s*\|?\s*:?-+:?\s*\|', line) and not line.strip().lower().startswith('| source'):
            cols = [c.strip() for c in line.strip('|').split('|')]
            if len(cols) >= 2:
                s_name = cols[0]
                score_match = re.search(r'\d+(?:\.\d+)?', cols[1])
                if score_match:
                    s_score = float(score_match.group(0))
                    if s_score <= 1.0:
                        s_score = s_score * 100.0
                    sources.append({'name': s_name, 'score': s_score})

    sources.sort(key=lambda x: x['score'], reverse=True)

    chart_paths = {}

    # --- CHART 2: Source Credibility Chart ---
    if sources:
        fig, ax = plt.subplots(figsize=(7.5, 1.5), dpi=200)

        s_names = [s['name'] for s in sources]
        s_scores = [s['score'] for s in sources]

        y_pos = np.arange(len(s_names))
        bars = ax.barh(y_pos, s_scores, height=0.45, color='#2563EB', edgecolor='none')

        ax.set_yticks(y_pos)
        ax.set_yticklabels(s_names, fontsize=8, fontweight='bold', color='#1E293B')
        ax.invert_yaxis()
        ax.set_xlim(0, 118)
        ax.set_xlabel('Credibility Score (%)', fontsize=8, fontweight='bold', color='#1E293B')
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color('#CBD5E1')
        ax.spines['bottom'].set_color('#CBD5E1')
        ax.tick_params(axis='x', labelsize=7.5)

        for bar, val in zip(bars, s_scores):
            ax.text(val + 2, bar.get_y() + bar.get_height()/2, f"{int(val)}%", va='center', ha='left', fontsize=8, fontweight='bold', color='#0F172A')

        plt.title('Source Credibility Analysis (Highest to Lowest)', fontsize=9.5, fontweight='bold', color='#0F172A', pad=4)
        plt.tight_layout()
        c2_path = str(temp_dir / 'chart_2.png')
        plt.savefig(c2_path)
        plt.close()
        chart_paths['chart_2'] = c2_path

    return chart_paths



IST_TZ = os.getenv("CRDF_TZ", "Asia/Kolkata")


def now_stamp() -> str:
    """e.g. '17 July 2026, 14:32 IST' (timezone configurable via CRDF_TZ)."""
    try:
        from zoneinfo import ZoneInfo
        n = datetime.datetime.now(ZoneInfo(IST_TZ))
        label = "IST" if IST_TZ == "Asia/Kolkata" else n.tzname()
    except Exception:
        n = datetime.datetime.now()
        label = ""
    return f"{n.day} {n.strftime('%B %Y, %H:%M')} {label}".strip()


def fmt(text: str) -> str:
    """Escape XML then apply the small markdown subset ReportLab Paragraph understands."""
    t = html.escape(text, quote=False)
    t = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'\*(.*?)\*', r'<i>\1</i>', t)
    t = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2">\1</a>', t)
    return t


def clean_heading(h: str) -> str:
    """'(3) EXECUTIVE SUMMARY' -> 'Executive Summary' (sample-report style)."""
    h = re.sub(r'^\(?\d+[\).]?\)?\s*', '', h).strip()
    if h.isupper():
        h = h.title().replace(' And ', ' & ').replace('-Of-', '-of-')
    return h


def verdict_theme(text: str):
    u = text.upper()
    if "MIXED" in u or "REQUIRES" in u or "UNVERIFIABLE" in u or "UNDETERMINED" in u:
        return '#F8FAFC', '#94A3B8', '#334155'
    if "MISLEADING" in u or "PARTIAL" in u:
        return '#FFFBEB', '#F59E0B', '#B45309'
    if "FALSE" in u or "CONTRADICTED" in u:
        return '#FEF2F2', '#EF4444', '#B91C1C'
    if "TRUE" in u:
        return '#F0FDF4', '#22C55E', '#15803D'
    return '#F8FAFC', '#94A3B8', '#334155'


def confidence_band(v: float) -> str:
    return "High" if v >= 80 else "Moderate" if v >= 50 else "Low"


VERDICT_RE = re.compile(r'final verdict[^:\n]*:\s*(.+?)\s*\|\s*confidence score[^:\n]*:\s*([\d.]+)', re.I)


def col_widths(header, total):
    """Column widths tuned to the sample report (narrow label columns, wide text columns)."""
    narrow = {'#': 28, 'stance': 62, 'severity': 56, 'credibility score': 62, 'type': 95,
              'points': 70, 'weight': 55, 'field': 130, 'date': 90}
    ws = []
    for h in header:
        k = h.strip().lower()
        w = next((v for key, v in narrow.items() if k == key or k.startswith(key + ' ')), None)
        ws.append(w)
    free = [i for i, w in enumerate(ws) if w is None]
    rest = max(total - sum(w for w in ws if w), 80 * max(len(free), 1))
    for i in free:
        ws[i] = rest / len(free)
    scale = total / sum(ws)
    return [w * scale for w in ws]


PAGE_W = A4[0] - 72


def parse_markdown_to_flowables(md_text: str, styles: dict, chart_paths: dict) -> list:
    """Parse markdown report string into ReportLab flowables with compact executive layout."""
    flowables = []
    lines = md_text.splitlines()
    i = 0
    n = len(lines)

    table_lines = []

    def flush_table():
        nonlocal table_lines
        if not table_lines:
            return
        
        rows = []
        for line in table_lines:
            if re.match(r'^\s*\|?\s*:?-+:?\s*\|', line):
                continue
            cols = [c.strip() for c in line.strip('|').split('|')]
            if any(cols):
                rows.append(cols)

        table_lines = []
        if not rows:
            return

        table_data = []
        is_header = True
        for row in rows:
            row_data = []
            for cell in row:
                if re.search(r'generation time|reflects', cell, re.I):
                    cell = now_stamp()
                cell_clean = fmt(cell)
                style_to_use = styles['TableHeader'] if is_header else styles['TableCell']
                row_data.append(Paragraph(cell_clean, style_to_use))
            table_data.append(row_data)
            is_header = False

        if not table_data:
            return

        t = Table(table_data, repeatRows=1, colWidths=col_widths(rows[0], PAGE_W) if all(len(r) == len(rows[0]) for r in rows) else None)
        ts = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ]
        for r_idx in range(1, len(table_data)):
            bg = colors.HexColor('#F8FAFC') if r_idx % 2 == 1 else colors.white
            ts.append(('BACKGROUND', (0, r_idx), (-1, r_idx), bg))

        t.setStyle(TableStyle(ts))
        flowables.append(Spacer(1, 2))
        flowables.append(t)
        flowables.append(Spacer(1, 2))

    in_references = False
    in_verdict_section = False
    in_conf_section = False
    verdict_info = {}
    m0 = VERDICT_RE.search(md_text)
    if m0:
        verdict_info.update(verdict=m0.group(1).replace('**', '').strip(), conf=float(m0.group(2)))

    def emit_conf_line():
        """After the Confidence Score Breakdown table, print the aggregated score line (sample layout)."""
        nonlocal in_conf_section
        if not in_conf_section:
            return
        in_conf_section = False
        flush_table()
        c = verdict_info.get('conf')
        if c is not None:
            flowables.append(Spacer(1, 3))
            flowables.append(Paragraph(
                f"<b>Aggregated Confidence Score: {round(c)}%</b> &mdash; {confidence_band(c)} confidence in the "
                f"{html.escape(verdict_info.get('verdict', ''))} classification.", styles['Body']))

    while i < n:
        line = lines[i].strip()

        if not line:
            flush_table()
            i += 1
            continue

        if line.startswith('|') and '|' in line[1:]:
            table_lines.append(line)
            i += 1
            continue
        else:
            flush_table()

        if line.startswith('# '):
            title_text = line[2:].strip()
            flowables.append(Paragraph(title_text, styles['DocTitle']))
            flowables.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0F172A'), spaceBefore=2, spaceAfter=4))
            i += 1
            continue

        if line.startswith('## '):
            raw_h2 = line[3:].strip()
            h2_text = clean_heading(raw_h2)
            emit_conf_line()
            i += 1

            if re.search(r'REPORT HEADER', raw_h2, re.I):
                # Cover block: title + subtitle, then the Field/Value table that follows
                flowables.append(Paragraph("CRDF Claim Verification Report", styles['CoverTitle']))
                flowables.append(Paragraph("Claim vs Reality Determination Framework", styles['CoverSub']))
                flowables.append(Spacer(1, 6))
                in_references = False
                in_conf_section = False
                continue

            if re.search(r'FINAL VERDICT AND CONFIDENCE', raw_h2, re.I):
                in_verdict_section = True
                in_references = False
                in_conf_section = False
                continue

            flowables.append(Spacer(1, 6))
            flowables.append(Paragraph(h2_text, styles['SectionHeader']))
            flowables.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor('#2563EB'), spaceBefore=2, spaceAfter=4))
            in_references = "References" in h2_text
            in_conf_section = "Confidence Score Breakdown" in h2_text

            if "Source Credibility" in h2_text and 'chart_2' in chart_paths:
                while i < n and (lines[i].strip().startswith('|') or not lines[i].strip()):
                    if lines[i].strip().startswith('|'):
                        table_lines.append(lines[i].strip())
                    i += 1
                flush_table()
                flowables.append(Spacer(1, 4))
                flowables.append(Image(chart_paths['chart_2'], width=PAGE_W, height=PAGE_W * 0.2))
                flowables.append(Spacer(1, 3))
            continue

        if line.startswith('### '):
            h3_text = line[4:].strip()
            flowables.append(Spacer(1, 3))
            flowables.append(Paragraph(h3_text, styles['SubSectionHeader']))
            i += 1
            continue

        # Final verdict + confidence box (sample-report layout: verdict left, score right)
        if in_verdict_section:
            in_verdict_section = False
            m = VERDICT_RE.search(line)
            if m:
                verdict_txt = m.group(1).replace('**', '').strip()
                conf_txt = f"{round(float(m.group(2)))}%"
            else:
                verdict_txt, conf_txt = line.replace('**', ''), "n/a"
            bg, box_c, txt_c = verdict_theme(verdict_txt)
            lab = ParagraphStyle('lab', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5,
                                 textColor=colors.HexColor('#64748B'))
            big_l = ParagraphStyle('bigl', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=17,
                                   leading=20, textColor=colors.HexColor(txt_c))
            big_r = ParagraphStyle('bigr', parent=big_l, alignment=2)
            lab_r = ParagraphStyle('labr', parent=lab, alignment=2)
            bt = Table([[Paragraph("FINAL VERDICT", lab), Paragraph("CONFIDENCE SCORE", lab_r)],
                        [Paragraph(html.escape(verdict_txt.upper()), big_l), Paragraph(html.escape(conf_txt), big_r)]],
                       colWidths=[PAGE_W * 0.7, PAGE_W * 0.3])
            bt.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(bg)),
                ('BOX', (0, 0), (-1, -1), 1.0, colors.HexColor(box_c)),
                ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ]))
            flowables.append(Spacer(1, 8))
            flowables.append(bt)
            flowables.append(Spacer(1, 4))
            verdict_info.update(verdict=verdict_txt, conf=float(m.group(2)) if m else None)
            i += 1
            continue

        if line.startswith('- ') or line.startswith('* '):
            flowables.append(Paragraph(f"&bull; {fmt(line[2:].strip())}", styles['BulletText']))
            i += 1
            continue

        p_text = fmt(line)

        if in_references:
            flowables.append(Paragraph(p_text, styles['RefText']))
        else:
            flowables.append(Paragraph(p_text, styles['Body']))
            flowables.append(Spacer(1, 2))

        i += 1

    flush_table()
    emit_conf_line()
    return flowables


def generate_pdf(json_path: str, output_path: str = None, single_page: bool = False) -> str:
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    report_md = data.get('text_pipeline_report')
    if not report_md:
        raise ValueError(f"No text_pipeline_report found in {json_path}")

    claim = data.get('claim', 'Fact Check Verification Report')
    slug = re.sub(r'[^a-zA-Z0-9]+', '_', claim[:30]).strip('_').lower()
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

    if not output_path:
        out_dir = Path("output")
        out_dir.mkdir(exist_ok=True)
        output_path = str(out_dir / f"CRDF_Report_{slug}_{timestamp_str}.pdf")
    else:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    temp_dir = Path(tempfile.mkdtemp(prefix="crdf_charts_"))
    if "CLAIM REQUIRES CLARIFICATION" in report_md:
        chart_paths = {}
    else:
        chart_paths = generate_charts(report_md, temp_dir)

    margin = 36  # 0.5 inch margins for clean professional layout

    temp_output_path = output_path + ".tmp"

    doc = SimpleDocTemplate(
        temp_output_path,
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )

    base_styles = getSampleStyleSheet()

    styles = {
        'Normal': base_styles['Normal'],
        'CoverTitle': ParagraphStyle(
            'CoverTitle', parent=base_styles['Heading1'],
            fontName='Helvetica-Bold', fontSize=20, leading=24, alignment=1,
            textColor=colors.HexColor('#0F172A'),
        ),
        'CoverSub': ParagraphStyle(
            'CoverSub', parent=base_styles['Normal'],
            fontName='Helvetica', fontSize=11, leading=14, alignment=1,
            textColor=colors.HexColor('#475569'),
        ),
        'DocTitle': ParagraphStyle(
            'DocTitle', parent=base_styles['Heading1'],
            fontName='Helvetica-Bold', fontSize=16, leading=19,
            textColor=colors.HexColor('#0F172A'), alignment=0,
        ),
        'SectionHeader': ParagraphStyle(
            'SectionHeader', parent=base_styles['Heading2'],
            fontName='Helvetica-Bold', fontSize=13, leading=16,
            textColor=colors.HexColor('#1E293B'), keepWithNext=True,
        ),
        'SubSectionHeader': ParagraphStyle(
            'SubSectionHeader', parent=base_styles['Heading3'],
            fontName='Helvetica-Bold', fontSize=9.5, leading=12,
            textColor=colors.HexColor('#334155'), keepWithNext=True,
        ),
        'Body': ParagraphStyle(
            'Body', parent=base_styles['Normal'],
            fontName='Helvetica', fontSize=9.5, leading=13,
            textColor=colors.HexColor('#334155'),
        ),
        'BulletText': ParagraphStyle(
            'BulletText', parent=base_styles['Normal'],
            fontName='Helvetica', fontSize=8, leading=10.5, leftIndent=8,
            textColor=colors.HexColor('#334155'),
        ),
        'TableHeader': ParagraphStyle(
            'TableHeader', parent=base_styles['Normal'],
            fontName='Helvetica-Bold', fontSize=8.5, leading=11,
            textColor=colors.white,
        ),
        'TableCell': ParagraphStyle(
            'TableCell', parent=base_styles['Normal'],
            fontName='Helvetica', fontSize=8.5, leading=11,
            textColor=colors.HexColor('#1E293B'),
        ),
        'RefText': ParagraphStyle(
            'RefText', parent=base_styles['Normal'],
            fontName='Courier', fontSize=7.5, leading=9.5,
            textColor=colors.HexColor('#2563EB'),
        ),
    }

    elements = parse_markdown_to_flowables(report_md, styles, chart_paths)

    def add_header_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.HexColor('#94A3B8'))
        canvas.drawString(margin, 18, "CRDF - Claim vs Reality Determination Framework")
        canvas.drawRightString(A4[0] - margin, 18, f"Page {doc.page}")
        canvas.setStrokeColor(colors.HexColor('#E2E8F0'))
        canvas.setLineWidth(0.5)
        canvas.line(margin, 28, A4[0] - margin, 28)
        canvas.restoreState()

    doc.build(elements, onFirstPage=add_header_footer, onLaterPages=add_header_footer)
    # Atomic rename: only make the final file visible once fully written
    shutil.move(temp_output_path, output_path)
    # Clean up temporary chart files
    shutil.rmtree(temp_dir, ignore_errors=True)
    print(f"Successfully generated executive PDF report with charts at: {output_path}")
    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", default="combined_result.json")
    parser.add_argument("--output", default=None)
    parser.add_argument("--single-page", action="store_true", help="Render report on a single page")
    args = parser.parse_args()

    generate_pdf(args.json, args.output, single_page=args.single_page)
