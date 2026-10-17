/**
 * Single AGENTS constant array defining the multi-agent verification pipeline.
 * Edit this array to add, reorder, or rename agents in the CRDF system.
 */
export const AGENTS = [
  "Claim Intake Specialist",
  "Claim Decomposer",
  "Document OCR Agent",
  "Image Authenticity Evaluator",
  "Video Analysis Agent",
  "Source Authentication Agent",
  "Evidence Collector",
  "Source Credibility Scorer",
  "Contradiction Detector",
  "Independent Cross-Verifier",
  "Risk & Severity Assessor",
  "Confidence Scorer",
  "Final Decision Maker",
  "Report Writer & Quality Verifier",
] as const;

export type AgentName = typeof AGENTS[number];

export interface AgentStep {
  agent: string;
  durationMs: number;
  status: 'completed' | 'skipped' | 'flagged';
  detail?: string;
}
