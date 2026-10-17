/**
 * Client-side PDF Report Generator for CRDF System using jsPDF.
 * Generates an accessible, selectable, searchable A4 PDF report.
 */
import { jsPDF } from 'jspdf';
import { AnalysisResult } from './api';
import { AgentStep } from './agents';

export interface AttachedMediaReportItem {
  name: string;
  type: 'image' | 'video' | 'document';
  sizeBytes: number;
}

export interface ReportData {
  claim: string;
  result: AnalysisResult;
  isMock: boolean;
  attachedMedia?: AttachedMediaReportItem[];
}

export function generateReport(data: ReportData): void {
  const { claim, result, isMock, attachedMedia = [] } = data;

  let unsupportedCharDetected = false;

  // Normalise typographical quotes, apostrophes, dashes, and symbols
  // so jsPDF built-in Helvetica renders them without replacing with '?'
  const normalizeTypography = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"') // double quotes: “ ” „ ‟ « »
      .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")       // single quotes / apostrophe: ‘ ’ ‚ ‛ ′
      .replace(/[\u2013\u2014\u2015]/g, '-')                   // en-dash, em-dash, horizontal bar: – — ―
      .replace(/[\u2026]/g, '...')                             // ellipsis: …
      .replace(/[\u2022\u2023\u25E6]/g, '*')                   // bullets: • ‣ ◦
      .replace(/[\u00A0]/g, ' ');                              // non-breaking space
  };

  // Replaces non-Latin characters genuinely unsupported by jsPDF standard fonts with '?'
  const sanitize = (text: string): string => {
    if (!text) return '';
    const normalized = normalizeTypography(text);
    return normalized.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, () => {
      unsupportedCharDetected = true;
      return '?';
    });
  };

  const safeClaim = sanitize(claim || 'No claim text provided.');
  const safeVerdict = sanitize(result.verdict || 'Undetermined');
  const safeNote = sanitize(result.note || '');
  const confidence = result.confidence ?? 0;
  const steps: AgentStep[] = result.steps || [];

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  // Format: "16 Oct 2026, 14:32"
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDate = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // Unique report ID: CRDF-YYYYMMDD-HHMMSS
  const reportId = `CRDF-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  // Initialize jsPDF (A4 portrait in mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 15;
  const contentWidth = pageWidth - marginX * 2; // 180mm
  const bottomLimit = pageHeight - 20; // 277mm max before page break
  let currentY = 15;

  const ensureSpace = (neededHeight: number): void => {
    if (currentY + neededHeight > bottomLimit) {
      doc.addPage();
      currentY = 15;
    }
  };

  // --- 1. HEADER ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // #0f172a
  const headerTitle = isMock ? 'CRDF System [MOCK REPORT]' : 'CRDF System';
  doc.text(headerTitle, marginX, currentY);
  currentY += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(84, 96, 121); // #546079
  doc.text('Claim vs Reality Determination Framework', marginX, currentY);
  currentY += 4;

  // Thin accent line
  doc.setDrawColor(isMock ? 217 : 79, isMock ? 119 : 70, isMock ? 6 : 229);
  doc.setLineWidth(0.6);
  doc.line(marginX, currentY, marginX + contentWidth, currentY);
  currentY += 7;

  // --- 2. ANALYSIS REPORT META ---
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(isMock ? 'Analysis report (MOCK SIMULATION)' : 'Analysis report', marginX, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const metaText = `Generated: ${formattedDate}   |   Report ID: ${reportId}`;
  doc.text(metaText, marginX + contentWidth, currentY, { align: 'right' });
  currentY += 7;

  // --- 3. CLAIM ---
  ensureSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Claim (${safeClaim.length} characters)`, marginX, currentY);
  currentY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  const claimLines = doc.splitTextToSize(safeClaim, contentWidth);
  for (const line of claimLines) {
    ensureSpace(4.5);
    doc.text(line, marginX, currentY);
    currentY += 4.5;
  }

  // Small grey note if any unsupported characters were replaced
  if (unsupportedCharDetected) {
    ensureSpace(5);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Some characters could not be rendered in PDF.', marginX, currentY);
    currentY += 4.5;
  }
  currentY += 3;

  // --- 4. DETERMINATION BOX ---
  ensureSpace(38);
  const detBoxY = currentY;
  const isMockAlert = isMock || (result.note ? result.note.includes('Mock result') : false);
  const boxHeight = isMockAlert ? 34 : 26;

  // Box background & border
  doc.setFillColor(isMockAlert ? 255 : 248, isMockAlert ? 251 : 250, isMockAlert ? 235 : 252);
  doc.setDrawColor(isMockAlert ? 245 : 226, isMockAlert ? 158 : 232, isMockAlert ? 11 : 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX, detBoxY, contentWidth, boxHeight, 2.5, 2.5, 'FD');

  // Verdict color determination
  const lowerV = safeVerdict.toLowerCase();
  let verdictColor = [16, 185, 129]; // green
  if (lowerV.includes('false') || lowerV.includes('debunked')) {
    verdictColor = [239, 68, 68]; // red
  } else if (lowerV.includes('partially') || lowerV.includes('more evidence') || lowerV.includes('unverifiable')) {
    verdictColor = [217, 119, 6]; // amber
  }

  // Verdict text (labeled MOCK if in mock mode)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(verdictColor[0], verdictColor[1], verdictColor[2]);
  const displayVerdict = isMock ? `MOCK: ${safeVerdict}` : safeVerdict;
  doc.text(displayVerdict, marginX + 4, detBoxY + 7);

  // Confidence text (labeled MOCK if in mock mode)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  const displayConfidence = isMock ? `Confidence: MOCK (${confidence}%)` : `Confidence: ${confidence}%`;
  doc.text(displayConfidence, marginX + contentWidth - 4, detBoxY + 7, { align: 'right' });

  // Note text (wrapped inside box)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const noteLines = doc.splitTextToSize(safeNote, contentWidth - 8);
  let noteY = detBoxY + 12.5;
  for (const nLine of noteLines.slice(0, 2)) {
    doc.text(nLine, marginX + 4, noteY);
    noteY += 4;
  }

  // Mock Result Warning (amber, bold) if mock mode was ON
  if (isMockAlert) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text('MOCK RESULT: no backend was called. Do not treat as a real determination.', marginX + 4, detBoxY + 28);
  }

  currentY = detBoxY + boxHeight + 6;

  // --- 5. SUPPORTING MEDIA ---
  ensureSpace(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Supporting media', marginX, currentY);
  currentY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  if (attachedMedia.length === 0) {
    doc.text('None attached', marginX, currentY);
    currentY += 6;
  } else {
    for (const item of attachedMedia) {
      ensureSpace(4.5);
      const sizeMb = (item.sizeBytes / (1024 * 1024)).toFixed(2);
      const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);
      doc.text(`- ${typeLabel}: ${sanitize(item.name)} (${sizeMb} MB)`, marginX + 2, currentY);
      currentY += 4.5;
    }
    currentY += 2;
  }

  // --- 6. AGENT PIPELINE TABLE ---
  ensureSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Agent pipeline execution', marginX, currentY);
  currentY += 5;

  // Table header helper function (repeats across pages)
  const drawTableHeader = (y: number): number => {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(marginX, y, contentWidth, 6.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // slate-600

    doc.text('#', marginX + 3, y + 4.5);
    doc.text('Agent', marginX + 16, y + 4.5);
    doc.text('Status', marginX + 130, y + 4.5);
    doc.text('Time', marginX + 162, y + 4.5);

    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.3);
    doc.line(marginX, y + 6.5, marginX + contentWidth, y + 6.5);
    return y + 6.5;
  };

  currentY = drawTableHeader(currentY);

  let completedCount = 0;
  let skippedCount = 0;
  let totalMs = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isSkipped = step.status === 'skipped';
    if (isSkipped) skippedCount++;
    else completedCount++;
    totalMs += step.durationMs;

    const rowHeight = 6;
    if (currentY + rowHeight > bottomLimit) {
      doc.addPage();
      currentY = 15;
      currentY = drawTableHeader(currentY);
    }

    // Zebra striping for table rows
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, currentY, contentWidth, rowHeight, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(String(i + 1), marginX + 3, currentY + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(sanitize(step.agent), marginX + 16, currentY + 4.2);

    if (isSkipped) {
      doc.setTextColor(148, 163, 184);
      doc.text('Skipped', marginX + 130, currentY + 4.2);
      doc.text('-', marginX + 162, currentY + 4.2);
    } else {
      doc.setTextColor(16, 185, 129);
      doc.text('Completed', marginX + 130, currentY + 4.2);
      doc.setTextColor(15, 23, 42);
      doc.text(`${step.durationMs} ms`, marginX + 162, currentY + 4.2);
    }

    // Row bottom border
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(marginX, currentY + rowHeight, marginX + contentWidth, currentY + rowHeight);

    currentY += rowHeight;
  }

  // Summary line after table
  ensureSpace(10);
  currentY += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Total: ${totalMs} ms · ${steps.length} steps (${completedCount} completed, ${skippedCount} skipped)`,
    marginX,
    currentY
  );
  currentY += 8;

  // --- 7. FOOTER ON EVERY PAGE ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Subtle divider
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 14, marginX + contentWidth, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Generated by CRDF System', marginX, pageHeight - 9);
    doc.text(`Page ${p} of ${totalPages}`, marginX + contentWidth, pageHeight - 9, { align: 'right' });
  }

  // Filename format: crdf-report-YYYYMMDD-HHmm.pdf
  const filename = `crdf-report-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.pdf`;

  // Save the PDF
  doc.save(filename);
}
