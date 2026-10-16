"""
CRDF PDF report renderer.

Turns the pipeline output (the markdown report written by the Report Writer agent, plus the
multimodal findings) into a PDF laid out like the CRDF sample verification report:
title block, header table, verdict / confidence banner, then numbered-section content with
tables, and a references list.  Nothing in here is hard-coded to a particular claim.
"""
import os
import re
import shutil
import tempfile
from datetime import datetime, timedelta, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (KeepTogether, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)

# --------------------------------------------------------------------------- fonts
_HERE = os.path.dirname(os.path.abspath(__file__))
FONT_NAME = "Helvetica"
FONT_BOLD = "Helvetica-Bold"

_font_candidates = [
    (os.path.join(_HERE, "fonts", "DejaVuSans.ttf"), os.path.join(_HERE, "fonts", "DejaVuSans-Bold.ttf")),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
]
for _regular, _bold in _font_candidates:
    if os.path.exists(_regular):
        try:
            pdfmetrics.registerFont(TTFont("CRDFSans", _regular))
            bold_name = "CRDFSans"
            if os.path.exists(_bold):
                pdfmetrics.registerFont(TTFont("CRDFSans-Bold", _bold))
                bold_name = "CRDFSans-Bold"
            pdfmetrics.registerFontFamily("CRDFSans", normal="CRDFSans", bold=bold_name,
                                          italic="CRDFSans", boldItalic=bold_name)
            FONT_NAME, FONT_BOLD = "CRDFSans", bold_name
            break
        except Exception:
            continue

# --------------------------------------------------------------------------- palette
NAVY = colors.HexColor("#1F2A44")
INK = colors.HexColor("#1E293B")
BODY = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
RULE = colors.HexColor("#CBD5E1")
ZEBRA = colors.HexColor("#F8FAFC")

PAGE_W, PAGE_H = letter
MARGIN = 54
CONTENT_W = PAGE_W - 2 * MARGIN - 12  # frame padding is 6pt each side; tables match the text width

REPORT_TITLE = "CRDF Claim Verification Report"
FRAMEWORK = "Claim vs Reality Determination Framework"
IST = timezone(timedelta(hours=5, minutes=30))


# --------------------------------------------------------------------------- text helpers
def escape_xml(text) -> str:
    if text is None:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def md_inline(text) -> str:
    """Escape for ReportLab and turn **bold** / `code` into markup. Strips stray markdown tokens."""
    s = escape_xml(text).strip()
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"__(.+?)__", r"<b>\1</b>", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = s.replace("**", "").replace("&lt;br&gt;", "<br/>").replace("&lt;br/&gt;", "<br/>")
    return s


def sanitize_text(text) -> str:
    """Kept for backwards compatibility: plain, escaped text with markdown tokens removed."""
    if not text:
        return "Not available"
    s = re.sub(r"\*\*(.*?)\*\*", r"\1", str(text))
    s = re.sub(r"^#+\s*", "", s, flags=re.M)
    return escape_xml(s)


def now_ist_string() -> str:
    n = datetime.now(IST)
    return f"{n.day} {n.strftime('%B %Y, %H:%M')} IST"


# --------------------------------------------------------------------------- markdown parsing
_SEP_ROW = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")


def _split_row(line: str):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def parse_sections(markdown: str):
    """Split the writer's markdown into [{'title', 'blocks'}], dropping the '(n)' numbering.

    Block types: ('h3', text) ('para', text) ('bullets', [text]) ('table', [[cells]])
    """
    sections, current = [], None
    lines = (markdown or "").replace("\r\n", "\n").split("\n")
    para, bullets, table = [], [], []

    def flush():
        nonlocal para, bullets, table
        if current is None:
            para, bullets, table = [], [], []
            return
        if para:
            current["blocks"].append(("para", " ".join(para)))
        if bullets:
            current["blocks"].append(("bullets", bullets))
        if table:
            current["blocks"].append(("table", table))
        para, bullets, table = [], [], []

    for raw in lines:
        line = raw.rstrip()
        m2 = re.match(r"^##\s+(.*)$", line)
        m3 = re.match(r"^#{3,6}\s+(.*)$", line)
        m1 = re.match(r"^#\s+(.*)$", line)
        if m2 or m1:
            flush()
            title = re.sub(r"^\(\s*\d+\s*\)\s*", "", (m2 or m1).group(1)).strip()
            title = re.sub(r"^\d+[.)]\s*", "", title)
            current = {"title": title, "blocks": []}
            sections.append(current)
            continue
        if current is None:
            if line.strip():
                current = {"title": "", "blocks": []}
                sections.append(current)
            else:
                continue
        if m3:
            flush()
            current["blocks"].append(("h3", m3.group(1).strip()))
        elif line.strip().startswith("|"):
            if para or bullets:
                flush()
            if _SEP_ROW.match(line):
                continue
            table.append(_split_row(line))
        elif re.match(r"^\s*([-*•])\s+", line):
            if para or table:
                flush()
            bullets.append(re.sub(r"^\s*([-*•])\s+", "", line))
        elif not line.strip():
            flush()
        else:
            if table or bullets:
                flush()
            para.append(line.strip())
    flush()
    return sections


def find_section(sections, *keywords):
    for s in sections:
        t = s["title"].lower()
        if all(k in t for k in keywords):
            return s
    return None


def section_text(section) -> str:
    if not section:
        return ""
    out = []
    for kind, val in section["blocks"]:
        if kind == "para":
            out.append(val)
        elif kind == "bullets":
            out.extend(val)
        elif kind == "table":
            out.extend(" | ".join(r) for r in val)
    return "\n".join(out).strip()


def parse_verdict(sections):
    """Return (verdict_label, confidence_text) from the 'Final Verdict and Confidence Score' section."""
    text = section_text(find_section(sections, "verdict", "confidence"))
    verdict, conf = "", ""
    m = re.search(r"final\s+verdict\s*[:\-]\s*(.+?)(?:\s*\|\s*confidence|\n|$)", text, re.I)
    if m:
        verdict = re.sub(r"[*_]", "", m.group(1)).strip().rstrip("|").strip()
    m = re.search(r"confidence(?:\s+score)?\s*[:\-]\s*([0-9]+(?:\.[0-9]+)?)\s*%?", text, re.I)
    if m:
        conf = f"{m.group(1)}%"
    return verdict, conf


def verdict_color(verdict: str):
    v = (verdict or "").lower()
    if not v:
        return colors.HexColor("#475569"), colors.HexColor("#F1F5F9")
    if any(k in v for k in ("mixed", "misleading", "partly", "partially", "more evidence", "unverif", "unclear")):
        return colors.HexColor("#B45309"), colors.HexColor("#FFFBEB")
    if "false" in v or "debunk" in v or "fabricat" in v:
        return colors.HexColor("#B91C1C"), colors.HexColor("#FEF2F2")
    if "true" in v or "accurate" in v or "verified" in v:
        return colors.HexColor("#047857"), colors.HexColor("#ECFDF5")
    return colors.HexColor("#475569"), colors.HexColor("#F1F5F9")


# --------------------------------------------------------------------------- page furniture
class NumberedCanvas(canvas.Canvas):
    """Adds the running header and 'Page x of y' footer to every page."""

    report_id = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._decorate(total)
            super().showPage()
        super().save()

    def _decorate(self, total):
        self.saveState()
        self.setFont(FONT_NAME, 8)
        self.setFillColor(MUTED)
        self.setStrokeColor(RULE)
        self.setLineWidth(0.5)
        if self._pageNumber > 1:
            self.drawString(MARGIN, PAGE_H - 38, f"{REPORT_TITLE} — {FRAMEWORK}")
            if self.report_id:
                self.drawRightString(PAGE_W - MARGIN, PAGE_H - 38, self.report_id)
            self.line(MARGIN, PAGE_H - 44, PAGE_W - MARGIN, PAGE_H - 44)
        self.line(MARGIN, 46, PAGE_W - MARGIN, 46)
        self.drawString(MARGIN, 34, "Informational report generated by CRDF — not legal advice.")
        self.drawRightString(PAGE_W - MARGIN, 34, f"Page {self._pageNumber} of {total}")
        self.restoreState()


_SMALL = {"and", "of", "the", "for", "to", "in", "on", "a", "an", "or"}


def pretty_title(title: str) -> str:
    """'EXECUTIVE SUMMARY' -> 'Executive Summary'; 'RISK AND SEVERITY' -> 'Risk & Severity'."""
    t = (title or "").strip()
    if t and t == t.upper():
        words = t.lower().split()
        out = []
        for i, w in enumerate(words):
            if w == "and":
                out.append("&")
            elif w in _SMALL and i > 0:
                out.append(w)
            else:
                out.append("-".join(x.capitalize() for x in w.split("-")))
        t = " ".join(out)
    return t


def _styles():
    base = getSampleStyleSheet()
    S = {}
    S["title"] = ParagraphStyle("t", parent=base["Normal"], fontName=FONT_BOLD, fontSize=22, leading=26, textColor=NAVY, spaceAfter=2)
    S["subtitle"] = ParagraphStyle("st", parent=base["Normal"], fontName=FONT_NAME, fontSize=11, leading=14, textColor=MUTED, spaceAfter=12)
    S["h2"] = ParagraphStyle("h2", parent=base["Normal"], fontName=FONT_BOLD, fontSize=14, leading=18, textColor=NAVY, spaceBefore=14, spaceAfter=6, keepWithNext=True)
    S["h3"] = ParagraphStyle("h3", parent=base["Normal"], fontName=FONT_BOLD, fontSize=10.5, leading=14, textColor=INK, spaceBefore=8, spaceAfter=4, keepWithNext=True)
    S["body"] = ParagraphStyle("b", parent=base["Normal"], fontName=FONT_NAME, fontSize=9.5, leading=14, textColor=BODY, spaceAfter=7)
    S["bullet"] = ParagraphStyle("bl", parent=S["body"], leftIndent=14, bulletIndent=2, spaceAfter=3)
    S["cell"] = ParagraphStyle("c", parent=base["Normal"], fontName=FONT_NAME, fontSize=8.6, leading=11.8, textColor=INK)
    S["cellb"] = ParagraphStyle("cb", parent=S["cell"], fontName=FONT_BOLD)
    S["th"] = ParagraphStyle("th", parent=S["cell"], fontName=FONT_BOLD, textColor=colors.white)
    S["err"] = ParagraphStyle("e", parent=S["body"], textColor=colors.HexColor("#B91C1C"))
    S["label"] = ParagraphStyle("lb", parent=S["cell"], fontName=FONT_BOLD, fontSize=8, textColor=MUTED, alignment=1, spaceAfter=3)
    return S


_NARROW_HEADERS = {"#", "stance", "type", "severity", "credibility score", "credibility", "points", "weight", "effect on confidence", "date"}


def _col_widths(rows, total):
    """Column widths: never narrower than the longest single word (so nothing breaks mid-word),
    the rest shared in proportion to how much text each column holds."""
    ncols = max(len(r) for r in rows)
    mins, weights = [], []
    for c in range(ncols):
        cells = [r[c] for r in rows if c < len(r)]
        longest = max((pdfmetrics.stringWidth(w, FONT_BOLD, 8.6)
                       for cell in cells for w in re.sub(r"[*`]", "", cell).split()), default=20)
        mins.append(min(longest + 16, total * 0.45))
        head = cells[0].strip().lower() if cells else ""
        lens = [len(x) for x in cells[1:]] or [8]
        w = min(max(sum(lens) / len(lens), 8), 70)
        if head in _NARROW_HEADERS or head.startswith("points"):
            w = min(w, 10)
        weights.append(w)
    spare = max(total - sum(mins), 0)
    wsum = sum(weights)
    widths = [m + spare * w / wsum for m, w in zip(mins, weights)]
    scale = total / sum(widths)
    return [w * scale for w in widths]


def build_table(rows, S, header=True, label_col=False):
    ncols = max(len(r) for r in rows)
    norm = [r + [""] * (ncols - len(r)) for r in rows]
    data = []
    for i, r in enumerate(norm):
        if header and i == 0:
            data.append([Paragraph(md_inline(c), S["th"]) for c in r])
        else:
            data.append([Paragraph(md_inline(c), S["cellb"] if (label_col and j == 0) else S["cell"]) for j, c in enumerate(r)])
    t = Table(data, colWidths=_col_widths(norm, CONTENT_W), repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.5, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), NAVY))
    start = 1 if header else 0
    for i in range(start, len(data)):
        if (i - start) % 2 == 1:
            style.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(style))
    return t


def verdict_banner(verdict, confidence, S):
    fg, bg = verdict_color(verdict)
    vstyle = ParagraphStyle("v", parent=S["cell"], fontName=FONT_BOLD, fontSize=15, leading=19, textColor=fg, alignment=1)
    cstyle = ParagraphStyle("cv", parent=vstyle, fontSize=22, leading=26)
    left = [Paragraph("FINAL VERDICT", S["label"]), Paragraph(md_inline((verdict or "NOT DETERMINED").upper()), vstyle)]
    right = [Paragraph("CONFIDENCE SCORE", S["label"]), Paragraph(escape_xml(confidence or "N/A"), cstyle)]
    t = Table([[left, right]], colWidths=[CONTENT_W * 0.66, CONTENT_W * 0.34])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 1.2, fg),
        ("LINEBEFORE", (1, 0), (1, 0), 0.6, fg),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    return t


def render_blocks(blocks, S, is_references=False):
    out = []
    for kind, val in blocks:
        if kind == "h3":
            out.append(Paragraph(md_inline(val), S["h3"]))
        elif kind == "para":
            if is_references:
                items = re.findall(r"https?://\S+", val) or [val]
                for it in items:
                    out.append(Paragraph(md_inline(it.rstrip(".,;")), S["bullet"], bulletText="•"))
            else:
                out.append(Paragraph(md_inline(val), S["body"]))
        elif kind == "bullets":
            for b in val:
                out.append(Paragraph(md_inline(b), S["bullet"], bulletText="•"))
            out.append(Spacer(1, 4))
        elif kind == "table":
            out.append(build_table(val, S))
            out.append(Spacer(1, 8))
    return out


def multimodal_rows(mm: dict):
    """Rows for the uploaded-file analysis table; empty when nothing was uploaded."""
    rows = []
    mm = mm or {}

    def check_rows(label, a):
        if not isinstance(a, dict) or not a.get(f"has_{label.lower()}"):
            return
        mc, cc = a.get("manipulation_check") or {}, a.get("content_match_check") or {}
        rows.append([label, "Manipulation check", "Appears manipulated" if mc.get("appears_manipulated") else "No manipulation detected", mc.get("reasoning", "")])
        m = cc.get("matches_claim")
        rows.append([label, "Content match", {True: "Matches claim", False: "Does not match claim"}.get(m, str(m or "Undetermined").capitalize()), cc.get("reasoning", "")])

    check_rows("Image", mm.get("image_analysis"))
    check_rows("Video", mm.get("video_analysis"))
    d = mm.get("document_analysis") or {}
    if d.get("has_document"):
        txt = (d.get("extracted_text") or "").strip()
        rows.append(["Document", "Text extraction", "Text extracted" if txt else "No readable text", (txt[:600] + "…") if len(txt) > 600 else txt])
    return rows


# --------------------------------------------------------------------------- main entry point
def generate_pdf_report(data: dict, output_filepath: str):
    work_dir = tempfile.mkdtemp(prefix="crdf_pdf_")
    tmp_out = output_filepath + ".tmp"
    try:
        data = data or {}
        claim = (data.get("claim") or "Untitled claim").strip()
        report_md = data.get("text_pipeline_report") or ""
        pipeline_error = data.get("text_pipeline_error")
        mm_rows = multimodal_rows(data.get("multimodal_results") or {})
        S = _styles()

        sections = parse_sections(report_md) if report_md.strip() else []
        header_sec = find_section(sections, "header")
        verdict, confidence = parse_verdict(sections)

        # Report id for the running header
        report_id = ""
        if header_sec:
            for kind, val in header_sec["blocks"]:
                if kind == "table":
                    for row in val:
                        if row and row[0].strip().lower() == "report id" and len(row) > 1:
                            report_id = row[1].strip()
        NumberedCanvas.report_id = report_id

        doc = SimpleDocTemplate(tmp_out, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN,
                                topMargin=62, bottomMargin=62, title=REPORT_TITLE, author="CRDF")
        story = [Paragraph(REPORT_TITLE, S["title"]), Paragraph(FRAMEWORK, S["subtitle"])]

        is_clarification = bool(pipeline_error) and "clarification" in str(pipeline_error).lower()

        # ---- header table (Field / Value)
        header_rows = [["Field", "Value"]]
        if header_sec:
            for kind, val in header_sec["blocks"]:
                if kind == "table":
                    for row in val[1:] if val and val[0] and val[0][0].strip().lower() == "field" else val:
                        if len(row) >= 2:
                            k, v = row[0], row[1]
                            if k.strip().lower() == "submission date" and not re.search(r"\d", v):
                                v = now_ist_string()
                            header_rows.append([k, v])
        if len(header_rows) == 1:
            header_rows += [["Claim", claim], ["Report Date", now_ist_string()]]
        story.append(build_table(header_rows, S, label_col=True))
        story.append(Spacer(1, 14))

        # ---- degraded modes: no report available
        if not sections:
            if is_clarification:
                story.append(Paragraph("Clarification Needed", S["h2"]))
                story.append(Paragraph("The intake agent paused processing because the claim needs more detail before it can be verified.", S["body"]))
                story.append(Paragraph(md_inline(pipeline_error), S["body"]))
            else:
                story.append(Paragraph("Report Unavailable", S["h2"]))
                msg = f"The verification pipeline did not produce a report. {pipeline_error}" if pipeline_error else "The verification pipeline did not produce a report for this claim."
                story.append(Paragraph(md_inline(msg), S["err"]))
            story.append(Paragraph("Submitted Claim", S["h2"]))
            story.append(Paragraph(md_inline(claim), S["body"]))
        else:
            story.append(verdict_banner(verdict, confidence, S))
            story.append(Spacer(1, 6))
            for sec in sections:
                title = sec["title"]
                tl = title.lower()
                if "header" in tl or ("verdict" in tl and "confidence" in tl):
                    continue  # already shown as the header table and the banner
                is_ref = "reference" in tl
                body = render_blocks(sec["blocks"], S, is_references=is_ref)
                if not body:
                    continue
                head = Paragraph(md_inline(pretty_title(title)), S["h2"]) if title else None
                # keep the heading attached to the first block
                lead = 2 if len(body) > 1 and body[0].__class__.__name__ == "Paragraph" and body[1].__class__.__name__ == "Table" else 1
                story.append(KeepTogether([x for x in [head] + body[:lead] if x is not None]))
                story.extend(body[lead:])
                if "evidence summary" in tl and mm_rows:
                    story.append(Paragraph("Multimodal Evidence Analysis", S["h2"]))
                    story.append(build_table([["Input", "Check", "Finding", "Reasoning"]] + mm_rows, S))
                    story.append(Spacer(1, 8))
            if mm_rows and not find_section(sections, "evidence summary"):
                story.append(Paragraph("Multimodal Evidence Analysis", S["h2"]))
                story.append(build_table([["Input", "Check", "Finding", "Reasoning"]] + mm_rows, S))
            if pipeline_error and not is_clarification:
                story.append(Paragraph(f"Pipeline notice: {md_inline(pipeline_error)}", S["err"]))

        doc.build(story, canvasmaker=NumberedCanvas)
        shutil.move(tmp_out, output_filepath)  # atomic hand-over
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
        if os.path.exists(tmp_out):
            try:
                os.remove(tmp_out)
            except OSError:
                pass
