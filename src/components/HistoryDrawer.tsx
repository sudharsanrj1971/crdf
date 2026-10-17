import React, { useEffect } from 'react';
import { X, History, Trash2, ShieldCheck, XCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { AnalysisResult } from '../lib/api';

export interface HistoryItem {
  id: string;
  timestamp: number;
  claim: string;
  result: AnalysisResult;
}

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: HistoryItem[];
  onClearHistory: () => void;
  onSelectItem: (item: HistoryItem) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onClearHistory,
  onSelectItem,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const getVerdictBadge = (verdict: string) => {
    const lower = verdict.toLowerCase();
    if (lower.includes('false') || lower.includes('debunked')) {
      return {
        icon: XCircle,
        className: 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300',
      };
    }
    if (lower.includes('partially') || lower.includes('more evidence') || lower.includes('unverifiable')) {
      return {
        icon: AlertTriangle,
        className: 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300',
      };
    }
    return {
      icon: ShieldCheck,
      className: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    };
  };

  const formatTimestamp = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Analysis History"
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-[420px] bg-[var(--glass-bg-elevated)] border-l border-[var(--glass-border)] shadow-2xl backdrop-blur-2xl flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--glass-border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-[var(--accent-indigo)]">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Analysis History
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-medium">
                Last {items.length} of 20 evaluations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                aria-label="Clear all analysis history"
                title="Clear history"
                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close history drawer"
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center px-4">
              <div className="w-14 h-14 rounded-full bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] flex items-center justify-center text-[var(--text-muted)] mb-3">
                <History className="w-6 h-6 stroke-[1.5]" />
              </div>
              <p className="text-sm font-semibold text-[var(--text-muted)] max-w-[240px]">
                No analyses yet. Run one and it will appear here.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const { icon: VerdictIcon, className: badgeStyle } = getVerdictBadge(item.result.verdict);
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectItem(item);
                    onClose();
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectItem(item);
                      onClose();
                    }
                  }}
                  className="group relative p-3.5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:bg-[var(--glass-bg)] hover:border-[var(--accent-indigo)]/50 transition-all duration-200 cursor-pointer shadow-xs text-left"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${badgeStyle}`}>
                      <VerdictIcon className="w-3 h-3" />
                      <span>{item.result.verdict}</span>
                    </span>

                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-subtle)]">
                      <span className="font-bold text-[var(--text-primary)]">{item.result.confidence}%</span>
                      <span>•</span>
                      <span>{formatTimestamp(item.timestamp)}</span>
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 leading-relaxed">
                    {item.claim}
                  </p>

                  <div className="mt-2.5 pt-2 border-t border-[var(--glass-border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span className="text-[10px] font-mono">{item.result.steps.length} Agent Steps</span>
                    <span className="inline-flex items-center gap-0.5 text-[var(--accent-indigo)] font-semibold group-hover:translate-x-0.5 transition-transform">
                      <span>View details</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
