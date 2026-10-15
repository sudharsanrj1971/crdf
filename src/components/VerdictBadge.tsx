import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Info } from 'lucide-react';

export type VerdictType =
  | 'true'
  | 'false'
  | 'partly_true'
  | 'requires_more_evidence'
  | 'needs_clarification';

interface VerdictBadgeProps {
  verdict: VerdictType | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function parseVerdict(raw?: string): VerdictType {
  if (!raw) return 'requires_more_evidence';
  const norm = raw.toLowerCase().trim();
  if (norm.includes('partly') || norm.includes('mixture') || norm.includes('half')) return 'partly_true';
  if (norm.includes('clarification') || norm.includes('ambiguous') || norm.includes('unclear')) return 'needs_clarification';
  if (norm.includes('requires') || norm.includes('unverified') || norm.includes('inconclusive') || norm.includes('more evidence')) return 'requires_more_evidence';
  if (norm.includes('true') || norm.includes('authentic') || norm.includes('verified') || norm.includes('supported')) return 'true';
  if (norm.includes('false') || norm.includes('manipulated') || norm.includes('debunked') || norm.includes('fabricated')) return 'false';
  return 'requires_more_evidence';
}

export function getVerdictConfig(verdictType: VerdictType) {
  switch (verdictType) {
    case 'true':
      return {
        label: 'True',
        icon: CheckCircle2,
        bg: 'bg-emerald-500/15 dark:bg-emerald-500/20',
        border: 'border-emerald-600/35 dark:border-emerald-400/35',
        text: 'text-emerald-800 dark:text-emerald-300',
        barColor: 'from-emerald-500 to-teal-400',
      };
    case 'false':
      return {
        label: 'False',
        icon: XCircle,
        bg: 'bg-rose-500/15 dark:bg-rose-500/20',
        border: 'border-rose-600/35 dark:border-rose-400/35',
        text: 'text-rose-800 dark:text-rose-300',
        barColor: 'from-rose-500 to-red-400',
      };
    case 'partly_true':
      return {
        label: 'Partly True',
        icon: AlertTriangle,
        bg: 'bg-amber-500/15 dark:bg-amber-500/20',
        border: 'border-amber-600/35 dark:border-amber-400/35',
        text: 'text-amber-800 dark:text-amber-300',
        barColor: 'from-amber-500 to-yellow-400',
      };
    case 'needs_clarification':
      return {
        label: 'Needs Clarification',
        icon: Info,
        bg: 'bg-sky-500/15 dark:bg-sky-500/20',
        border: 'border-sky-600/35 dark:border-sky-400/35',
        text: 'text-sky-800 dark:text-sky-300',
        barColor: 'from-sky-500 to-cyan-400',
      };
    case 'requires_more_evidence':
    default:
      return {
        label: 'Requires More Evidence',
        icon: HelpCircle,
        bg: 'bg-slate-500/15 dark:bg-slate-400/20',
        border: 'border-slate-500/35 dark:border-slate-400/35',
        text: 'text-slate-800 dark:text-slate-300',
        barColor: 'from-slate-500 to-slate-400',
      };
  }
}

export function VerdictBadge({ verdict, size = 'md', showIcon = true }: VerdictBadgeProps) {
  const verdictType = typeof verdict === 'string' ? parseVerdict(verdict) : verdict;
  const config = getVerdictConfig(verdictType);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-[11px] px-2.5 py-0.5 gap-1.5',
    md: 'text-xs px-3 py-1 gap-1.5',
    lg: 'text-sm px-4 py-1.5 gap-2 font-bold',
  }[size];

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold border ${config.bg} ${config.border} ${config.text} ${sizeClasses} transition-all duration-200 select-none shadow-xs`}
    >
      {showIcon && <Icon className={`${iconSizes} shrink-0`} />}
      <span>{config.label}</span>
    </span>
  );
}

interface ConfidenceProgressBarProps {
  confidence: number;
  verdictType?: VerdictType;
  label?: string;
  showPercent?: boolean;
}

export function ConfidenceProgressBar({
  confidence,
  verdictType = 'true',
  label = 'Confidence',
  showPercent = true,
}: ConfidenceProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(confidence)));
  const config = getVerdictConfig(verdictType);

  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-[var(--text-muted)] uppercase tracking-wider text-[11px]">{label}</span>
        {showPercent && (
          <span className="text-[var(--text-primary)] font-mono font-bold">{clamped}%</span>
        )}
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] overflow-hidden p-[1px]">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${config.barColor} transition-all duration-500 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
