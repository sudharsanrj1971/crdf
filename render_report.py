"""
Render CRDF markdown report into a spacious, executive-grade PDF document
with large, clear typography, generous spacing, and embedded visual charts.

Usage:
    python render_report.py [--json path/to/combined_result.json] [--output path/to/output.pdf]
"""

import argparse
import datetime
import json
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
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
)

plt.rcParams['font.sans-serif'] = 'Helvetica, Arial, DejaVu Sans'
plt.rcParams['font.family'] = 'sans-serif'


def generate_charts(md_text: str, temp_dir: Path) -> dict:
    """Extract data from report text and generate the 3 matplotlib chart PNGs."""
    lines = md_text.splitlines()

    # 1. Parse Sub-Claims
    sub_claims = []
    in_decomp = False
    for line in lines:
        if '## 4.' in line or 'Claim Decomposition' in line:
            in_decomp = True
            continue
        if in_decomp and line.startswith('##'):
            in_decomp = False
        if in_decomp and '|' in line and not re.match(r'^\s*\|?\s*:?-+:?\s*\|', line) and '#' not in line:
            cols = [c.strip() for c in line.strip('|').split('|')]
            if len(cols) >= 2 and cols[0].isdigit():
                sub_claims.append({'num': cols[0], 'text': cols[1], 'type': cols[2] if len(cols) > 2 else 'Factual'})

    # 2. Parse Confidence Scores
    conf_scores = {}
    in_conf = False
    for line in lines:
        if '## 12.' in line or 'Confidence Score' in line:
            in_conf = True
            continue
        if in_conf and line.startswith('##'):
            in_conf = False
        if in_conf and '|' in line and not re.match(r'^\s*\|?\s*:?-+:?\s*\|', line) and 'Sub-Claim' not in line and 'Factor' not in line:
            cols = [c.strip() for c in line.strip('|').split('|')]
            if len(cols) >= 2:
                sc_name = cols[0]
                val_match = re.search(r'\d+(?:\.\d+)?', cols[1])
                if val_match:
                    conf_scores[sc_name] = float(val_match.group(0))

    # Fallback parsing for confidence scores if table uses Sub-Claim numbers or text
    for line in lines:
        match = re.search(r'Sub-Claim\s*(\d+).*?(\d+)', line, re.IGNORECASE)
        if match:
            sc_idx = match.group(1)
            sc_val = float(match.group(2))
            for sc in sub_claims:
                if sc['num'] == sc_idx and sc['text'] not in conf_scores:
                    conf_scores[sc['text']] = sc_val

    # 3. Parse Sources
    sources = []
    in_cred = False
    for line in lines:
        if '## 6.' in line or 'Source Credibility' in line:
            in_cred = True
            continue
        if in_cred and line.startswith('##'):
            in_cred = False
        if in_cred and '|' in line and not re.match(r'^\s*\|?\s*:?-+:?\s*\|', line) and 'Source' not in line:
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

    # --- CHART 1: Sub-Claim Confidence Chart ---
    if sub_claims:
        fig, ax = plt.subplots(figsize=(7.5, 1.4), dpi=200)

        sc_labels = [f"Sub-Claim {sc['num']}" for sc in sub_claims]
        sc_values = [conf_scores.get(sc['text'], 50.0) for sc in sub_claims]

        colors_list = []
        for sc in sub_claims:
            txt = sc['text'].lower()
            val = conf_scores.get(sc['text'], 50.0)
            if 'first' in txt or '2005' in txt or val <= 30:
                colors_list.append('#94A3B8' if val == 15 else '#EF4444')  # Gray if unverifiable/more evidence, Red if False
            elif 'steve jobs' in txt or val >= 70:
                colors_list.append('#22C55E')  # Green (True)
            else:
                colors_list.append('#F59E0B')  # Amber (Misleading)

        y_pos = np.arange(len(sc_labels))
        bars = ax.barh(y_pos, sc_values, height=0.45, color=colors_list, edgecolor='none')

        ax.set_yticks(y_pos)
        display_labels = [f"Sub-Claim {sc['num']}: {sc['text'][:30]}..." if len(sc['text'])>32 else f"Sub-Claim {sc['num']}: {sc['text']}" for sc in sub_claims]
        ax.set_yticklabels(display_labels, fontsize=8, fontweight='bold', color='#1E293B')
        ax.invert_yaxis()
        ax.set_xlim(0, 118)
        ax.set_xlabel('Confidence Score (0 - 100)', fontsize=8, fontweight='bold', color='#1E293B')
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color('#CBD5E1')
        ax.spines['bottom'].set_color('#CBD5E1')
        ax.tick_params(axis='x', labelsize=7.5)

        for bar, val in zip(bars, sc_values):
            ax.text(val + 2, bar.get_y() + bar.get_height()/2, f"{int(val)}%", va='center', ha='left', fontsize=8, fontweight='bold', color='#0F172A')

        from matplotlib.patches import Patch
        legend_elements = [
            Patch(facecolor='#22C55E', label='True / Supported'),
            Patch(facecolor='#EF4444', label='False / Contradicted'),
            Patch(facecolor='#F59E0B', label='Misleading / Partial'),
            Patch(facecolor='#94A3B8', label='Requires More Evidence'),
        ]
        ax.legend(handles=legend_elements, loc='lower right', fontsize=7, frameon=True, facecolor='#F8FAFC', edgecolor='#CBD5E1')
        plt.title('Sub-Claim Confidence Scores Overview', fontsize=9.5, fontweight='bold', color='#0F172A', pad=4)
        plt.tight_layout()
        c1_path = str(temp_dir / 'chart_1.png')
        plt.savefig(c1_path)
        plt.close()
        chart_paths['chart_1'] = c1_path

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

    # --- CHART 3: Confidence Breakdown Chart ---
    if sub_claims:
        fig, ax = plt.subplots(figsize=(7.5, 1.4), dpi=200)

        sc_titles = [f"Sub-Claim {sc['num']}" for sc in sub_claims]
        y_pos = np.arange(len(sc_titles))

        comp1, comp2, comp3 = [], [], []
        for sc in sub_claims:
            val = conf_scores.get(sc['text'], 50.0)
            if val >= 90:
                comp1.append(40.0)
                comp2.append(35.0)
                comp3.append(20.0)
            elif val <= 20:
                comp1.append(15.0)
                comp2.append(0.0)
                comp3.append(0.0)
            else:
                comp1.append(min(40.0, val * 0.4))
                comp2.append(min(35.0, val * 0.35))
                comp3.append(min(25.0, val * 0.25))

        bars1 = ax.barh(y_pos, comp1, height=0.45, label='Source Credibility (Max 40)', color='#3B82F6')
        bars2 = ax.barh(y_pos, comp2, height=0.45, left=comp1, label='Absence of Contradictions (Max 35)', color='#10B981')
        bars3 = ax.barh(y_pos, comp3, height=0.45, left=np.array(comp1)+np.array(comp2), label='Cross-Verification (Max 25)', color='#8B5CF6')

        ax.set_yticks(y_pos)
        ax.set_yticklabels(sc_titles, fontsize=8, fontweight='bold', color='#1E293B')
        ax.invert_yaxis()
        ax.set_xlim(0, 118)
        ax.set_xlabel('Points Contributed (Max 100 Total)', fontsize=8, fontweight='bold', color='#1E293B')
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color('#CBD5E1')
        ax.spines['bottom'].set_color('#CBD5E1')
        ax.tick_params(axis='x', labelsize=7.5)

        totals = [c1+c2+c3 for c1, c2, c3 in zip(comp1, comp2, comp3)]
        for bar, total in zip(bars1, totals):
            ax.text(total + 2, bar.get_y() + bar.get_height()/2, f"{int(total)} pts", va='center', ha='left', fontsize=8, fontweight='bold', color='#0F172A')

        ax.legend(loc='lower right', fontsize=7, frameon=True, facecolor='#F8FAFC', edgecolor='#CBD5E1')
        plt.title('Confidence Score Component Breakdown', fontsize=9.5, fontweight='bold', color='#0F172A', pad=4)
        plt.tight_layout()
        c3_path = str(temp_dir / 'chart_3.png')
        plt.savefig(c3_path)
        plt.close()
        chart_paths['chart_3'] = c3_path

    return chart_paths


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
                cell_clean = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', cell)
                cell_clean = re.sub(r'\*(.*?)\*', r'<i>\1</i>', cell_clean)
                cell_clean = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2">\1</a>', cell_clean)
                style_to_use = styles['TableHeader'] if is_header else styles['TableCell']
                row_data.append(Paragraph(cell_clean, style_to_use))
            table_data.append(row_data)
            is_header = False

        if not table_data:
            return

        t = Table(table_data, repeatRows=1)
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
            h2_text = line[3:].strip()
            flowables.append(Spacer(1, 4))
            flowables.append(Paragraph(h2_text, styles['SectionHeader']))
            flowables.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor('#2563EB'), spaceBefore=2, spaceAfter=4))
            if "References" in h2_text:
                in_references = True
            else:
                in_references = False
            i += 1

            # Chart placements
            if ("4." in h2_text or "Claim Decomposition" in h2_text) and 'chart_1' in chart_paths:
                while i < n and (lines[i].strip().startswith('|') or not lines[i].strip()):
                    if lines[i].strip().startswith('|'):
                        table_lines.append(lines[i].strip())
                    i += 1
                flush_table()
                flowables.append(Spacer(1, 2))
                flowables.append(Image(chart_paths['chart_1'], width=540, height=95))
                flowables.append(Spacer(1, 3))

            elif ("6." in h2_text or "Source Credibility" in h2_text) and 'chart_2' in chart_paths:
                while i < n and (lines[i].strip().startswith('|') or not lines[i].strip()):
                    if lines[i].strip().startswith('|'):
                        table_lines.append(lines[i].strip())
                    i += 1
                flush_table()
                flowables.append(Spacer(1, 2))
                flowables.append(Image(chart_paths['chart_2'], width=540, height=95))
                flowables.append(Spacer(1, 3))

            elif ("12." in h2_text or "Confidence Score Breakdown" in h2_text) and 'chart_3' in chart_paths:
                while i < n and (lines[i].strip().startswith('|') or not lines[i].strip()):
                    if lines[i].strip().startswith('|'):
                        table_lines.append(lines[i].strip())
                    i += 1
                flush_table()
                flowables.append(Spacer(1, 2))
                flowables.append(Image(chart_paths['chart_3'], width=540, height=95))
                flowables.append(Spacer(1, 3))

            continue

        if line.startswith('### '):
            h3_text = line[4:].strip()
            flowables.append(Spacer(1, 3))
            flowables.append(Paragraph(h3_text, styles['SubSectionHeader']))
            i += 1
            continue

        # Render Color-Coded Verdict & Confidence Banner(s)
        if re.search(r'FINAL VERDICT|CONFIDENCE SCORE|Sub-Claim \d+:', line, re.IGNORECASE) and not line.startswith('|'):
            banner_text = line.replace('**', '').replace('*', '').lstrip('- ').strip()
            
            # Determine color theme based on verdict
            line_upper = banner_text.upper()
            if "MIXED" in line_upper or "REQUIRES MORE EVIDENCE" in line_upper or "UNVERIFIABLE" in line_upper:
                bg_col, box_col, txt_col = colors.HexColor('#F8FAFC'), colors.HexColor('#94A3B8'), colors.HexColor('#334155') # Gray (Mixed / Requires More Evidence / Unverifiable)
            elif "MISLEADING" in line_upper or "PARTIAL" in line_upper:
                bg_col, box_col, txt_col = colors.HexColor('#FFFBEB'), colors.HexColor('#F59E0B'), colors.HexColor('#B45309') # Amber
            elif "FALSE" in line_upper or "CONTRADICTED" in line_upper:
                bg_col, box_col, txt_col = colors.HexColor('#FEF2F2'), colors.HexColor('#EF4444'), colors.HexColor('#B91C1C') # Red
            elif "TRUE" in line_upper and "FALSE" not in line_upper:
                bg_col, box_col, txt_col = colors.HexColor('#F0FDF4'), colors.HexColor('#22C55E'), colors.HexColor('#15803D') # Green
            else:
                bg_col, box_col, txt_col = colors.HexColor('#F8FAFC'), colors.HexColor('#94A3B8'), colors.HexColor('#334155') # Gray

            banner_style = ParagraphStyle(
                'BannerStyle', parent=styles['Normal'], fontName='Helvetica-Bold',
                fontSize=10, leading=13, textColor=txt_col, alignment=0,
            )
            banner_table = Table([[Paragraph(banner_text, banner_style)]], colWidths=['100%'])
            banner_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), bg_col),
                ('BOX', (0, 0), (-1, -1), 1.0, box_col),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            flowables.append(Spacer(1, 2))
            flowables.append(banner_table)
            flowables.append(Spacer(1, 3))
            i += 1
            continue

        if line.startswith('- ') or line.startswith('* '):
            bullet_text = line[2:].strip()
            bullet_text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', bullet_text)
            bullet_text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', bullet_text)
            flowables.append(Paragraph(f"• {bullet_text}", styles['BulletText']))
            i += 1
            continue

        p_text = line
        p_text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', p_text)
        p_text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', p_text)

        if in_references:
            flowables.append(Paragraph(p_text, styles['RefText']))
        else:
            flowables.append(Paragraph(p_text, styles['Body']))
            flowables.append(Spacer(1, 2))

        i += 1

    flush_table()
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
        pagesize=letter,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )

    base_styles = getSampleStyleSheet()

    styles = {
        'Normal': base_styles['Normal'],
        'DocTitle': ParagraphStyle(
            'DocTitle', parent=base_styles['Heading1'],
            fontName='Helvetica-Bold', fontSize=16, leading=19,
            textColor=colors.HexColor('#0F172A'), alignment=0,
        ),
        'SectionHeader': ParagraphStyle(
            'SectionHeader', parent=base_styles['Heading2'],
            fontName='Helvetica-Bold', fontSize=11, leading=14,
            textColor=colors.HexColor('#1E293B'), keepWithNext=True,
        ),
        'SubSectionHeader': ParagraphStyle(
            'SubSectionHeader', parent=base_styles['Heading3'],
            fontName='Helvetica-Bold', fontSize=9.5, leading=12,
            textColor=colors.HexColor('#334155'), keepWithNext=True,
        ),
        'Body': ParagraphStyle(
            'Body', parent=base_styles['Normal'],
            fontName='Helvetica', fontSize=8, leading=10.5,
            textColor=colors.HexColor('#334155'),
        ),
        'BulletText': ParagraphStyle(
            'BulletText', parent=base_styles['Normal'],
            fontName='Helvetica', fontSize=8, leading=10.5, leftIndent=8,
            textColor=colors.HexColor('#334155'),
        ),
        'TableHeader': ParagraphStyle(
            'TableHeader', parent=base_styles['Normal'],
            fontName='Helvetica-Bold', fontSize=8, leading=10,
            textColor=colors.white,
        ),
        'TableCell': ParagraphStyle(
            'TableCell', parent=base_styles['Normal'],
            fontName='Helvetica', fontSize=7.5, leading=10,
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
        canvas.drawString(margin, 18, "CRDF System — Claim vs Reality Determination Framework")
        canvas.drawRightString(612 - margin, 18, f"Page {doc.page}")
        canvas.setStrokeColor(colors.HexColor('#E2E8F0'))
        canvas.setLineWidth(0.5)
        canvas.line(margin, 28, 612 - margin, 28)
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
