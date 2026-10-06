import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, ArrowLeft, Download, ExternalLink, Activity, Volume2, Eye, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import type { AnalysisResult } from "../types";

interface AnalysisResultDisplayProps {
  result: AnalysisResult;
  onReset: () => void;
}

export function AnalysisResultDisplay({ result, onReset }: AnalysisResultDisplayProps) {
  const getConsistencyColor = (status: string) => {
    switch (status) {
      case "matches_claim": return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "contradicts_claim": return "bg-rose-50 text-rose-700 border-rose-100";
      default: return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getConsistencyIcon = (status: string) => {
    switch (status) {
      case "matches_claim": return <CheckCircle2 className="w-5 h-5" />;
      case "contradicts_claim": return <XCircle className="w-5 h-5" />;
      default: return <HelpCircle className="w-5 h-5" />;
    }
  };

  const getConsistencyLabel = (status: string) => {
    switch (status) {
      case "matches_claim": return "Matches Claim";
      case "contradicts_claim": return "Contradicts Claim";
      default: return "Cannot Determine";
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <button
          onClick={onReset}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-sm transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Upload
        </button>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
            <Download className="w-3.5 h-3.5" />
            Export Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`col-span-1 md:col-span-2 rounded-3xl border p-8 flex flex-col justify-between shadow-sm ${getConsistencyColor(result.context_consistency)}`}>
          <div>
            <div className="flex items-center gap-2 mb-4">
              {getConsistencyIcon(result.context_consistency)}
              <span className="font-bold text-sm uppercase tracking-tighter">Consistency Assessment</span>
            </div>
            <h3 className="text-4xl font-black mb-4 tracking-tighter leading-none">
              {getConsistencyLabel(result.context_consistency)}
            </h3>
            <p className="text-sm opacity-90 leading-relaxed max-w-md">
              The neural assessment engine has analyzed the temporal flow and metadata of the provided evidence against the submitted claim.
            </p>
          </div>
          <div className="mt-8 flex items-center gap-4">
            <div className="flex-1 bg-white/30 rounded-full h-2 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${result.confidence * 100}%` }}
                className="h-full bg-current"
              />
            </div>
            <span className="text-xs font-black tracking-widest uppercase">Confidence {(result.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-6 text-slate-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-bold text-[10px] uppercase tracking-widest">Editing Audit</span>
          </div>
          {result.editing_signs_observed.length > 0 ? (
            <div className="space-y-4">
              {result.editing_signs_observed.map((sign, i) => (
                <div key={i} className="flex gap-3 text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                  <p className="text-sm leading-snug">{sign}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ShieldCheck className="w-12 h-12 text-emerald-100 mx-auto mb-4" />
              <p className="text-sm font-bold text-slate-900">No editing signs detected</p>
              <p className="text-xs text-slate-500 mt-1">Video appears temporally consistent.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Eye className="w-5 h-5 text-indigo-600" />
            <h4 className="font-bold text-slate-900 tracking-tight">Visual Content Extraction</h4>
          </div>
          <div className="prose prose-sm prose-slate max-w-none">
            <p className="text-slate-600 leading-relaxed text-sm">
              {result.visual_summary}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Volume2 className="w-5 h-5 text-indigo-600" />
            <h4 className="font-bold text-slate-900 tracking-tight">Audio Analysis & Transcription</h4>
          </div>
          <div className="prose prose-sm prose-slate max-w-none">
            <p className="text-slate-600 leading-relaxed text-sm italic">
              {result.audio_summary}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 text-white rounded-3xl p-8 flex items-center justify-between overflow-hidden relative shadow-2xl">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4 opacity-50">
            <Activity className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Advanced Protocols</span>
          </div>
          <h4 className="text-xl font-bold mb-2">Detailed Forensic Metadata</h4>
          <p className="text-slate-400 text-sm max-w-md">
            Full forensic breakdown including frame-by-frame entropy analysis and spatial lighting verification is available in the exported PDF.
          </p>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-600/20 to-transparent pointer-events-none" />
        <button className="relative z-10 px-6 py-3 bg-white text-slate-900 font-bold rounded-xl text-sm hover:bg-slate-100 transition-colors shadow-xl">
          View Forensic Logs
        </button>
      </div>
    </div>
  );
}
