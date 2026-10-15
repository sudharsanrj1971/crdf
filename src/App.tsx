/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, DragEvent } from 'react';
import {
  UploadCloud, FileText, AlertTriangle, Loader2, Video, FileSearch, Download, ShieldCheck,
  History, Trash2, Clock, X, Bookmark, Sun, Moon, Sparkles, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { AssessmentResult } from './components/AssessmentResult';
import { DocumentResult } from './components/DocumentResult';
import { ResultCards } from './components/ResultCards';
import { VerdictBadge, parseVerdict } from './components/VerdictBadge';
import type { AnalyzeResponse, ImageAnalysis, VideoAnalysis, DocumentAnalysis } from './types';
import {
  BACKEND_URL,
  analyzeClaim,
  generatePdf,
  validateFile,
  checkBackendHealth,
  getMockAnalysisResult,
  generateMockPdf,
  type ApiError,
} from './lib/api';

interface HistoryItem {
  id: string;
  timestamp: number;
  claim: string;
  response: AnalyzeResponse;
}

// ─── FileDropZone Helper ─────────────────────────────────────────────────────

interface FileDropZoneProps {
  label: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  fileType: 'image' | 'video' | 'document';
  hint: string;
  onError: (msg: string | null) => void;
}

function FileDropZone({
  label,
  accept,
  file,
  onFile,
  fileType,
  hint,
  onError,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file && fileType === 'image') {
      const url = URL.createObjectURL(file);
      setThumbnailUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setThumbnailUrl(null);
  }, [file, fileType]);

  const handleSelectedFile = (f: File) => {
    const val = validateFile(f, fileType);
    if (!val.valid) {
      onError(val.error || 'Invalid file format.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    onError(null);
    onFile(f);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleSelectedFile(f);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}. Type hint: ${hint}. ${file ? `Selected file: ${file.name}` : 'Click or drop file'}`}
      className={`border-2 border-dashed rounded-[var(--radius-md)] p-3 text-center cursor-pointer transition-all duration-200 relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
        isDragOver
          ? 'border-indigo-500 bg-indigo-500/15 scale-[1.02] shadow-lg shadow-indigo-500/20'
          : file
          ? 'border-emerald-500/60 bg-emerald-500/10 dark:bg-emerald-500/15 dark:border-emerald-500/50 shadow-xs'
          : 'border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] hover:border-indigo-400/80 dark:hover:border-indigo-400 hover:bg-[var(--glass-bg)] hover:-translate-y-0.5 hover:shadow-md'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleSelectedFile(f);
        }}
      />
      {file ? (
        <div className="flex items-center gap-2.5 text-left">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Thumbnail preview"
              className="w-10 h-10 rounded-md object-cover border border-emerald-500/40 shrink-0 shadow-xs"
            />
          ) : (
            <div className="w-10 h-10 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              {fileType === 'video' ? <Video className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{file.name}</p>
            <p className="text-[11px] text-[var(--text-muted)] font-mono">{formatFileSize(file.size)}</p>
          </div>
          <button
            type="button"
            aria-label={`Remove attached ${fileType}`}
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 rounded-full transition-colors shrink-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-rose-400"
            title="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 py-1 text-[var(--text-muted)]">
          <div className="w-8 h-8 rounded-full bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] flex items-center justify-center shadow-xs text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            {fileType === 'image' && <FileSearch className="w-4 h-4" />}
            {fileType === 'video' && <Video className="w-4 h-4" />}
            {fileType === 'document' && <FileText className="w-4 h-4" />}
          </div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] leading-tight">{label}</p>
          <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-placeholder)] font-bold">
            {hint}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main App Component ──────────────────────────────────────────────────────

export default function App() {
  const [claim, setClaim] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [mockMode, setMockMode] = useState<boolean>(false);
  const [mockNoticeDismissed, setMockNoticeDismissed] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<number>(1);
  const [response, setResponse] = useState<AnalyzeResponse | null>(null);
  const [errorDetails, setErrorDetails] = useState<ApiError | null>(null);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
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
  const timeoutIdRef = useRef<any>(null);
  const intervalIdRef = useRef<any>(null);

  // Health check on load and every 30 seconds
  useEffect(() => {
    let mounted = true;
    const verifyBackend = async () => {
      try {
        const isUp = await checkBackendHealth();
        if (!mounted) return;
        setBackendConnected(isUp);
        if (!isUp) {
          // If the backend is unreachable, automatically turn ON mock mode
          setMockMode(true);
        }
      } catch {
        if (!mounted) return;
        setBackendConnected(false);
        setMockMode(true);
      }
    };

    verifyBackend();
    const interval = setInterval(verifyBackend, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

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

  // Clean up any in-flight analysis request and timers on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    };
  }, []);

  const formatElapsedTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    setLoading(false);
    setErrorDetails({
      message: 'Analysis was cancelled.',
      status: 'CANCELLED',
      url: `${BACKEND_URL}/analyze`,
      isAbort: true,
    });
  };

  const handleAnalyze = async () => {
    if (!claim.trim()) {
      setErrorDetails({
        message: 'Please enter a claim before analyzing.',
        url: `${BACKEND_URL}/analyze`,
      });
      return;
    }

    if (claim.length > 2000) {
      setErrorDetails({
        message: 'Claim exceeds the maximum allowed length of 2000 characters.',
        url: `${BACKEND_URL}/analyze`,
      });
      return;
    }

    // Abort any previous in-flight request and timers
    abortControllerRef.current?.abort();
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    if (intervalIdRef.current) clearInterval(intervalIdRef.current);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setErrorDetails(null);
    setShowTechDetails(false);
    setResponse(null);
    setElapsedSeconds(0);

    // If mock mode is active, generate realistic mock result without calling backend
    if (mockMode) {
      intervalIdRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);

      const mockTimer = setTimeout(() => {
        if (!controller.signal.aborted) {
          const mockData = getMockAnalysisResult(claim, !!imageFile, !!videoFile, !!documentFile);
          setResponse(mockData);
          saveToHistory(mockData);
          setLoading(false);
          if (intervalIdRef.current) clearInterval(intervalIdRef.current);
          if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
        }
      }, 1800);

      timeoutIdRef.current = mockTimer;
      return;
    }

    // Start 1-second elapsed timer
    intervalIdRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    // 5-minute timeout (300,000 ms)
    timeoutIdRef.current = setTimeout(() => {
      controller.abort();
      const timeoutErr: ApiError = {
        message: 'Analysis request timed out after 5 minutes.',
        status: 504,
        url: `${BACKEND_URL}/analyze`,
      };
      console.error('CRDF Request Timeout:', timeoutErr);
      setErrorDetails(timeoutErr);
      setLoading(false);
      if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    }, 5 * 60 * 1000);

    try {
      const data = await analyzeClaim(
        {
          claim,
          imageFile,
          videoFile,
          documentFile,
        },
        controller.signal
      );

      setResponse(data);
      saveToHistory(data);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr?.isAbort || (err instanceof DOMException && err.name === 'AbortError')) {
        console.warn('Analysis request was cancelled.');
        return;
      }
      setErrorDetails(apiErr);
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
        if (intervalIdRef.current) clearInterval(intervalIdRef.current);
      }
    }
  };

  const handleGeneratePdf = async () => {
    if (!response) return;
    setPdfLoading(true);
    setErrorDetails(null);

    if (mockMode) {
      try {
        const blob = generateMockPdf(
          response.claim,
          response.text_pipeline_report,
          response.multimodal_summary_text
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'CRDF_Report.pdf';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err: unknown) {
        setErrorDetails(err as ApiError);
      } finally {
        setPdfLoading(false);
      }
      return;
    }

    try {
      const blob = await generatePdf({
        claim: response.claim,
        multimodal_results: response.multimodal_results,
        multimodal_summary_text: response.multimodal_summary_text,
        text_pipeline_report: response.text_pipeline_report,
        raw_pipeline_data: response.raw_pipeline_data,
        text_pipeline_error: response.text_pipeline_error,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CRDF_Report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setErrorDetails(err as ApiError);
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePreviewPdf = async () => {
    if (!response) return;
    setPdfLoading(true);
    setErrorDetails(null);

    if (mockMode) {
      try {
        const blob = generateMockPdf(
          response.claim,
          response.text_pipeline_report,
          response.multimodal_summary_text
        );
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
        setShowPdfModal(true);
      } catch (err: unknown) {
        setErrorDetails(err as ApiError);
      } finally {
        setPdfLoading(false);
      }
      return;
    }

    try {
      const blob = await generatePdf({
        claim: response.claim,
        multimodal_results: response.multimodal_results,
        multimodal_summary_text: response.multimodal_summary_text,
        text_pipeline_report: response.text_pipeline_report,
        raw_pipeline_data: response.raw_pipeline_data,
        text_pipeline_error: response.text_pipeline_error,
      });

      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfModal(true);
    } catch (err: unknown) {
      setErrorDetails(err as ApiError);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleReset = () => {
    setResponse(null);
    setErrorDetails(null);
    setShowTechDetails(false);
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
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans pb-20 flex flex-col transition-colors duration-300 relative selection:bg-indigo-500/20 overflow-x-hidden">
      {/* ── Fixed Blurred Drifting Gradient Blobs & Subtle Grid Background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div
          className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] max-w-[700px] max-h-[700px] rounded-full blur-[90px] animate-blob-1"
          style={{ background: 'radial-gradient(circle, var(--blob-1) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-[25%] -right-[15%] w-[60vw] h-[60vw] max-w-[750px] max-h-[750px] rounded-full blur-[100px] animate-blob-2"
          style={{ background: 'radial-gradient(circle, var(--blob-2) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-[20%] left-[20%] w-[50vw] h-[50vw] max-w-[650px] max-h-[650px] rounded-full blur-[90px] animate-blob-3"
          style={{ background: 'radial-gradient(circle, var(--blob-3) 0%, transparent 70%)' }}
        />
        <div
          className="absolute inset-0 opacity-40 dark:opacity-25"
          style={{
            backgroundImage: `radial-gradient(var(--grid-pattern) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* ── Sticky Glass Header ── */}
      <header className="glass-header sticky top-0 z-30 transition-[background-color,border-color] duration-300">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 glass-pill rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="Toggle Recent Analyses"
            >
              <History className="w-4 h-4" />
            </button>
            <div className="p-2 rounded-[var(--radius-md)] bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-md shadow-indigo-500/25">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text-primary)] leading-tight">CRDF System</h1>
              <p className="text-xs text-[var(--text-muted)] font-medium">Claim vs Reality Determination Framework</p>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Backend Status Dot */}
            <div
              className="glass-pill flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
              title={backendConnected ? 'Backend reachable via /openapi.json' : 'Cannot reach backend at ' + BACKEND_URL}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  backendConnected
                    ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                    : 'bg-rose-500 shadow-xs shadow-rose-500/50'
                }`}
              />
              <span className={backendConnected ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'}>
                {backendConnected ? 'Backend connected' : 'Backend unreachable'}
              </span>
            </div>

            {/* Mock Mode Toggle */}
            <button
              type="button"
              onClick={() => setMockMode(!mockMode)}
              className={`glass-pill text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer ${
                mockMode ? 'border-amber-300 dark:border-amber-700 text-[var(--status-warning)]' : 'text-[var(--text-secondary)]'
              }`}
              title="Toggle mock mode"
            >
              <span className={`w-2 h-2 rounded-full ${mockMode ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>Mock: {mockMode ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open Recent Analyses History"
              className="glass-pill hidden md:flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <Bookmark className="w-3.5 h-3.5" /> Recent History ({history.length})
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle Dark Mode"
              aria-pressed={darkMode}
              className="glass-pill p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
            {response && (
              <button
                onClick={handleReset}
                aria-label="Start new analysis"
                className="glass-pill text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] font-semibold px-3 py-1.5 rounded-full cursor-pointer"
              >
                ← New Analysis
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Container: Shared max-w-6xl with 2-Column Grid ── */}
      <div className="flex-1 flex max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 relative">
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
                className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 md:hidden"
              />
              <motion.aside
                initial={{ x: -320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -320, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed md:sticky top-[68px] h-[calc(100vh-68px)] w-80 glass-card rounded-r-[var(--radius-xl)] md:rounded-[var(--radius-xl)] z-50 flex flex-col shadow-2xl md:shadow-lg mr-6 mb-6"
              >
                <div className="p-4 border-b border-[var(--glass-border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[var(--accent)]" />
                    <h2 className="font-bold text-[var(--text-primary)] text-sm">Recent Analyses</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    {history.length > 0 && (
                      <button
                        onClick={clearHistory}
                        className="text-xs text-[var(--text-muted)] hover:text-red-500 px-2 py-1 transition-colors cursor-pointer"
                        title="Clear all history"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg md:hidden cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {history.length === 0 ? (
                    <div className="text-center py-12 px-4 text-[var(--text-muted)] text-xs">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No previous analyses saved yet.</p>
                      <p className="mt-1 opacity-70">Run a claim analysis to see it here.</p>
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

                      const itemStatus =
                        (item.response.raw_pipeline_data?.status as string) ||
                        (item.response.raw_pipeline_data?.verdict as string) ||
                        (item.response.text_pipeline_report?.includes('CLAIM REQUIRES CLARIFICATION')
                          ? 'needs_clarification'
                          : item.response.text_pipeline_report?.includes('VERIFIED')
                          ? 'true'
                          : item.response.text_pipeline_report?.includes('REFUTED') || item.response.text_pipeline_report?.includes('FALSE')
                          ? 'false'
                          : 'requires_more_evidence');
                      const itemVerdict = parseVerdict(itemStatus);

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setResponse(item.response);
                            if (window.innerWidth < 768) setSidebarOpen(false);
                          }}
                          className={`group p-3 rounded-[var(--radius-md)] border text-left cursor-pointer transition-all relative ${
                            isSelected
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-600 shadow-xs'
                              : 'bg-[var(--glass-bg-subtle)] border-[var(--glass-border-subtle)] hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-[var(--glass-bg)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 leading-relaxed flex-1">
                              {item.claim}
                            </p>
                            <button
                              onClick={(e) => deleteHistoryItem(item.id, e)}
                              className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 p-1 transition-opacity rounded cursor-pointer"
                              title="Delete from history"
                              aria-label="Delete analysis from history"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[var(--glass-border-subtle)] text-[10px] text-[var(--text-muted)]">
                            <span className="font-mono">{dateStr}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <VerdictBadge verdict={itemVerdict} size="sm" showIcon={false} />
                              {item.response.multimodal_results?.image_analysis?.has_image && (
                                <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded font-semibold text-[9px]">
                                  IMG
                                </span>
                              )}
                            </div>
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

        {/* ── Main Content Area ── */}
        <div className="flex-1 w-full space-y-6">
          {/* Mock Mode Dismissible Notice */}
          {mockMode && !mockNoticeDismissed && (
            <div className="p-4 rounded-[var(--radius-lg)] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] text-[var(--status-warning)] text-sm flex items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start sm:items-center gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 sm:mt-0" />
                <p className="leading-relaxed">
                  Backend not reachable. Showing mock results. To run real analysis, run this app locally with the backend running.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setMockMode(false)}
                  className="text-xs font-semibold px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                >
                  Turn off mock mode
                </button>
                <button
                  type="button"
                  onClick={() => setMockNoticeDismissed(true)}
                  className="p-1 hover:bg-amber-500/20 rounded-md transition-colors cursor-pointer"
                  title="Dismiss notice"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Two-Column Desktop Grid (Left ~60%, Right ~40%) / Single-Column Mobile ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* ── Left Column (~60%): Analyze a Claim Glass Card ── */}
            <div className="lg:col-span-7 glass-card p-6 sm:p-8 space-y-6">
              {/* Eyebrow & Card Title */}
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-indigo-500/15 via-cyan-500/15 to-purple-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-500/30 mb-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-cyan-400 animate-pulse" />
                  <span>Multi-agent verification</span>
                </div>
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                    Analyze a Claim
                  </h2>
                  {history.length > 0 && !sidebarOpen && (
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="md:hidden text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 rounded-lg"
                    >
                      History ({history.length})
                    </button>
                  )}
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-1.5 leading-relaxed">
                  Enter the claim and attach supporting media. At least a claim is required; all media is optional.
                </p>
              </div>

              {/* 24px rhythm Section 1: Claim field */}
              <div className="space-y-2">
                <label htmlFor="claim-input" className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-muted)]">
                  Claim *
                </label>
                <textarea
                  id="claim-input"
                  value={claim}
                  onChange={(e) => setClaim(e.target.value)}
                  placeholder="e.g. 'This photo was taken during the wildfire in California last month.'"
                  className="w-full h-32 p-4 rounded-[var(--radius-md)] glass-input-inset text-[15px] leading-relaxed resize-none"
                  maxLength={2000}
                />
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Describe the specific assertion being evaluated</span>
                  <span
                    className={`font-mono transition-colors font-semibold ${
                      claim.length > 2000
                        ? 'text-[var(--status-danger)]'
                        : claim.length >= 1800
                        ? 'text-[var(--status-warning)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {claim.length}/2000
                  </span>
                </div>
              </div>

              {/* 24px rhythm Section 2: Supporting Media Dropzones */}
              <div className="space-y-2.5">
                <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
                  <span>Supporting Media</span>
                  <span className="text-[10px] lowercase text-[var(--text-placeholder)]">(optional attachments)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <FileSearch className="w-3.5 h-3.5 text-indigo-500" /> Image
                    </span>
                    <FileDropZone
                      label="Drop image"
                      hint="PNG, JPG, WEBP"
                      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                      file={imageFile}
                      onFile={setImageFile}
                      fileType="image"
                      onError={(msg) =>
                        setErrorDetails(
                          msg ? { message: msg, url: `${BACKEND_URL}/analyze`, status: 'CLIENT_VALIDATION' } : null
                        )
                      }
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <Video className="w-3.5 h-3.5 text-cyan-500" /> Video
                    </span>
                    <FileDropZone
                      label="Drop video"
                      hint="MP4, MOV, WEBM"
                      accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
                      file={videoFile}
                      onFile={setVideoFile}
                      fileType="video"
                      onError={(msg) =>
                        setErrorDetails(
                          msg ? { message: msg, url: `${BACKEND_URL}/analyze`, status: 'CLIENT_VALIDATION' } : null
                        )
                      }
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-purple-500" /> Document
                    </span>
                    <FileDropZone
                      label="Drop document"
                      hint="PDF, DOCX"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      file={documentFile}
                      onFile={setDocumentFile}
                      fileType="document"
                      onError={(msg) =>
                        setErrorDetails(
                          msg ? { message: msg, url: `${BACKEND_URL}/analyze`, status: 'CLIENT_VALIDATION' } : null
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              {/* 24px rhythm Section 3: Actions & Error Feedback */}
              <div className="space-y-4 pt-1">
                {/* Error Banner with Collapsible Technical Details */}
                {errorDetails && (
                  <div className="bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded-[var(--radius-md)] p-4 text-[var(--status-danger)] text-sm space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
                        <div>
                          <p className="font-semibold">Analysis Error</p>
                          <p className="mt-0.5 opacity-90 leading-relaxed">{errorDetails.message}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowTechDetails((prev) => !prev)}
                        className="text-xs font-semibold hover:underline flex items-center gap-1 shrink-0 bg-red-500/10 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        {showTechDetails ? 'Hide details' : 'Technical details'}
                      </button>
                    </div>

                    {showTechDetails && (
                      <div className="pt-2 border-t border-[var(--status-danger-border)] text-xs font-mono bg-red-500/5 p-3 rounded-lg space-y-1.5 overflow-x-auto">
                        <p><span className="font-bold">URL:</span> {errorDetails.url}</p>
                        <p><span className="font-bold">Status:</span> {errorDetails.status ?? 'N/A'}</p>
                        {errorDetails.rawBody && (
                          <div>
                            <span className="font-bold">Response body snippet (first 200 chars):</span>
                            <pre className="mt-1 p-2 bg-[var(--glass-bg-subtle)] rounded border border-[var(--glass-border-subtle)] overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
                              {errorDetails.rawBody}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Primary Action Button */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    id="analyze-btn"
                    onClick={handleAnalyze}
                    disabled={!claim.trim() || claim.length > 2000 || loading}
                    className="w-full sm:w-auto px-8 py-3.5 rounded-[var(--radius-md)] btn-primary-glass font-semibold text-sm flex items-center justify-center gap-2.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Analyzing Evidence...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>Run CRDF Analysis</span>
                      </>
                    )}
                  </button>

                  {(claim || imageFile || videoFile || documentFile) && !loading && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-4 py-3 rounded-[var(--radius-md)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-subtle)] border border-transparent hover:border-[var(--glass-border-subtle)] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      Clear form
                    </button>
                  )}
                </div>

                {claim.length > 2000 && (
                  <p className="text-xs text-red-500 font-medium">Claim exceeds maximum length of 2000 characters.</p>
                )}
              </div>
            </div>

            {/* ── Right Column (~40%): Sticky Results Glass Panel ── */}
            <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-6">
              
              {/* 1. Empty State (Before a run) */}
              {!response && !loading && (
                <div className="glass-card p-6 sm:p-8 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-[var(--radius-lg)] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 shadow-xs">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">
                    Your verdict will appear here
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] max-w-xs mb-8 leading-relaxed">
                    CRDF synthesizes multimodal evidence to cross-verify assertions against reality.
                  </p>

                  {/* 3 Hint Steps */}
                  <div className="w-full space-y-2.5 text-left">
                    <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] text-xs text-[var(--text-secondary)]">
                      <div className="w-6 h-6 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
                        1
                      </div>
                      <span className="font-medium">Enter claim to verify</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] text-xs text-[var(--text-secondary)]">
                      <div className="w-6 h-6 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
                        2
                      </div>
                      <span className="font-medium">Attach evidence (image, video, document)</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] text-xs text-[var(--text-secondary)]">
                      <div className="w-6 h-6 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
                        3
                      </div>
                      <span className="font-medium">Run analysis for verdict &amp; PDF report</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Loading State (With Glass Shimmer, Visual Stepper, Elapsed Time & Cancel) */}
              {loading && (
                <div className="glass-card animate-shimmer p-6 sm:p-8 space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-xs">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                    <h3 className="font-bold text-[var(--text-primary)] text-lg">Executing CRDF Pipeline</h3>
                    <p className="text-xs text-[var(--text-muted)]">Autonomous multi-agent verification in progress...</p>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] rounded-full text-xs font-mono text-[var(--text-secondary)] mt-2">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Elapsed: {formatElapsedTime(elapsedSeconds)}</span>
                    </div>
                  </div>

                  {/* Visual Stepper */}
                  <div className="space-y-4 pt-2">
                    {[
                      { step: 1, title: 'Media Ingestion & OCR', desc: 'Parsing multimodal files and extracting raw text' },
                      { step: 2, title: 'Multi-Agent Verification', desc: 'Decomposing claim, web search, and evidence scoring' },
                      { step: 3, title: 'Report Compilation', desc: 'Synthesizing confidence breakdown and final verdict' },
                    ].map((s) => {
                      const isDone = analysisStep > s.step;
                      const isCurrent = analysisStep === s.step;
                      return (
                        <div key={s.step} className="flex items-start gap-3">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                              isDone
                                ? 'bg-emerald-500 text-white shadow-xs'
                                : isCurrent
                                ? 'bg-indigo-600 text-white animate-pulse shadow-md shadow-indigo-500/30'
                                : 'bg-[var(--glass-bg-subtle)] text-[var(--text-muted)] border border-[var(--glass-border-subtle)]'
                            }`}
                          >
                            {isDone ? '✓' : s.step}
                          </div>
                          <div className="flex-1 pt-0.5">
                            <h4
                              className={`text-xs font-semibold ${
                                isCurrent
                                  ? 'text-indigo-600 dark:text-indigo-400'
                                  : isDone
                                  ? 'text-[var(--text-primary)]'
                                  : 'text-[var(--text-muted)]'
                              }`}
                            >
                              {s.title}
                            </h4>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{s.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cancel Button */}
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-5 py-2 border border-red-300 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-[var(--radius-md)] text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Results State (Modular ResultCards: Verdict, Sub-claims, Sources, Risk, Multimodal, PDF) */}
              {response && !loading && (
                <ResultCards
                  response={response}
                  onPreviewPdf={handlePreviewPdf}
                  onGeneratePdf={handleGeneratePdf}
                  pdfLoading={pdfLoading}
                  onNewAnalysis={handleReset}
                  historyCount={history.length}
                  onOpenHistory={() => setSidebarOpen(true)}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── PDF Viewer Modal (Glassmorphic) ── */}
      <AnimatePresence>
        {showPdfModal && pdfPreviewUrl && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="glass-card w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-[var(--glass-border-subtle)] flex items-center justify-between bg-[var(--glass-bg-subtle)]">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="font-bold text-[var(--text-primary)] text-sm">CRDF Report PDF Viewer</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGeneratePdf}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-[var(--radius-sm)] text-xs transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button
                    onClick={() => setShowPdfModal(false)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--glass-bg-subtle)] transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 p-3 bg-slate-900/10 dark:bg-black/40">
                <iframe
                  src={pdfPreviewUrl}
                  className="w-full h-full rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] shadow-inner bg-white"
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
