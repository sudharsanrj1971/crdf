/**
 * CRDF Network & API Client
 * Centralizes backend communication with web_app.py and optional mock simulation.
 */
import { AGENTS, AgentStep } from './agents';
import type { AnalyzeResponse } from '../types';

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
  /** Full markdown report produced by the pipeline (live mode only). */
  report?: string;
  /** Raw /analyze response, kept so the backend can render the PDF from it. */
  raw?: AnalyzeResponse;
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
    if (!res.ok) return false;
    // Backend reports ready:false when GEMINI_API_KEY is missing.
    const body = await res.json().catch(() => ({}));
    return body?.ready !== false;
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
  formData.append('session_id', 'none');
  if (files.image) formData.append('image', files.image);
  if (files.video) formData.append('video', files.video);
  if (files.document) formData.append('document', files.document);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 11 * 60 * 1000);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status} (${response.statusText || 'Error'})`;
      const bodyText = await response.text().catch(() => '');
      try {
        const json = JSON.parse(bodyText);
        const d = json.detail ?? json.message ?? json.error;
        if (d) errorMsg = typeof d === 'string' ? d : JSON.stringify(d);
      } catch {
        if (bodyText && bodyText.length < 200) errorMsg = bodyText;
      }
      throw new Error(errorMsg);
    }

    const data = (await response.json()) as AnalyzeResponse;

    // The pipeline reports its own failures in-band; never turn those into a verdict.
    if (data.text_pipeline_error) {
      throw new Error(`Pipeline error: ${data.text_pipeline_error}`);
    }
    if (!data.text_pipeline_report) {
      throw new Error('Backend returned no report.');
    }

    const { verdict, confidence } = extractVerdict(data);
    const steps = buildSteps(data, files);

    return {
      verdict,
      confidence,
      note: data.multimodal_summary_text || undefined,
      steps,
      report: data.text_pipeline_report,
      raw: data,
    };
  } catch (err: any) {
    console.error('CRDF live request failed:', err);
    const msg = err.name === 'AbortError' ? 'Request timed out' : (err.message || 'Connection failed');
    throw new Error(`${BACKEND_LABEL} (${targetUrl}): ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Pull the final verdict + confidence out of the real pipeline output.
 * Order: the report's own verdict line -> structured final_verdicts -> "Undetermined"/0.
 * Nothing is defaulted to a favourable value.
 */
export function extractVerdict(data: AnalyzeResponse): { verdict: string; confidence: number } {
  const report = data.text_pipeline_report || '';
  const raw = (data.raw_pipeline_data || {}) as Record<string, any>;

  if (report.includes('CLAIM REQUIRES CLARIFICATION')) {
    return { verdict: 'Requires Clarification', confidence: 0 };
  }

  const m = report.match(/final verdict[^:\n]*:\s*(.+?)\s*\|\s*confidence score[^:\n]*:\s*([\d.]+)/i);
  if (m) {
    return { verdict: m[1].replace(/\*+/g, '').trim(), confidence: Math.round(parseFloat(m[2])) };
  }

  const fv: any[] = raw?.make_final_decision?.final_verdicts ?? [];
  if (fv.length) {
    const classes = Array.from(new Set(fv.map((v) => String(v.classification))));
    const scores = fv.map((v) => Number(v.confidence_score)).filter((n) => !Number.isNaN(n));
    return {
      verdict: classes.length === 1 ? classes[0] : `Mixed (${classes.join(' / ')})`,
      confidence: scores.length ? Math.round(Math.min(...scores)) : 0,
    };
  }
  return { verdict: 'Undetermined', confidence: 0 };
}

const TASK_TO_AGENT: Record<string, string> = {
  take_the_raw_user_task: 'Claim Intake Specialist',
  decompose_claim_into_subclaims: 'Claim Decomposer',
  extract_document_text: 'Document OCR Agent',
  check_image_authenticity: 'Image Authenticity Evaluator',
  check_video_authenticity: 'Video Analysis Agent',
  authenticate_cited_sources: 'Source Authentication Agent',
  collect_evidence_for_subclaims: 'Evidence Collector',
  score_source_credibility: 'Source Credibility Scorer',
  detect_contradictions: 'Contradiction Detector',
  cross_verify_independently: 'Independent Cross-Verifier',
  assess_risk_and_severity: 'Risk & Severity Assessor',
  score_confidence: 'Confidence Scorer',
  make_final_decision: 'Final Decision Maker',
  write_full_report: 'Report Writer & Quality Verifier',
  verify_report_quality: 'Report Writer & Quality Verifier',
};

/** Agent steps reflect what actually ran (durations are not measured by the backend). */
function buildSteps(data: AnalyzeResponse, files: FileAttachments): AgentStep[] {
  const raw = (data.raw_pipeline_data || {}) as Record<string, unknown>;
  const ran = new Set(Object.keys(raw).map((k) => TASK_TO_AGENT[k]).filter(Boolean));
  return AGENTS.map((agent) => {
    const needsMedia =
      (agent.includes('Document') && !files.document) ||
      (agent.includes('Image') && !files.image) ||
      (agent.includes('Video') && !files.video);
    const status: AgentStep['status'] = needsMedia ? 'skipped' : ran.has(agent) ? 'completed' : 'skipped';
    return {
      agent,
      durationMs: 0,
      status,
      detail: needsMedia ? 'No input media attached' : status === 'skipped' ? 'Not run for this claim' : 'Completed',
    };
  });
}

/**
 * Asks the Python backend to render the PDF (CRDF sample-report layout) from the
 * exact /analyze response. Only available for live results.
 */
export async function generatePdf(claim: string, result: AnalysisResult): Promise<Blob> {
  if (!result.raw) {
    throw new Error('Backend PDF needs a live result. Mock results can use the local PDF export.');
  }
  const response = await fetch(`${BACKEND_URL}/generate_pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...result.raw, claim }),
  });
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const j = await response.json();
      msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail ?? j);
    } catch {}
    throw new Error(`PDF generation failed: ${msg}`);
  }
  return response.blob();
}
