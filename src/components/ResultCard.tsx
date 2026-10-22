import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  AlertOctagon,
  Check,
  Clock,
  Sparkles,
  Info,
  Download,
  Eye,
  ExternalLink,
  X,
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AnalysisResult, generatePdf } from '../lib/api';
import { generateReport, getReportBlobUrl, AttachedMediaReportItem } from '../lib/generateReport';

export interface ResultCardProps {
  result: AnalysisResult | null;
  error: string | null;
  onTurnOnMock?: () => void;
  claim?: string;
  isMock?: boolean;
  attachedMedia?: AttachedMediaReportItem[];
  isRunning?: boolean;
}

export const ResultCard: React.FC<ResultCardProps> = ({
  result,
  error,
  onTurnOnMock,
  claim = '',
  isMock = false,
  attachedMedia = [],
  isRunning = false,
}) => {
  const [pdfState, setPdfState] = useState<'idle' | 'preparing' | 'downloaded'>('idle');
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState<boolean>(false);

  if (!result && !error) {
    return null;
  }

  // Error State: button is hidden/disabled
  if (error) {
    return (
      <section
        aria-live="polite"
        className="glass-panel p-6 sm:p-8 mt-6 border-rose-500/40 bg-rose-500/5 shadow-lg"
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Red Error Ring */}
          <div className="relative shrink-0 flex items-center justify-center">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center shadow-inner"
              style={{
                background: `conic-gradient(#ef4444 0deg, #ef4444 360deg)`,
              }}
            >
              <div className="w-[74px] h-[74px] rounded-full bg-[var(--glass-bg-elevated)] flex flex-col items-center justify-center text-center p-1">
                <AlertOctagon className="w-6 h-6 text-rose-500" />
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mt-0.5">
                  Error
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold mb-2">
              <XCircle className="w-3.5 h-3.5" />
              <span>Analysis failed</span>
            </div>

            <h3 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
              Backend Request Unsuccessful
            </h3>

            <p className="text-sm font-medium text-rose-600 dark:text-rose-300 mt-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 font-mono break-words">
              {error}
            </p>

            <div className="mt-4 p-3.5 rounded-xl bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
              <div className="flex items-center gap-2 text-center sm:text-left">
                <Info className="w-4 h-4 shrink-0 text-amber-500" />
                <span>Verify that your CRDF backend is running, or switch back to Mock Mode to preview full pipeline results.</span>
              </div>
              {onTurnOnMock && (
                <button
                  type="button"
                  onClick={onTurnOnMock}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[var(--accent-indigo)] hover:brightness-110 transition cursor-pointer shadow-xs"
                >
                  Turn ON Mock Mode
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!result) return null;

  const { verdict, confidence, note, steps } = result;

  // Determine status color scheme
  const lowerVerdict = verdict.toLowerCase();
  let ringColor = '#10b981'; // Green
  let badgeClass = 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300';
  let VerdictIcon = ShieldCheck;

  if (lowerVerdict.includes('false') || lowerVerdict.includes('debunked')) {
    ringColor = '#ef4444'; // Red
    badgeClass = 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300';
    VerdictIcon = XCircle;
  } else if (lowerVerdict.includes('partially') || lowerVerdict.includes('more evidence') || lowerVerdict.includes('unverifiable')) {
    ringColor = '#f59e0b'; // Amber
    badgeClass = 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300';
    VerdictIcon = AlertTriangle;
  }

  const deg = (confidence / 100) * 360;

  const handleDownloadPdf = async () => {
    if (pdfState === 'preparing' || isRunning) return;
    setPdfError(null);
    setPdfState('preparing');

    try {
      if (!isMock && result.raw) {
        // Live result: backend renders the official CRDF report layout.
        const blob = await generatePdf(claim, result);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CRDF_Report_${claim.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30)}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        generateReport({ claim, result, isMock, attachedMedia });
      }

      setPdfState('downloaded');
      setTimeout(() => {
        setPdfState('idle');
      }, 2000);
    } catch (err: any) {
      console.error('PDF generation failure:', err);
      setPdfError(err?.message || 'Could not create the PDF. Please try again.');
      setPdfState('idle');
    }
  };

  const handlePreviewPdf = async () => {
    if (isRunning) return;
    try {
      setPdfError(null);
      let url: string;
      if (!isMock && result.raw) {
        url = URL.createObjectURL(await generatePdf(claim, result));
      } else {
        url = getReportBlobUrl({ claim, result, isMock, attachedMedia }).url;
      }
      setPreviewUrl(url);
      setIsPreviewOpen(true);
    } catch (err: any) {
      console.error('PDF preview failure:', err);
      setPdfError(err?.message || 'Could not render PDF preview.');
    }
  };

  const renderPdfActions = (isMobileSlot: boolean) => (
    <div className={isMobileSlot ? 'block min-[560px]:hidden mt-3.5 w-full' : 'hidden min-[560px]:flex items-center gap-2'}>
      <div className={`flex items-center gap-2 ${isMobileSlot ? 'w-full' : ''}`}>
        {/* Preview Button */}
        <button
          type="button"
          onClick={handlePreviewPdf}
          disabled={isRunning || !result}
          aria-label="Preview analysis report PDF"
          className="glass-button-ghost flex-1 min-[560px]:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[12px] text-xs font-bold text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/40 hover:border-[var(--accent-indigo)] hover:bg-[var(--glass-bg)] transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-indigo)] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
        >
          <Eye className="w-3.5 h-3.5 text-[var(--accent-indigo)]" />
          <span>Preview PDF</span>
        </button>

        {/* Download Button */}
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={isRunning || pdfState === 'preparing'}
          aria-label="Download analysis report as PDF"
          className="glass-button-ghost flex-1 min-[560px]:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[12px] text-xs font-bold text-[var(--text-primary)] border border-[var(--glass-border)] hover:border-[var(--accent-indigo)] hover:bg-[var(--glass-bg)] transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-indigo)] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
        >
          {pdfState === 'preparing' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-indigo)]" />
              <span>Preparing…</span>
            </>
          ) : pdfState === 'downloaded' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span>Downloaded ✓</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5 text-[var(--accent-indigo)]" />
              <span>Download PDF</span>
            </>
          )}
        </button>
      </div>

      {pdfError && (
        <p role="alert" className="text-xs font-semibold text-rose-500 mt-1 text-center min-[560px]:text-right">
          {pdfError}
        </p>
      )}
    </div>
  );

  return (
    <>
      <section
        aria-live="polite"
        className="glass-panel p-6 sm:p-8 mt-6 transition-all duration-300 shadow-xl"
      >
        {/* Header section with ring and verdict */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-[var(--glass-border-subtle)]">
          {/* Conic Gradient Confidence Ring */}
          <div className="relative shrink-0 flex items-center justify-center">
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 duration-300"
              style={{
                background: `conic-gradient(${ringColor} 0deg, ${ringColor} ${deg}deg, rgba(148, 163, 184, 0.2) ${deg}deg 360deg)`,
              }}
            >
              <div className="w-[86px] h-[86px] rounded-full bg-[var(--glass-bg-elevated)] backdrop-blur-md flex flex-col items-center justify-center text-center p-1 border border-[var(--glass-border)]">
                {isMock ? (
                  <>
                    <span className="text-sm font-black tracking-tight text-amber-600 dark:text-amber-400 uppercase">
                      MOCK
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[var(--text-muted)]">
                      {confidence}% Sim
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-black tracking-tight text-[var(--text-primary)]">
                      {confidence}%
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                      Confidence
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Verdict Info */}
          <div className="flex-1 w-full text-center sm:text-left">
            {/* Top row with verdict badge & PDF action buttons (in line on >= 560px) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-extrabold uppercase tracking-wide ${badgeClass}`}>
                  <VerdictIcon className="w-4 h-4" />
                  <span>{isMock ? `MOCK: ${verdict}` : verdict}</span>
                </span>

                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] px-2.5 py-0.5 rounded-full bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)]">
                  <Sparkles className="w-3 h-3 text-[var(--accent-indigo)]" />
                  <span>{isMock ? 'Simulated Pipeline' : 'Multi-Agent Consensus'}</span>
                </span>
              </div>

              {/* Desktop / >= 560px position */}
              {renderPdfActions(false)}
            </div>

            <h3 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              {isMock ? `[MOCK] Determination: ${verdict}` : `Determination: ${verdict}`}
            </h3>

            {/* One-line note */}
            <p className="text-sm font-semibold text-[var(--text-muted)] mt-1.5 flex items-center justify-center sm:justify-start gap-1.5">
              <Info className="w-4 h-4 shrink-0 text-[var(--accent-indigo)]" />
              <span>{note || 'Verification completed across multi-agent pipelines.'}</span>
            </p>

            {/* Mobile / < 560px position (wraps below heading and becomes full width) */}
            {renderPdfActions(true)}
          </div>
        </div>

        {/* Agent Pipeline Steps Ordered List */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
              <span>Agent Pipeline Execution Steps ({steps.length})</span>
            </h4>
            <span className="text-[11px] font-mono text-[var(--text-subtle)]">
              Total: {steps.reduce((acc, s) => acc + s.durationMs, 0)}ms
            </span>
          </div>

          <ol className="space-y-2">
            {steps.map((step, index) => {
              const isSkipped = step.status === 'skipped';
              return (
                <li
                  key={`${step.agent}-${index}`}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-xs transition-colors ${
                    isSkipped
                      ? 'bg-[var(--glass-bg-subtle)]/50 border-[var(--glass-border-subtle)] text-[var(--text-subtle)] opacity-75'
                      : 'bg-[var(--glass-bg-subtle)] border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-[var(--glass-bg-elevated)] border border-[var(--glass-border-subtle)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] shrink-0 font-mono">
                      {index + 1}
                    </span>
                    <span className="font-semibold truncate">
                      {step.agent}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {isSkipped ? (
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-slate-500/10 text-[var(--text-subtle)]">
                        Skipped
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="w-3.5 h-3.5" />
                        <span>{step.durationMs}ms</span>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Evidence Trail Collapsible Section */}
        {result.evidence && result.evidence.length > 0 && (
          <div className="mt-6 border-t border-[var(--glass-border-subtle)] pt-6">
            <button
              onClick={() => setIsEvidenceOpen(!isEvidenceOpen)}
              className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-indigo)]" />
                Evidence Trail
              </span>
              {isEvidenceOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {isEvidenceOpen && (
              <ul className="mt-3.5 space-y-2 list-none">
                {result.evidence.map((snippet, index) => (
                  <li key={index} className="px-3 py-2 text-xs text-[var(--text-primary)] bg-[var(--glass-bg-subtle)] rounded-lg border border-[var(--glass-border-subtle)]">
                    {snippet}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Full pipeline report (live results) */}
        {result.report && (
          <details className="mt-6 border-t border-[var(--glass-border-subtle)] pt-6">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              Full verification report
            </summary>
            <pre className="mt-3.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--text-primary)] font-sans">
              {result.report}
            </pre>
          </details>
        )}
      </section>

      {/* PDF Preview Modal */}
      {isPreviewOpen && previewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="relative w-full max-w-5xl h-[90vh] bg-[var(--glass-bg-elevated)] border border-[var(--glass-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-[var(--accent-indigo)]/15 text-[var(--accent-indigo)]">
                  <Eye className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                    Audit Report PDF Preview
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] hidden sm:block">
                    CRDF Multi-Agent Verification Report
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border border-[var(--glass-border-subtle)] transition"
                  title="Open in new window"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open in New Tab</span>
                </a>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-white bg-[var(--accent-indigo)] hover:brightness-110 transition cursor-pointer shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition cursor-pointer ml-1"
                  aria-label="Close Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal PDF Viewer Iframe */}
            <div className="flex-1 w-full bg-slate-900/10 dark:bg-black/40">
              <iframe
                src={previewUrl}
                title="CRDF Audit Report PDF Preview"
                className="w-full h-full border-none"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
