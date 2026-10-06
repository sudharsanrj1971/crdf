export interface AuthenticityAssessmentResult {
  authenticity_assessment: 'authentic' | 'likely_manipulated' | 'inconclusive';
  specific_artifacts_observed: string[];
  context_consistency: 'matches_claim' | 'contradicts_claim' | 'cannot_determine';
  confidence: number;
}
