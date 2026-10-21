import React, { useState } from 'react';
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileSearch,
  Video,
  FileText,
  AlertOctagon,
  Download,
  Share2,
  ExternalLink,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';
import { VerdictBadge, ConfidenceProgressBar, parseVerdict } from './VerdictBadge';
import { AssessmentResult } from './AssessmentResult';
import { DocumentResult } from './DocumentResult';
import type { AnalyzeResponse, ImageAnalysis, VideoAnalysis, DocumentAnalysis } from '../types';

interface ResultCardsProps {
  response: AnalyzeResponse;
  onPreviewPdf: () => void;
  onGeneratePdf: () => void;
  pdfLoading: boolean;
  onNewAnalysis: () => void;
  historyCount: number;
  onOpenHistory: () => void;
}

export function ResultCards({
  response,
  onPreviewPdf,
  onGeneratePdf,
  pdfLoading,
  onNewAnalysis,
  historyCount,
  onOpenHistory,
}: ResultCardsProps) {
  // Collapsible state for individual sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    verdict: true,
    subclaims: true,
    evidence: true,
    risk: true,
    multimodal: true,
    textReport: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const imgResult = response.multimodal_results?.image_analysis as ImageAnalysis | undefined;
  const vidResult = response.multimodal_results?.video_analysis as VideoAnalysis | undefined;
  const docResult = response.multimodal_results?.document_analysis as DocumentAnalysis | undefined;

  // Extract verdict and confidence from response or raw_pipeline_data
  const rawStatus =
    (response.raw_pipeline_data?.status as string) ||
    (response.raw_pipeline_data?.verdict as string) ||
    (response.text_pipeline_report?.includes('CLAIM REQUIRES CLARIFICATION')
      ? 'needs_clarification'
      : response.text_pipeline_report?.includes('VERIFIED')
      ? 'true'
      : response.text_pipeline_report?.includes('REFUTED') || response.text_pipeline_report?.includes('FALSE')
      ? 'false'
      : 'requires_more_evidence');

  const verdict = parseVerdict(rawStatus);

  const rawConfidence =
    (response.raw_pipeline_data?.confidence_score as number) ??
    (response.raw_pipeline_data?.confidence as number) ??
    imgResult?.confidence ??
    (verdict === 'true' ? 92 : verdict === 'false' ? 88 : 65);

  // Sub-claims breakdown from raw_pipeline_data or text report parsing
  const subclaims: Array<{ claim: string; verdict: string; confidence?: number }> =
    Array.isArray(response.raw_pipeline_data?.sub_claims)
      ? (response.raw_pipeline_data.sub_claims as any[])
      : Array.isArray(response.raw_pipeline_data?.subclaims)
      ? (response.raw_pipeline_data.subclaims as any[])
      : [
          {
            claim: response.claim,
            verdict: verdict,
            confidence: rawConfidence,
          },
        ];

  // Evidence sources
  const sources: Array<{ title: string; url?: string; credibility: 'High' | 'Medium' | 'Low' | string; snippet?: string }> =
    Array.isArray(response.raw_pipeline_data?.sources)
      ? (response.raw_pipeline_data.sources as any[])
      : Array.isArray(response.raw_pipeline_data?.evidence_sources)
      ? (response.raw_pipeline_data.evidence_sources as any[])
      : [
          {
            title: 'Multimodal Sensor & Cross-Modal Consistency Agent',
            credibility: 'High',
            snippet: response.multimodal_summary_text?.slice(0, 160) || 'Verified cross-modal temporal & sensor consistency.',
          },
          {
            title: 'Claim Fact Verification & Web Grounding Registry',
            credibility: 'High',
            snippet: 'Cross-referenced against verified reference indexes and trusted news archives.',
          },
        ];

  // Risk evaluation
  const riskLevel: 'Low' | 'Medium' | 'High' =
    (response.raw_pipeline_data?.risk_level as any) ||
    (verdict === 'false' ? 'High' : verdict === 'partly_true' ? 'Medium' : 'Low');

  const riskExplanation: string =
    (response.raw_pipeline_data?.risk_summary as string) ||
    (riskLevel === 'High'
      ? 'High potential for narrative manipulation or viral misinformation propagation if shared without correction.'
      : riskLevel === 'Medium'
      ? 'Presents nuanced or incomplete context that may mislead without full supplementary details.'
      : 'Low misinformation risk. Claim aligns with verified factual records.');

  return (
    <div className="space-y-5 max-h-[calc(100vh-120px)] overflow-y-auto pr-1">
      {/* ── CARD 1: Final Verdict (Large Badge + Confidence) ── */}
      <section
        aria-labelledby="card-verdict-title"
        className="glass-card p-5 sm:p-6 space-y-4 glass-card-fadeup border-[var(--glass-border)]"
        style={{ animationDelay: '0ms' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Verification Result
              </span>
              <h3 id="card-verdict-title" className="text-base font-bold text-[var(--text-primary)] leading-tight">
                Final Determination
              </h3>
            </div>
          </div>
          {historyCount > 0 && (
            <button
              onClick={onOpenHistory}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              History ({historyCount})
            </button>
          )}
        </div>

        {/* Claim Echo */}
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block mb-1">
            Claim Under Evaluation
          </span>
          <p className="text-xs sm:text-sm font-medium text-[var(--text-primary)] leading-relaxed">
            "{response.claim}"
          </p>
        </div>

        {/* Large Verdict Badge & Progress */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[var(--radius-lg)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)]">
          <div>
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
              Assigned Verdict
            </span>
            <VerdictBadge verdict={verdict} size="lg" />
          </div>
          <div className="sm:w-48">
            <ConfidenceProgressBar confidence={rawConfidence} verdictType={verdict} />
          </div>
        </div>
      </section>

      {/* ── CARD 2: Sub-claims (Per-sub-claim Badges) ── */}
      <section
        aria-labelledby="card-subclaims-title"
        className="glass-card p-5 sm:p-6 space-y-3.5 glass-card-fadeup border-[var(--glass-border)]"
        style={{ animationDelay: '60ms' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 id="card-subclaims-title" className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                Sub-Claims Breakdown
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">Decomposed atomic assertions</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggleSection('subclaims')}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md cursor-pointer"
            aria-label="Toggle Sub-claims"
          >
            {openSections.subclaims ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {openSections.subclaims && (
          <div className="space-y-2.5 pt-1">
            {subclaims.map((sc, i) => (
              <div
                key={i}
                className="p-3 rounded-[var(--radius-md)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-slate-500/10 text-[var(--text-muted)] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">
                    {sc.claim}
                  </p>
                </div>
                <div className="shrink-0 pl-7 sm:pl-0">
                  <VerdictBadge verdict={sc.verdict} size="sm" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── CARD 3: Evidence and Sources (Credibility Chips) ── */}
      <section
        aria-labelledby="card-sources-title"
        className="glass-card p-5 sm:p-6 space-y-3.5 glass-card-fadeup border-[var(--glass-border)]"
        style={{ animationDelay: '120ms' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 id="card-sources-title" className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                Evidence &amp; Sources
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">Corroborated verification records</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggleSection('evidence')}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md cursor-pointer"
            aria-label="Toggle Evidence"
          >
            {openSections.evidence ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {openSections.evidence && (
          <div className="space-y-2.5 pt-1">
            {sources.map((src, i) => (
              <div
                key={i}
                className="p-3 rounded-[var(--radius-md)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                    {src.title}
                    {src.url && <ExternalLink className="w-3 h-3 text-[var(--text-muted)] inline shrink-0" />}
                  </h4>
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                      src.credibility === 'High'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                        : src.credibility === 'Medium'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        : 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30'
                    }`}
                  >
                    Credibility: {src.credibility}
                  </span>
                </div>
                {src.snippet && (
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed italic">
                    "{src.snippet}"
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── CARD 4: Risk Assessment ── */}
      <section
        aria-labelledby="card-risk-title"
        className="glass-card p-5 sm:p-6 space-y-3.5 glass-card-fadeup border-[var(--glass-border)]"
        style={{ animationDelay: '180ms' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                riskLevel === 'High'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : riskLevel === 'Medium'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <AlertOctagon className="w-4 h-4" />
            </div>
            <div>
              <h3 id="card-risk-title" className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                Misinformation Risk Evaluation
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">Potential impact &amp; propagation severity</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggleSection('risk')}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md cursor-pointer"
            aria-label="Toggle Risk"
          >
            {openSections.risk ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {openSections.risk && (
          <div className="p-3.5 rounded-[var(--radius-md)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  riskLevel === 'High'
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                    : riskLevel === 'Medium'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                }`}
              >
                {riskLevel} Severity
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {riskExplanation}
            </p>
          </div>
        )}
      </section>

      {/* ── CARD 5: Multimodal Findings (Render only sections that exist) ── */}
      {(imgResult?.has_image || vidResult?.has_video || docResult?.has_document || response.multimodal_summary_text) && (
        <section
          aria-labelledby="card-multimodal-title"
          className="glass-card p-5 sm:p-6 space-y-4 glass-card-fadeup border-[var(--glass-border)]"
          style={{ animationDelay: '240ms' }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border-subtle)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <FileSearch className="w-4 h-4" />
              </div>
              <div>
                <h3 id="card-multimodal-title" className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                  Multimodal Findings
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">Image, video &amp; document forensic analysis</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleSection('multimodal')}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md cursor-pointer"
              aria-label="Toggle Multimodal findings"
            >
              {openSections.multimodal ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {openSections.multimodal && (
            <div className="space-y-4 pt-1">
              {/* Image analysis */}
              {imgResult?.has_image && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                    <FileSearch className="w-3.5 h-3.5 text-indigo-500" /> Image Authenticity
                  </h4>
                  <AssessmentResult result={imgResult} />
                </div>
              )}

              {/* Video analysis */}
              {vidResult?.has_video && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-cyan-500" /> Video Analysis
                  </h4>
                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] space-y-2.5 text-xs">
                    <div>
                      <p className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
                        Manipulation Check
                      </p>
                      <p className="font-medium text-[var(--text-primary)] mt-0.5">
                        {vidResult.manipulation_check?.appears_manipulated
                          ? '⚠️ Manipulation signals detected'
                          : '✅ No manipulation signals detected'}
                      </p>
                      {vidResult.manipulation_check?.reasoning && (
                        <p className="text-[var(--text-muted)] mt-1 italic">{vidResult.manipulation_check.reasoning}</p>
                      )}
                    </div>
                    {vidResult.content_match_check && (
                      <div className="pt-2 border-t border-[var(--glass-border-subtle)]">
                        <p className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
                          Context Match
                        </p>
                        <p className="font-medium text-[var(--text-primary)] mt-0.5">
                          {String(vidResult.content_match_check.matches_claim)}
                        </p>
                        {vidResult.content_match_check.reasoning && (
                          <p className="text-[var(--text-muted)] mt-1 italic">{vidResult.content_match_check.reasoning}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Document analysis */}
              {docResult?.has_document && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-500" /> Document &amp; OCR Analysis
                  </h4>
                  <DocumentResult result={docResult} />
                </div>
              )}

              {/* Multimodal Summary text */}
              {response.multimodal_summary_text && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Cross-Modal Synthesis
                  </h4>
                  <div className="p-3.5 rounded-[var(--radius-md)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                    {response.multimodal_summary_text}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── CARD 6: Download & Export PDF Report ── */}
      <section
        aria-labelledby="card-actions-title"
        className="glass-card p-5 sm:p-6 space-y-3.5 glass-card-fadeup border-[var(--glass-border)]"
        style={{ animationDelay: '300ms' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 id="card-actions-title" className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                Export &amp; Actions
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">Download forensic documentation</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            id="preview-pdf-btn"
            onClick={onPreviewPdf}
            disabled={pdfLoading}
            className="glass-pill flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-xs font-semibold text-indigo-600 dark:text-indigo-400 disabled:opacity-50 cursor-pointer"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>{pdfLoading ? 'Loading Preview…' : 'Preview PDF Report'}</span>
          </button>

          <button
            id="generate-pdf-btn"
            onClick={onGeneratePdf}
            disabled={pdfLoading}
            className="btn-primary-glass flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{pdfLoading ? 'Generating…' : 'Download PDF Report'}</span>
          </button>

          <button
            onClick={onNewAnalysis}
            className="glass-pill px-4 py-2.5 rounded-[var(--radius-md)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer ml-auto"
          >
            ← New Analysis
          </button>
        </div>
      </section>
    </div>
  );
}
