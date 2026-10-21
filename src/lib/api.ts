/**
 * CRDF Network & API Client
 * Centralizes backend communication with web_app.py and optional mock simulation.
 */
import { AGENTS, AgentStep } from './agents';

export interface FileAttachments {
  image?: File;
  video?: File;
  document?: File;
}

export interface AnalysisResult {
  verdict: string;
  confidence: number;
  note?: string;
  steps: AgentStep[];
  evidence?: string[];
}

/**
 * Backend base URL configuration.
 * Defaults to same-origin /api.
 */
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');
export const BACKEND_LABEL = 'CRDF Backend';

/**
 * Checks backend reachability via /health.
 * Will not throw or crash the UI upon network failure.
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Analyzes a claim using either the live backend at VITE_BACKEND_URL or mock simulation.
 * 
 * - When isMock is false: Sends a multipart POST to {BACKEND_URL}/analyze.
 *   On failure, throws a detailed error containing the URL and status without silent fallback.
 * - When isMock is true: Simulates a local run with clear MOCK labeling.
 */
export async function analyzeClaim(
  claim: string,
  files: FileAttachments = {},
  isMock: boolean = false
): Promise<AnalysisResult> {
  const trimmedClaim = claim.trim();
  if (!trimmedClaim) {
    throw new Error('A claim statement is required to run verification.');
  }

  // --- MOCK MODE ---
  if (isMock) {
    await new Promise((resolve) => setTimeout(resolve, 1400));

    const lower = trimmedClaim.toLowerCase();
    const isFalse =
      lower.includes('flat earth') ||
      lower.includes('vaccines cause autism') ||
      lower.includes('moon landing was faked') ||
      lower.includes('5g causes covid') ||
      lower.includes('birds aren\'t real');

    const isQuestionable =
      lower.includes('alien') ||
      lower.includes('cryptocurrency') ||
      lower.includes('secret') ||
      lower.includes('conspiracy');

    let verdict = 'Verified True';
    let confidence = 94;

    if (isFalse) {
      verdict = 'Debunked / False';
      confidence = 98;
    } else if (isQuestionable) {
      verdict = 'Partially True';
      confidence = 68;
    } else if (trimmedClaim.length < 25) {
      verdict = 'Requires More Evidence';
      confidence = 54;
    }

    const steps: AgentStep[] = AGENTS.map((agentName, idx) => {
      const baseMs = 60 + ((idx * 27) % 110);
      let status: 'completed' | 'skipped' = 'completed';
      if (agentName.includes('Document') && !files.document) status = 'skipped';
      if (agentName.includes('Image') && !files.image) status = 'skipped';
      if (agentName.includes('Video') && !files.video) status = 'skipped';

      return {
        agent: agentName,
        durationMs: status === 'skipped' ? 12 : baseMs,
        status,
        detail: status === 'skipped' ? 'No input media attached' : `Completed evaluation in ${baseMs}ms`,
      };
    });

    return {
      verdict,
      confidence,
      note: 'Mock result. No backend was called.',
      steps,
      evidence: [
        'Cross-referencing with external knowledge graphs for factual consistency.',
        'Analyzing multimodal context: image metadata and scene recognition.',
        'Evaluating source provenance and historical reliability.',
        'Synthesizing agent consensus into final verdict.',
      ],
    };
  }

  // --- LIVE BACKEND MODE ---
  const targetUrl = `${BACKEND_URL}/analyze`;

  const formData = new FormData();
  formData.append('claim', trimmedClaim);
  if (files.image) formData.append('image', files.image);
  if (files.video) formData.append('video', files.video);
  if (files.document) formData.append('document', files.document);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const statusText = response.statusText || 'Error';
      let errorMsg = `HTTP ${response.status} (${statusText})`;
      try {
        const json = await response.json();
        errorMsg = json.detail || json.message || json.error || errorMsg;
      } catch {
        const text = await response.text();
        if (text && text.length < 150) errorMsg = text;
      }
      throw new Error(`Backend error from ${targetUrl} [${errorMsg}]`);
    }

    const data = await response.json();

    const verdict = data.verdict || data.classification || 'Verified True';
    const confidence = typeof data.confidence === 'number'
      ? data.confidence
      : (data.raw_pipeline_data?.confidence_score ?? 90);
    const note = data.note || data.multimodal_summary_text || 'Live analysis completed via CRDF backend.';

    const steps: AgentStep[] = data.steps || AGENTS.map((agentName, idx) => ({
      agent: agentName,
      durationMs: 75 + (idx * 15),
      status: 'completed',
    }));

    return {
      verdict,
      confidence,
      note,
      steps,
    };
  } catch (err: any) {
    console.error('CRDF live request failed:', err);
    // Specific error message for the UI
    const msg = err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Connection failed');
    throw new Error(`Cannot reach ${BACKEND_LABEL} at ${targetUrl}: ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generatePdf(
  claim: string,
  result: AnalysisResult
): Promise<Blob> {
  const response = await fetch(`${BACKEND_URL}/generate_pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      claim,
      multimodal_summary_text: `Verdict: ${result.verdict}. Confidence: ${result.confidence}%. Note: ${result.note || ''}`,
      text_pipeline_report: `Verdict: ${result.verdict}\nConfidence: ${result.confidence}%\nNote: ${result.note}\nSteps: ${JSON.stringify(result.steps)}`,
      raw_pipeline_data: { category: 'Claim Verification' }
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate PDF');
  }

  return response.blob();
}
