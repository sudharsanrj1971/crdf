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
        const isErrorFallback = result.manipulation_check?.reasoning?.includes('API response errors') || result._parse_error;
        return {
          icon: <HelpCircle className="w-6 h-6 text-amber-600" />,
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          textColor: 'text-amber-800',
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
        color: 'text-emerald-700',
      };
    } else if (mc === false || mc === 'false' || mc === 'contradicts_claim') {
      return {
        icon: <XCircle className="w-5 h-5 text-rose-500" />,
        label: 'Contradicts Claim',
        color: 'text-rose-700',
      };
    }
    return {
      icon: <HelpCircle className="w-5 h-5 text-slate-400" />,
      label: 'Cannot Determine',
      color: 'text-slate-600',
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
          <div className="flex items-center gap-3 mb-2">
            {assessment.icon}
            <h3 className={`text-lg font-semibold ${assessment.textColor}`}>
              {assessment.label}
            </h3>
          </div>
          {/* Confidence not available in ImageAnalysis response */}
          <div className="mt-4">
            <span className={`text-xs font-medium ${assessment.textColor} opacity-70`}>
              Confidence: N/A
            </span>
          </div>
          {result.manipulation_check?.reasoning && (
            <p className={`text-xs mt-2 opacity-80 ${assessment.textColor}`}>
              {result.manipulation_check.reasoning}
            </p>
          )}
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

      {/* Specific artifact list not available in backend ImageAnalysis response */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-semibold text-slate-800">Context Match Reasoning</h3>
        </div>
        {result.content_match_check?.reasoning ? (
          <p className="text-sm text-slate-600 leading-relaxed">{result.content_match_check.reasoning}</p>
        ) : (
          <p className="text-sm text-slate-400 italic">No context match reasoning available.</p>
        )}
      </div>
    </motion.div>
  );
}
