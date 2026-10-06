import React from 'react';
import { AuthenticityAssessmentResult } from '../types';
import { ShieldCheck, AlertTriangle, HelpCircle, FileSearch, CheckCircle2, XCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface AssessmentResultProps {
  result: AuthenticityAssessmentResult;
}

export function AssessmentResult({ result }: AssessmentResultProps) {
  const isAuthentic = result.authenticity_assessment === 'authentic';
  const isManipulated = result.authenticity_assessment === 'likely_manipulated';
  
  const getAssessmentConfig = () => {
    switch (result.authenticity_assessment) {
      case 'authentic':
        return {
          icon: <ShieldCheck className="w-6 h-6 text-emerald-600" />,
          bgColor: 'bg-emerald-50',
          borderColor: 'border-emerald-200',
          textColor: 'text-emerald-800',
          label: 'Authentic',
        };
      case 'likely_manipulated':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-rose-600" />,
          bgColor: 'bg-rose-50',
          borderColor: 'border-rose-200',
          textColor: 'text-rose-800',
          label: 'Likely Manipulated',
        };
      case 'inconclusive':
      default:
        return {
          icon: <HelpCircle className="w-6 h-6 text-amber-600" />,
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          textColor: 'text-amber-800',
          label: 'Inconclusive',
        };
    }
  };

  const getContextConfig = () => {
    switch (result.context_consistency) {
      case 'matches_claim':
        return {
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
          label: 'Matches Claim',
          color: 'text-emerald-700',
        };
      case 'contradicts_claim':
        return {
          icon: <XCircle className="w-5 h-5 text-rose-500" />,
          label: 'Contradicts Claim',
          color: 'text-rose-700',
        };
      case 'cannot_determine':
      default:
        return {
          icon: <HelpCircle className="w-5 h-5 text-slate-400" />,
          label: 'Cannot Determine',
          color: 'text-slate-600',
        };
    }
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
          <div className="flex items-center gap-3 mb-2">
            {assessment.icon}
            <h3 className={`text-lg font-semibold ${assessment.textColor}`}>
              {assessment.label}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <div className="h-2 flex-1 bg-white/50 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${isAuthentic ? 'bg-emerald-500' : isManipulated ? 'bg-rose-500' : 'bg-amber-500'}`}
                style={{ width: `${result.confidence * 100}%` }}
              />
            </div>
            <span className={`text-sm font-medium ${assessment.textColor}`}>
              {Math.round(result.confidence * 100)}% Confidence
            </span>
          </div>
        </div>

        {/* Context Consistency */}
        <div className="p-6 rounded-2xl border border-slate-200 bg-white flex flex-col justify-center">
          <div className="text-sm text-slate-500 font-medium mb-1">Context Analysis</div>
          <div className="flex items-center gap-2">
            {context.icon}
            <span className={`font-medium ${context.color}`}>{context.label}</span>
          </div>
          <p className="text-sm text-slate-500 mt-2">
            Assessment of whether the visual evidence aligns with the provided claim.
          </p>
        </div>
      </div>

      {/* Specific Artifacts */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <FileSearch className="w-5 h-5 text-slate-400" />
          <h3 className="text-base font-semibold text-slate-800">Observed Artifacts</h3>
        </div>
        
        {result.specific_artifacts_observed.length > 0 ? (
          <ul className="space-y-3">
            {result.specific_artifacts_observed.map((artifact, idx) => (
              <li key={idx} className="flex items-start gap-3 text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
                <span className="leading-relaxed text-sm">{artifact}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-6 text-slate-500 bg-slate-50 rounded-lg border border-slate-100 border-dashed">
            No specific manipulation artifacts or inconsistencies observed.
          </div>
        )}
      </div>
    </motion.div>
  );
}
