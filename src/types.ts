/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Legacy type kept for AnalysisResultDisplay component (video results)
export interface AnalysisResult {
  visual_summary: string;
  audio_summary: string;
  editing_signs_observed: string[];
  context_consistency: 'matches_claim' | 'contradicts_claim' | 'cannot_determine';
  confidence: number;
}

export interface AnalysisResponse {
  success: boolean;
  result?: AnalysisResult;
  error?: string;
}

// --- Backend Pydantic model mirrors ---

export interface MultimodalCheck {
  appears_manipulated: boolean;
  reasoning: string;
}

export interface ContentMatchCheck {
  matches_claim: string | boolean;
  reasoning: string;
}

export interface ImageAnalysis {
  has_image: boolean;
  manipulation_check?: MultimodalCheck;
  content_match_check?: ContentMatchCheck;
  confidence?: number;
}

export interface VideoAnalysis {
  has_video: boolean;
  manipulation_check?: MultimodalCheck;
  content_match_check?: ContentMatchCheck;
}

export interface DocumentAnalysis {
  has_document: boolean;
  has_text_content?: boolean;
  extracted_text?: string;
  unreadable_sections?: string[];
}

export interface MultimodalResults {
  image_analysis: ImageAnalysis;
  video_analysis: VideoAnalysis;
  document_analysis: DocumentAnalysis;
}

export interface AnalyzeResponse {
  claim: string;
  multimodal_results: MultimodalResults;
  multimodal_summary_text: string;
  text_pipeline_report: string;
  raw_pipeline_data: Record<string, unknown>;
  text_pipeline_error?: string;
}
