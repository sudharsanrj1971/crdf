import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Sun,
  Moon,
  History as HistoryIcon,
  RotateCcw,
  Sparkles,
  Loader2,
  X,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { DropZone } from './components/DropZone';
import { ResultCard } from './components/ResultCard';
import { ErrorNotification } from './components/ErrorNotification';
import { HistoryDrawer, HistoryItem } from './components/HistoryDrawer';
import { analyzeClaim, checkBackendHealth, AnalysisResult } from './lib/api';

const MAX_HISTORY_ITEMS = 20;

export default function App() {
  // Theme state: defaults to prefers-color-scheme, persists in localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem('crdf_theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {}
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  // Apply theme class to documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('crdf_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Form input states
  const [claim, setClaim] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  // File validation error states
  const [imageError, setImageError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  // App modes & status
  // Mock mode must default to OFF and never persist as ON silently
  const [mockMode, setMockMode] = useState<boolean>(false);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [dismissWarningBanner, setDismissWarningBanner] = useState<boolean>(false);

  // Execution & results state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // History state: last 20 items, persisted in localStorage
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('crdf_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(0, MAX_HISTORY_ITEMS);
      }
    } catch {}
    return [];
  });

  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // Persist history changes
  useEffect(() => {
    try {
      localStorage.setItem('crdf_history', JSON.stringify(historyItems));
    } catch {}
  }, [historyItems]);

  // Initial and periodic backend health check
  useEffect(() => {
    let mounted = true;
    const probeBackend = async () => {
      const isUp = await checkBackendHealth();
      if (mounted) {
        setBackendConnected(isUp);
      }
    };

    probeBackend();
    const interval = setInterval(probeBackend, 25000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Handle Form Submission
  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanClaim = claim.trim();
    if (!cleanClaim || isRunning) return;

    setIsRunning(true);
    setAnalysisError(null);
    setCurrentResult(null);

    try {
      const result = await analyzeClaim(
        cleanClaim,
        {
          image: imageFile || undefined,
          video: videoFile || undefined,
          document: documentFile || undefined,
        },
        mockMode
      );

      setCurrentResult(result);

      // Add to history (only successful analyses)
      const newItem: HistoryItem = {
        id: `crdf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: Date.now(),
        claim: cleanClaim,
        result,
      };

      setHistoryItems((prev) => [newItem, ...prev.slice(0, MAX_HISTORY_ITEMS - 1)]);

      // Scroll to result on small screens
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err: any) {
      setAnalysisError(err.message || 'An error occurred during analysis.');
      // Do not add failed run to history
    } finally {
      setIsRunning(false);
    }
  };

  // Handle Form Reset
  const handleClear = () => {
    setClaim('');
    setImageFile(null);
    setVideoFile(null);
    setDocumentFile(null);
    setImageError(null);
    setVideoError(null);
    setDocumentError(null);
    setCurrentResult(null);
    setAnalysisError(null);
  };

  // History Drawer actions
  const handleClearHistory = () => {
    setHistoryItems([]);
    try {
      localStorage.removeItem('crdf_history');
    } catch {}
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    setClaim(item.claim);
    setCurrentResult(item.result);
    setAnalysisError(null);
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  const showUnreachableWarning = backendConnected === false && !dismissWarningBanner;

  return (
    <div className="relative min-h-screen pb-16 selection:bg-[var(--accent-indigo)]/20 selection:text-[var(--accent-indigo)]">
      {analysisError && (
        <ErrorNotification
          message={analysisError}
          onClose={() => setAnalysisError(null)}
        />
      )}

      {/* Background Atmosphere Blobs (fixed, blur 90px, ~50% opacity in indigo, cyan, magenta) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        <div
          className="absolute -top-[12%] -left-[10%] w-[58vw] max-w-[500px] h-[58vw] max-h-[500px] rounded-full blur-[90px] opacity-50 transition-colors duration-700"
          style={{ background: 'var(--blob-1)' }}
        />
        <div
          className="absolute top-[35%] -right-[12%] w-[52vw] max-w-[460px] h-[52vw] max-h-[460px] rounded-full blur-[90px] opacity-45 transition-colors duration-700"
          style={{ background: 'var(--blob-2)' }}
        />
        <div
          className="absolute -bottom-[12%] left-[20%] w-[62vw] max-w-[540px] h-[62vw] max-h-[540px] rounded-full blur-[90px] opacity-40 transition-colors duration-700"
          style={{ background: 'var(--blob-3)' }}
        />
      </div>

      {/* Main Container: max-width 880px with >=12px mobile padding */}
      <div className="crdf-layout-container relative z-10 pt-3 sm:pt-5">
        {/* Sticky Glass Header */}
        <header className="sticky top-2 sm:top-4 z-30 mb-4 sm:mb-6 rounded-[22px] glass-panel-elevated p-3 sm:p-4 transition-all duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            {/* Left: Shield logo tile & Brand Title */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-md text-white"
                style={{ background: 'var(--accent-gradient)' }}
              >
                <Shield className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight truncate">
                  CRDF System
                </h1>
                <p className="text-[11px] sm:text-xs font-semibold text-[var(--text-muted)] truncate">
                  Claim vs Reality Determination Framework
                </p>
              </div>
            </div>

            {/* Right: Header controls with wrapping and mobile-responsive text */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 ml-auto">
              {/* 1. Backend Status Pill */}
              <div
                aria-label={`Backend status: ${
                  backendConnected === true ? 'Backend connected' : 'Backend unreachable'
                }`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] select-none"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    backendConnected === true
                      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                      : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                  }`}
                />
                <span className="hidden sm:inline text-[11px] font-semibold text-[var(--text-muted)]">
                  {backendConnected === true ? 'Backend connected' : 'Backend unreachable'}
                </span>
              </div>

              {/* 2. Mock ON/OFF Toggle Pill */}
              <button
                type="button"
                onClick={() => setMockMode((prev) => !prev)}
                aria-label={`Mock mode is ${mockMode ? 'ON' : 'OFF'}. Click to toggle.`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer select-none ${
                  mockMode
                    ? 'border-indigo-500/40 bg-indigo-500/15 text-[var(--accent-indigo)] hover:bg-indigo-500/25'
                    : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-muted)] hover:bg-[var(--glass-bg)]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>{mockMode ? 'Mock ON' : 'Mock OFF'}</span>
              </button>

              {/* 3. History Button */}
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label={`View analysis history. ${historyItems.length} items saved.`}
                className="glass-button-ghost inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-bold text-[var(--text-primary)] cursor-pointer"
              >
                <HistoryIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">History</span>
                <span className="font-mono text-[11px] bg-[var(--glass-bg-elevated)] px-1.5 py-0.2 rounded-md border border-[var(--glass-border-subtle)]">
                  {historyItems.length}
                </span>
              </button>

              {/* 4. Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                className="glass-button-ghost p-1.5 sm:p-2 rounded-full text-[var(--text-primary)] cursor-pointer"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              >
                {theme === 'light' ? (
                  <Moon className="w-4 h-4 text-slate-700" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-400" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Persistent Unmissable MOCK DATA Banner (shown whenever Mock Mode is ON) */}
        {mockMode && (
          <div
            role="status"
            className="mb-4 sm:mb-6 p-4 rounded-2xl border-2 border-amber-500 bg-amber-500/15 text-amber-950 dark:text-amber-200 shadow-md flex flex-wrap items-center justify-between gap-3 animate-pulse-subtle"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shrink-0 shadow-xs">
                MOCK DATA
              </span>
              <div>
                <p className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                  Simulation Active — No backend was called
                </p>
                <p className="text-[11px] sm:text-xs text-amber-800/90 dark:text-amber-300 font-medium">
                  Results generated in this mode are synthetic and will be labeled as MOCK in reports.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMockMode(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition cursor-pointer shrink-0 shadow-xs"
            >
              Turn OFF Mock Mode
            </button>
          </div>
        )}

        {/* Dismissible Warning Banner (shown when backend is unreachable and mock mode is OFF) */}
        {backendConnected === false && !mockMode && !dismissWarningBanner && (
          <div
            role="status"
            className="mb-4 sm:mb-6 p-3 sm:p-3.5 rounded-2xl glass-panel border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200 flex flex-wrap items-center justify-between gap-3 shadow-md"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <p className="text-xs sm:text-sm font-semibold truncate">
                Backend not reachable at {import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'}. Make sure web_app.py is running.
              </p>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setMockMode(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 transition cursor-pointer"
              >
                Turn on mock mode
              </button>

              <button
                type="button"
                onClick={() => setDismissWarningBanner(true)}
                aria-label="Dismiss unreachable backend warning"
                className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <section className="mb-4 sm:mb-6 text-center sm:text-left px-1">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Multi-Agent Claim Verification
          </h2>
          <p className="mt-1 text-sm sm:text-base font-medium text-[var(--text-muted)] max-w-2xl">
            Evaluate claims across decomposed assertions, forensic media checks, and source credibility weighting.
          </p>
        </section>

        {/* Main Glass Card: "Analyze a claim" */}
        <main className="glass-panel p-5 sm:p-7 shadow-xl">
          <form onSubmit={handleAnalyze} noValidate>
            {/* Header of form */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--glass-border-subtle)]">
              <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">
                Analyze a claim
              </h3>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--glass-bg-subtle)] border border-[var(--glass-border-subtle)] text-[var(--text-muted)]">
                {mockMode ? '⚡ Mock Mode Active' : '🌐 Live Backend Mode'}
              </span>
            </div>

            {/* Field 1: Claim Textarea */}
            <div className="mb-5 sm:mb-6">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="claim-input"
                  className="text-xs sm:text-sm font-bold text-[var(--text-primary)] flex items-center"
                >
                  <span>Claim</span>
                  <span className="ml-1.5 text-[11px] font-extrabold text-rose-500 uppercase tracking-wider">
                    required
                  </span>
                </label>
                <span
                  className={`text-xs font-mono font-medium ${
                    claim.length >= 2000 ? 'text-rose-500 font-bold' : 'text-[var(--text-subtle)]'
                  }`}
                >
                  {claim.length} / 2000
                </span>
              </div>

              <textarea
                id="claim-input"
                name="claim"
                rows={4}
                maxLength={2000}
                required
                disabled={isRunning}
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                placeholder="e.g. The first iPhone was announced by Steve Jobs on January 9, 2007, and released on June 29, 2007."
                className="w-full min-h-[120px] resize-y p-3.5 sm:p-4 rounded-[16px] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-sm sm:text-base text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:bg-[var(--glass-bg)] transition-colors outline-none"
              />

              <p className="mt-1.5 text-xs text-[var(--text-muted)] font-medium">
                Describe the specific assertion being evaluated.
              </p>
            </div>

            {/* Field 2: Supporting Media Drop Zones Grid */}
            <div className="mb-6">
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                  Supporting media
                </span>
                <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  optional
                </span>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3 sm:gap-4">
                {/* Zone 1: Image */}
                <DropZone
                  type="image"
                  title="Drop image"
                  formatsDesc="PNG, JPG, WEBP"
                  maxSizeBytes={10 * 1024 * 1024}
                  maxSizeLabel="10 MB"
                  allowedExtensions={['png', 'jpg', 'jpeg', 'webp']}
                  file={imageFile}
                  onFileSelect={setImageFile}
                  error={imageError}
                  onErrorChange={setImageError}
                  disabled={isRunning}
                />

                {/* Zone 2: Video */}
                <DropZone
                  type="video"
                  title="Drop video"
                  formatsDesc="MP4, MOV, WEBM"
                  maxSizeBytes={100 * 1024 * 1024}
                  maxSizeLabel="100 MB"
                  allowedExtensions={['mp4', 'mov', 'webm']}
                  file={videoFile}
                  onFileSelect={setVideoFile}
                  error={videoError}
                  onErrorChange={setVideoError}
                  disabled={isRunning}
                />

                {/* Zone 3: Document */}
                <DropZone
                  type="document"
                  title="Drop document"
                  formatsDesc="PDF, DOCX, TXT"
                  maxSizeBytes={20 * 1024 * 1024}
                  maxSizeLabel="20 MB"
                  allowedExtensions={['pdf', 'docx', 'txt']}
                  file={documentFile}
                  onFileSelect={setDocumentFile}
                  error={documentError}
                  onErrorChange={setDocumentError}
                  disabled={isRunning}
                />
              </div>
            </div>

            {/* Field 3: Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[var(--glass-border-subtle)]">
              <button
                type="submit"
                disabled={!claim.trim() || isRunning}
                className="primary-gradient-btn inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3 rounded-[14px] text-sm font-extrabold text-white cursor-pointer select-none"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing claim...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 stroke-[2.5]" />
                    <span>Analyze claim</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleClear}
                disabled={isRunning || (!claim && !imageFile && !videoFile && !documentFile && !currentResult && !analysisError)}
                className="glass-button-ghost inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 py-3 rounded-[14px] text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Clear</span>
              </button>
            </div>
          </form>
        </main>

        {/* Result Card: hidden until an analysis runs */}
        <div ref={resultRef}>
          <ResultCard
            result={currentResult}
            error={analysisError}
            onTurnOnMock={() => setMockMode(true)}
            claim={claim}
            isMock={mockMode}
            attachedMedia={[
              ...(imageFile ? [{ name: imageFile.name, type: 'image' as const, sizeBytes: imageFile.size }] : []),
              ...(videoFile ? [{ name: videoFile.name, type: 'video' as const, sizeBytes: videoFile.size }] : []),
              ...(documentFile ? [{ name: documentFile.name, type: 'document' as const, sizeBytes: documentFile.size }] : []),
            ]}
            isRunning={isRunning}
          />
        </div>

        {/* Footer info */}
        <footer className="mt-8 text-center text-xs font-medium text-[var(--text-muted)] space-y-1">
          <p>
            CRDF System • Multi-Agent Evidence & Fact Verification Engine
          </p>
          <p className="text-[11px] text-[var(--text-subtle)]">
            Evaluates claim veracity through independent agents, credibility scoring, and contradiction detection.
          </p>
        </footer>
      </div>

      {/* History Drawer */}
      <HistoryDrawer
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={historyItems}
        onClearHistory={handleClearHistory}
        onSelectItem={handleSelectHistoryItem}
      />
    </div>
  );
}
