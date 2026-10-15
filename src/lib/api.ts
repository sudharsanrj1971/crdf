/**
 * CRDF Frontend API client and error handling
 */
import type { AnalyzeResponse } from '../types';

export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

export interface ApiError {
  message: string;
  status?: number | string;
  url: string;
  rawBody?: string;
  isNetworkError?: boolean;
  isAbort?: boolean;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = (import.meta.env.VITE_API_KEY || '').trim();
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

/**
 * Format FastAPI 422 validation error
 */
function formatValidationError(detail: unknown): string {
  if (Array.isArray(detail)) {
    const fields = detail.map((item) => {
      if (item && typeof item === 'object') {
        const loc = Array.isArray(item.loc) ? item.loc.filter((l: unknown) => l !== 'body').join('.') : '';
        const msg = item.msg || 'Invalid value';
        return loc ? `field '${loc}': ${msg}` : msg;
      }
      return String(item);
    });
    return `Validation error on ${fields.join('; ')}`;
  }
  if (typeof detail === 'string') {
    return `Validation error: ${detail}`;
  }
  return 'Validation error: please check the submitted fields.';
}

/**
 * Parse response safely according to task specifications
 */
export async function parseResponse<T = unknown>(res: Response, url: string): Promise<T> {
  const raw = await res.text();
  const trimmed = raw.trim();
  const isHtml = trimmed.startsWith('<') || (res.headers.get('content-type') || '').includes('text/html');

  if (isHtml) {
    const error: ApiError = {
      message: `The backend returned a web page instead of JSON. The request did not reach the CRDF API at ${url}. Make sure web_app.py is running and VITE_BACKEND_URL is correct.`,
      status: res.status,
      url,
      rawBody: raw.slice(0, 200),
    };
    console.error('CRDF API Error (HTML returned instead of JSON):', error, raw);
    throw error;
  }

  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const error: ApiError = {
      message: `The backend returned a web page instead of JSON. The request did not reach the CRDF API at ${url}. Make sure web_app.py is running and VITE_BACKEND_URL is correct.`,
      status: res.status,
      url,
      rawBody: raw.slice(0, 200),
    };
    console.error('CRDF API Error (JSON parse failed):', error, raw, err);
    throw error;
  }

  if (!res.ok) {
    let friendlyMessage = '';
    const detail = json?.detail ?? json?.message;

    switch (res.status) {
      case 401:
      case 403:
        friendlyMessage = detail
          ? `Authentication error (${res.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
          : `Authentication failed (${res.status}). Please check your API credentials.`;
        break;
      case 422:
        friendlyMessage = formatValidationError(detail);
        break;
      case 429:
        friendlyMessage = `Rate limit exceeded (429). Please wait a moment and retry.${detail ? ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`;
        break;
      case 500:
        friendlyMessage = detail
          ? `Server error (500): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
          : 'Server error (500): Internal server error occurred on the backend.';
        break;
      case 504:
        friendlyMessage = 'Gateway timeout (504): The backend took too long to respond. Please try again.';
        break;
      default:
        friendlyMessage = detail
          ? `Request failed (${res.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
          : `Request failed with status ${res.status}: ${res.statusText || 'Unknown error'}`;
        break;
    }

    const error: ApiError = {
      message: friendlyMessage,
      status: res.status,
      url,
      rawBody: raw.slice(0, 200),
    };
    console.error(`CRDF API Error (${res.status}):`, error, json);
    throw error;
  }

  return json as T;
}

/**
 * Handle network / fetch exceptions into structured ApiError
 */
export function handleFetchError(err: unknown, url: string): ApiError {
  console.error('CRDF Fetch Exception:', err);

  if (err && typeof err === 'object' && 'message' in err && 'url' in err && 'status' in err) {
    return err as ApiError;
  }

  if (err instanceof DOMException && err.name === 'AbortError') {
    return {
      message: 'Analysis request was cancelled.',
      status: 'CANCELLED',
      url,
      isAbort: true,
    };
  }

  const message = `Cannot reach backend at ${url}.`;
  return {
    message,
    status: 'NETWORK_ERROR',
    url,
    rawBody: err instanceof Error ? err.message : String(err),
    isNetworkError: true,
  };
}

/**
 * File validation helpers
 */
export const ALLOWED_EXTENSIONS = {
  image: ['png', 'jpg', 'jpeg', 'webp'],
  video: ['mp4', 'mov', 'webm'],
  document: ['pdf', 'docx'],
};

export function validateFile(
  file: File,
  type: 'image' | 'video' | 'document'
): { valid: boolean; error?: string } {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const allowed = ALLOWED_EXTENSIONS[type];

  if (!allowed.includes(ext)) {
    const formatted = allowed.map((a) => a.toUpperCase()).join(', ');
    return {
      valid: false,
      error: `Invalid file format for "${file.name}". Accepted ${type} formats: ${formatted}.`,
    };
  }
  return { valid: true };
}

/**
 * Analyze claim request
 */
export async function analyzeClaim(
  data: {
    claim: string;
    sessionId?: string;
    imageFile?: File | null;
    videoFile?: File | null;
    documentFile?: File | null;
  },
  signal?: AbortSignal
): Promise<AnalyzeResponse> {
  const url = `${BACKEND_URL}/analyze`;
  const formData = new FormData();
  formData.append('claim', data.claim.trim());

  if (data.sessionId && data.sessionId.trim()) {
    formData.append('session_id', data.sessionId.trim());
  }
  if (data.imageFile) {
    formData.append('image', data.imageFile);
  }
  if (data.videoFile) {
    formData.append('video', data.videoFile);
  }
  if (data.documentFile) {
    formData.append('document', data.documentFile);
  }

  const headers = getAuthHeaders();

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      headers, // Do NOT set Content-Type manually, browser sets multipart boundary
      signal,
    });
    return await parseResponse<AnalyzeResponse>(res, url);
  } catch (err) {
    throw handleFetchError(err, url);
  }
}

/**
 * Generate PDF request
 */
export async function generatePdf(
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Blob> {
  const url = `${BACKEND_URL}/generate_pdf`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      await parseResponse(res, url); // will throw structured ApiError
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const raw = await res.text();
      throw {
        message: `The backend returned a web page instead of PDF. The request did not reach the CRDF API at ${url}. Make sure web_app.py is running and VITE_BACKEND_URL is correct.`,
        status: res.status,
        url,
        rawBody: raw.slice(0, 200),
      } as ApiError;
    }

    return await res.blob();
  } catch (err) {
    throw handleFetchError(err, url);
  }
}

/**
 * Health check querying /openapi.json for openapi key
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${BACKEND_URL}/openapi.json`, {
      method: 'GET',
      headers: getAuthHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const json = await res.json();
    return !!(json && typeof json === 'object' && 'openapi' in json);
  } catch {
    return false;
  }
}

/**
 * Mock analysis generator when running in mock mode
 */
export function getMockAnalysisResult(
  claim: string,
  hasImage: boolean,
  hasVideo: boolean,
  hasDocument: boolean
): AnalyzeResponse {
  return {
    claim,
    multimodal_results: {
      image_analysis: {
        has_image: hasImage,
        manipulation_check: {
          appears_manipulated: false,
          reasoning: hasImage
            ? 'Visual artifacts inspection indicates natural sensor noise and consistent lighting across boundaries.'
            : 'No image provided.',
        },
        content_match_check: {
          matches_claim: hasImage ? true : 'undetermined',
          reasoning: hasImage
            ? 'The visual elements correspond with the context and entities described in the claim.'
            : 'No image provided.',
        },
        confidence: hasImage ? 92 : undefined,
      },
      video_analysis: {
        has_video: hasVideo,
        manipulation_check: {
          appears_manipulated: false,
          reasoning: hasVideo
            ? 'Temporal continuity and frame sequence analysis show no splicing or deepfake anomalies.'
            : 'No video provided.',
        },
        content_match_check: {
          matches_claim: hasVideo ? true : 'undetermined',
          reasoning: hasVideo ? 'Keyframes align with claim details.' : 'No video provided.',
        },
      },
      document_analysis: {
        has_document: hasDocument,
        has_text_content: hasDocument,
        extracted_text: hasDocument
          ? `[Extracted Document Excerpt]\nRelevant verification passage for: "${claim}"\nDocument authenticity verified with structural formatting intact.`
          : '',
        unreadable_sections: [],
      },
    },
    multimodal_summary_text: `[MOCK MODE] Cross-modal verification completed for claim: "${claim}". The visual, video, and textual evidence were evaluated against reference knowledge. No manipulation signatures detected. Overall consistency is high.`,
    text_pipeline_report: `CRDF VERIFICATION REPORT (MOCK MODE)\n====================================\nClaim: ${claim}\nStatus: VERIFIED (Consistent with reality)\nConfidence: 94%\n\nEvidence Summary:\n- Fact-checking databases match the chronological and situational context of the claim.\n- Multimodal assets do not show signs of tampering or synthetic fabrication.\n- Cross-referencing against primary news sources indicates high factual accuracy.\n\nRecommendation: Claim is supported by available multimodal evidence.`,
    raw_pipeline_data: {
      status: 'mock_verified',
      claim,
      confidence_score: 94,
    },
  };
}

/**
 * Client-side mock PDF generator for preview and download in mock mode
 */
export function generateMockPdf(claim: string, report: string, summary: string): Blob {
  const sanitize = (str: string) => (str || '').replace(/[\(\)\\\r]/g, ' ').replace(/\n+/g, ' ');
  const lines: string[] = [];
  lines.push('CRDF - CLAIM VS REALITY DETERMINATION FRAMEWORK REPORT (MOCK)');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('--------------------------------------------------------------------------------');
  lines.push(`CLAIM: ${sanitize(claim).slice(0, 100)}`);
  lines.push('--------------------------------------------------------------------------------');
  lines.push('MULTIMODAL SUMMARY:');
  const summaryWords = sanitize(summary).split(' ');
  let cur = '';
  for (const w of summaryWords) {
    if ((cur + ' ' + w).length > 75) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur) lines.push(cur);

  lines.push('--------------------------------------------------------------------------------');
  lines.push('VERIFICATION FINDINGS:');
  const reportWords = sanitize(report).split(' ');
  cur = '';
  for (const w of reportWords) {
    if (lines.length > 38) {
      lines.push('... [Report truncated in summary PDF]');
      break;
    }
    if ((cur + ' ' + w).length > 75) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur && lines.length <= 38) lines.push(cur);

  let streamContent = 'BT\n/F1 10 Tf\n40 750 Td\n15 TL\n';
  for (const line of lines) {
    streamContent += `(${line}) '\n`;
  }
  streamContent += 'ET\n';

  const streamLen = new Blob([streamContent]).size;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  offsets.push(new Blob([pdf]).size);
  pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';

  offsets.push(new Blob([pdf]).size);
  pdf += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';

  offsets.push(new Blob([pdf]).size);
  pdf += '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n';

  offsets.push(new Blob([pdf]).size);
  pdf += `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}endstream\nendobj\n`;

  offsets.push(new Blob([pdf]).size);
  pdf += '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const startxref = new Blob([pdf]).size;
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return new Blob([pdf], { type: 'application/pdf' });
}
