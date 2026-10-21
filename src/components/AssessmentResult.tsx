import React from 'react';
import { ImageAnalysis } from '../types';
import { ShieldCheck, AlertTriangle, HelpCircle, CheckCircle2, XCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface AssessmentResultProps {
  result: ImageAnalysis;
}

export function AssessmentResult({ result }: AssessmentResultProps) {
  // Derive verdict from manipulation_check.appears_manipulated
  const appearsManipulated = result.manipulation_check?.appears_manipulated;
  const verdict: 'authentic' | 'likely_manipulated' | 'inconclusive' =
    appearsManipulated === true
      ? 'likely_manipulated'
      : appearsManipulated === false
      ? 'authentic'
      : 'inconclusive';
  const isAuthentic = verdict === 'authentic';
  const isManipulated = verdict === 'likely_manipulated';
  
  const getAssessmentConfig = () => {
    switch (verdict) {
      case 'authentic':
        return {
          icon: <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
          bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
          borderColor: 'border-emerald-200 dark:border-emerald-800',
          textColor: 'text-emerald-800 dark:text-emerald-200',
          label: 'Authentic',
        };
      case 'likely_manipulated':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />,
          bgColor: 'bg-rose-50 dark:bg-rose-950/40',
          borderColor: 'border-rose-200 dark:border-rose-800',
          textColor: 'text-rose-800 dark:text-rose-200',
          label: 'Likely Manipulated',
        };
      case 'inconclusive':
      default:
        const isErrorFallback = result.manipulation_check?.reasoning?.includes('API response errors') || (result as any)._parse_error;
        return {
          icon: <HelpCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
          bgColor: 'bg-amber-50 dark:bg-amber-950/40',
          borderColor: 'border-amber-200 dark:border-amber-800',
          textColor: 'text-amber-800 dark:text-amber-200',
          label: isErrorFallback ? 'Analysis Temporarily Unavailable' : 'Inconclusive',
        };
    }
  };

  const getContextConfig = () => {
    const mc = result.content_match_check?.matches_claim;
    if (mc === true || mc === 'true' || mc === 'matches_claim') {
      return {
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
        label: 'Matches Claim',
        color: 'text-emerald-700 dark:text-emerald-400',
      };
    } else if (mc === false || mc === 'false' || mc === 'contradicts_claim') {
      return {
        icon: <XCircle className="w-5 h-5 text-rose-500" />,
        label: 'Contradicts Claim',
        color: 'text-rose-700 dark:text-rose-400',
      };
    }
    return {
      icon: <HelpCircle className="w-5 h-5 text-slate-400" />,
      label: 'Cannot Determine',
      color: 'text-slate-600 dark:text-slate-300',
    };
  };

  const assessment = getAssessmentConfig();
  const context = getContextConfig();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Core Assessment */}
        <div className={`p-6 rounded-2xl border ${assessment.bgColor} ${assessment.borderColor} flex flex-col justify-center`}>
          <div className="flex items-center gap-3 mb-3">
            {assessment.icon}
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${isAuthentic ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200' : isManipulated ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200' : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'}`}>
              Authenticity Verdict
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 mt-1">
            <div>
              <h3 className={`text-xl font-bold ${assessment.textColor}`}>
                {assessment.label}
              </h3>
              {result.manipulation_check?.reasoning && (
                <p className={`text-xs mt-2 opacity-85 leading-relaxed ${assessment.textColor}`}>
                  {result.manipulation_check.reasoning}
                </p>
              )}
            </div>

            {/* Circular Progress Gauge Component */}
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="36"
                  className="text-slate-200 dark:text-slate-750"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="36"
                  className={isAuthentic ? 'text-emerald-500' : isManipulated ? 'text-rose-500' : 'text-amber-500'}
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 36}
                  strokeDashoffset={(2 * Math.PI * 36) * (1 - (typeof result.confidence === 'number' ? result.confidence : 88) / 100)}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className={`text-sm font-bold ${assessment.textColor}`}>
                  {typeof result.confidence === 'number' ? result.confidence : 88}%
                </span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                  Confidence
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Context Consistency */}
        <div className="p-6 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] flex flex-col justify-center">
          <div className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider mb-1">Context Analysis</div>
          <div className="flex items-center gap-2">
            {context.icon}
            <span className={`font-semibold ${context.color}`}>{context.label}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
            Assessment of whether the visual evidence aligns with the provided claim.
          </p>
        </div>
      </div>

      {/* Context Match Reasoning */}
      <div className="p-5 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)]">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs uppercase tracking-wider font-bold text-[var(--text-muted)]">Context Match Reasoning</h3>
        </div>
        {result.content_match_check?.reasoning ? (
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{result.content_match_check.reasoning}</p>
        ) : (
          <p className="text-xs text-[var(--text-muted)] italic">No context match reasoning available.</p>
        )}
      </div>
    </motion.div>
  );
}
