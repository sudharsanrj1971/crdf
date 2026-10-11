/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, DragEvent } from 'react';
import {
  UploadCloud, FileText, AlertTriangle, Loader2, Video, FileSearch, Download, ShieldCheck,
  History, Trash2, Clock, X, Menu, Bookmark, CheckCircle2, Eye, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { AssessmentResult } from './components/AssessmentResult';
import { DocumentResult } from './components/DocumentResult';
import { AnalysisResultDisplay } from './components/AnalysisResult';
import type { AnalyzeResponse, ImageAnalysis, VideoAnalysis, DocumentAnalysis } from './types';

interface HistoryItem {
  id: string;
  timestamp: number;
  claim: string;
  response: AnalyzeResponse;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function FileDropZone({
  label,
  accept,
  file,
  onFile,
}: {
  label: string;
  accept: string;
  file: File | null;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors
        ${file
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-600'
          : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {file ? (
        <p className="text-sm text-blue-600 dark:text-blue-400 font-medium truncate">{file.name}</p>
      ) : (
        <div className="flex flex-col items-center gap-1 text-slate-400 dark:text-slate-500">
          <UploadCloud className="w-6 h-6" />
          <p className="text-xs">{label}</p>
        </div>
      )}
    </div>
  );
}

// ─── main app ────────────────────────────────────────────────────────────────

export default function App() {
  const [claim, setClaim] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<number>(1);
  const [response, setResponse] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Dark mode state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('crdf_dark_mode') === 'true';
  });
  
  // PDF Viewer Modal state
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Apply dark mode class to html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('crdf_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('crdf_dark_mode', 'false');
    }
  }, [darkMode]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('crdf_analysis_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load history from localStorage', e);
    }
  }, []);

  // Stepper animation logic during loading
  useEffect(() => {
    let t1: any, t2: any;
    if (loading) {
      setAnalysisStep(1);
      t1 = setTimeout(() => setAnalysisStep(2), 1500);
      t2 = setTimeout(() => setAnalysisStep(3), 4000);
    } else {
      setAnalysisStep(1);
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [loading]);

  const saveToHistory = (res: AnalyzeResponse) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      claim: res.claim,
      response: res,
    };
    const updated = [newItem, ...history.filter(h => h.claim !== res.claim)].slice(0, 20);
    setHistory(updated);
    try {
      localStorage.setItem('crdf_analysis_history', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save history to localStorage', e);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('crdf_analysis_history');
    } catch (e) {
      console.error('Failed to clear history from localStorage', e);
    }
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    try {
      localStorage.setItem('crdf_analysis_history', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to update history', e);
    }
  };

  // Abort any in-flight analysis request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleAnalyze = async () => {
    if (!claim.trim()) {
      setError('Please enter a claim before analyzing.');
      return;
    }

    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setResponse(null);

    const formData = new FormData();
    formData.append('claim', claim.trim());
    if (imageFile) formData.append('image', imageFile);
    if (videoFile) formData.append('video', videoFile);
    if (documentFile) formData.append('document', documentFile);

    try {
      const res = await fetch('/analyze', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Server error ${res.status}`);
      }

      const data: AnalyzeResponse = await res.json();
      setResponse(data);
      saveToHistory(data);
    } catch (err: unknown) {
      // Don't set error state if the request was intentionally aborted
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  const handleGeneratePdf = async () => {
    if (!response) return;
    setPdfLoading(true);
    try {
      const res = await fetch('/generate_pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim: response.claim,
          multimodal_results: response.multimodal_results,
          multimodal_summary_text: response.multimodal_summary_text,
          text_pipeline_report: response.text_pipeline_report,
          raw_pipeline_data: response.raw_pipeline_data,
          text_pipeline_error: response.text_pipeline_error,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'PDF generation failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CRDF_Report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PDF generation failed.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePreviewPdf = async () => {
    if (!response) return;
    setPdfLoading(true);
    try {
      const res = await fetch('/generate_pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim: response.claim,
          multimodal_results: response.multimodal_results,
          multimodal_summary_text: response.multimodal_summary_text,
          text_pipeline_report: response.text_pipeline_report,
          raw_pipeline_data: response.raw_pipeline_data,
          text_pipeline_error: response.text_pipeline_error,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'PDF preview failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfModal(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PDF preview failed.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleReset = () => {
    setResponse(null);
    setError(null);
    setClaim('');
    setImageFile(null);
    setVideoFile(null);
    setDocumentFile(null);
  };

  // Cast nested results (backend returns dicts, Pydantic validated)
  const imgResult = response?.multimodal_results?.image_analysis as ImageAnalysis | undefined;
  const vidResult = response?.multimodal_results?.video_analysis as VideoAnalysis | undefined;
  const docResult = response?.multimodal_results?.document_analysis as DocumentAnalysis | undefined;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 pb-20 flex flex-col transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
              title="Toggle Recent Analyses"
            >
              <History className="w-5 h-5" />
            </button>
            <div className="p-2 bg-slate-900 dark:bg-slate-800 rounded-lg text-white shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">CRDF System</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Claim Research &amp; Detection Framework</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="hidden md:flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5" /> Recent History ({history.length})
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
              title="Toggle Dark Mode"
            >
              {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
            </button>
            {response && (
              <button
                onClick={handleReset}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
              >
                ← New Analysis
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main container with sidebar */}
      <div className="flex-1 flex max-w-7xl mx-auto w-full relative">
        {/* History Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              {/* Backdrop for mobile */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-slate-900/40 z-30 md:hidden"
              />
              <motion.aside
                initial={{ x: -320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -320, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed md:sticky top-[73px] h-[calc(100vh-73px)] w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-40 flex flex-col shadow-lg md:shadow-none"
              >
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <h2 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Recent Analyses</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    {history.length > 0 && (
                      <button
                        onClick={clearHistory}
                        className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 transition-colors"
                        title="Clear all history"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg md:hidden"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {history.length === 0 ? (
                    <div className="text-center py-12 px-4 text-slate-400 dark:text-slate-500 text-xs">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No previous analyses saved yet.</p>
                      <p className="mt-1 text-slate-300 dark:text-slate-600">Run a claim analysis to see it here.</p>
                    </div>
                  ) : (
                    history.map((item) => {
                      const dateStr = new Date(item.timestamp).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isSelected = response?.claim === item.claim;

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setResponse(item.response);
                            if (window.innerWidth < 768) setSidebarOpen(false);
                          }}
                          className={`group p-3 rounded-xl border text-left cursor-pointer transition-all relative ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700 shadow-sm'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed">
                              {item.claim}
                            </p>
                            <button
                              onClick={(e) => deleteHistoryItem(item.id, e)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 transition-opacity"
                              title="Delete from history"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
                            <span>{dateStr}</span>
                            {item.response.multimodal_results?.image_analysis?.has_image && (
                              <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-medium">Image</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <main className="flex-1 max-w-4xl mx-auto px-6 py-10 w-full">
          <AnimatePresence mode="wait">
            {/* ── Input form ── */}
            {!response && !loading && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight mb-1 text-slate-900 dark:text-white">Analyze a Claim</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                      Enter the claim and attach supporting media. At least a claim is required; all media is optional.
                    </p>
                  </div>
                  {history.length > 0 && !sidebarOpen && (
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="md:hidden text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 rounded-lg"
                    >
                      History ({history.length})
                    </button>
                  )}
                </div>

                {/* Claim textarea */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Claim *</label>
                  <textarea
                    id="claim-input"
                    value={claim}
                    onChange={(e) => setClaim(e.target.value)}
                    placeholder="e.g. 'This photo was taken during the wildfire in California last month.'"
                    className="w-full h-32 p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none text-sm leading-relaxed"
                    maxLength={2000}
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-right">{claim.length}/2000</p>
                </div>

                {/* Media uploads */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <FileSearch className="w-3.5 h-3.5" /> Image (optional)
                    </label>
                    <FileDropZone
                      label="Drop image or click to browse"
                      accept="image/*"
                      file={imageFile}
                      onFile={setImageFile}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Video className="w-3.5 h-3.5" /> Video (optional)
                    </label>
                    <FileDropZone
                      label="Drop video or click to browse"
                      accept="video/*"
                      file={videoFile}
                      onFile={setVideoFile}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" /> Document (optional)
                    </label>
                    <FileDropZone
                      label="Drop PDF/DOCX or click to browse"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      file={documentFile}
                      onFile={setDocumentFile}
                    />
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl p-4 text-red-600 dark:text-red-400 text-sm flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  id="analyze-btn"
                  onClick={handleAnalyze}
                  disabled={!claim.trim()}
                  className="w-full md:w-auto px-8 py-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors shadow-sm"
                >
                  Run CRDF Analysis
                </button>
              </motion.div>
            )}

            {/* ── Loading with Visual Stepper ── */}
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16 max-w-lg mx-auto w-full gap-8"
              >
                <div className="text-center space-y-2">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xl">Executing CRDF Pipeline</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Autonomous multi-agent verification in progress...</p>
                </div>

                {/* Visual Stepper Component */}
                <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                  {[
                    { step: 1, title: 'Media Ingestion & OCR', desc: 'Parsing multimodal files and extracting raw text' },
                    { step: 2, title: 'Multi-Agent Verification', desc: 'Decomposing claim, web search, and evidence scoring' },
                    { step: 3, title: 'Report Compilation', desc: 'Synthesizing confidence breakdown and final verdict' },
                  ].map((s) => {
                    const isDone = analysisStep > s.step;
                    const isCurrent = analysisStep === s.step;
                    return (
                      <div key={s.step} className="flex items-start gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                          isDone
                            ? 'bg-emerald-500 text-white'
                            : isCurrent
                            ? 'bg-blue-600 text-white animate-pulse'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                        }`}>
                          {isDone ? '✓' : s.step}
                        </div>
                        <div className="flex-1 pt-1">
                          <h4 className={`text-sm font-semibold ${isCurrent ? 'text-blue-900 dark:text-blue-300' : isDone ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                            {s.title}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Results ── */}
            {response && !loading && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-10"
              >
                {/* Claim echo */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Analyzed Claim</p>
                    {history.length > 0 && !sidebarOpen && (
                      <button
                        onClick={() => setSidebarOpen(true)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View History ({history.length})
                      </button>
                    )}
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed">{response.claim}</p>
                </div>

                {/* Error banner if text pipeline failed */}
                {response.text_pipeline_error && (
                  <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl p-4 text-amber-700 dark:text-amber-400 text-sm flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Text pipeline warning</p>
                      <p>{response.text_pipeline_error}</p>
                    </div>
                  </div>
                )}

                {/* Clarification Needed Banner */}
                {(response.raw_pipeline_data?.take_the_raw_user_task?.ready_for_processing === false ||
                  response.text_pipeline_report?.includes("CLAIM REQUIRES CLARIFICATION")) && (
                  <div className="bg-amber-50/80 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-xl">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-amber-900 dark:text-amber-200">Clarification Needed to Verify Claim</h3>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          The submitted claim is ambiguous or underspecified and cannot be evaluated by the fact-checking pipeline.
                        </p>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-800 p-4 text-slate-800 dark:text-slate-200 text-sm font-medium">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Missing Context / Question</p>
                      <p className="italic font-sans text-slate-900 dark:text-slate-100">
                        "{response.raw_pipeline_data?.take_the_raw_user_task?.clarification_question ||
                          response.raw_pipeline_data?.take_the_raw_user_task?.reasoning ||
                          'Please specify missing details such as names, dates, or locations.'}"
                      </p>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => {
                          setClaim(response.claim);
                          setResponse(null);
                        }}
                        className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm"
                      >
                        Edit Claim &amp; Resubmit
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Image Analysis ── */}
                {imgResult?.has_image && (
                  <section>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
                      <FileSearch className="w-5 h-5 text-indigo-500" />
                      Image Authenticity
                    </h2>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                      <AssessmentResult result={imgResult} />
                    </div>
                  </section>
                )}

                {/* ── Video Analysis ── */}
                {vidResult?.has_video && (
                  <section>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
                      <Video className="w-5 h-5 text-indigo-500" />
                      Video Analysis
                    </h2>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Manipulation Check</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          {vidResult.manipulation_check?.appears_manipulated
                            ? '⚠️ Manipulation signals detected'
                            : '✅ No manipulation signals detected'}
                        </p>
                        {vidResult.manipulation_check?.reasoning && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 italic">{vidResult.manipulation_check.reasoning}</p>
                        )}
                      </div>
                      {vidResult.content_match_check && (
                        <div>
                          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Context Match</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            {String(vidResult.content_match_check.matches_claim)}
                          </p>
                          {vidResult.content_match_check.reasoning && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 italic">{vidResult.content_match_check.reasoning}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* ── Document Analysis ── */}
                {docResult?.has_document && (
                  <section>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
                      <FileText className="w-5 h-5 text-indigo-500" />
                      Document &amp; OCR Analysis
                    </h2>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                      <DocumentResult result={docResult} />
                    </div>
                  </section>
                )}

                {/* ── Text pipeline report ── */}
                {response.text_pipeline_report && (
                  <section>
                    <h2 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">Text Pipeline Report</h2>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                      <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-mono overflow-x-auto max-h-96 overflow-y-auto">
                        {response.text_pipeline_report}
                      </pre>
                    </div>
                  </section>
                )}

                {/* ── Multimodal summary ── */}
                {response.multimodal_summary_text && (
                  <section>
                    <h2 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">Multimodal Summary</h2>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {response.multimodal_summary_text}
                      </p>
                    </div>
                  </section>
                )}

                {/* ── Actions ── */}
                <div className="flex flex-wrap gap-3">
                  <button
                    id="preview-pdf-btn"
                    onClick={handlePreviewPdf}
                    disabled={pdfLoading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors shadow-sm"
                  >
                    {pdfLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading Preview…
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        Preview PDF Report
                      </>
                    )}
                  </button>
                  <button
                    id="generate-pdf-btn"
                    onClick={handleGeneratePdf}
                    disabled={pdfLoading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors shadow-sm"
                  >
                    {pdfLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating PDF…
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download PDF Report
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-sm transition-colors"
                  >
                    New Analysis
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* PDF Viewer Modal */}
      <AnimatePresence>
        {showPdfModal && pdfPreviewUrl && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">CRDF Report PDF Viewer</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGeneratePdf}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold rounded-lg text-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button
                    onClick={() => setShowPdfModal(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-4">
                <iframe
                  src={pdfPreviewUrl}
                  className="w-full h-full rounded-xl border border-slate-300 dark:border-slate-800 shadow-inner bg-white dark:bg-slate-900"
                  title="CRDF Report PDF Preview"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
