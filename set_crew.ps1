@'
{
  "name": "crdf_system",
  "agents": ["auth_session_agent", "claim_intake_specialist", "claim_decomposer", "source_authentication_agent", "evidence_collector", "source_credibility_scorer", "contradiction_detector", "cross_verifier", "risk_assessor", "confidence_scorer", "final_decision_maker", "report_writer", "quality_verifier", "document_ocr_agent", "image_authenticity_agent", "video_analysis_agent"],
  "tasks": [
    {
      "name": "validate_session",
      "description": "Validate the session before any claim processing begins. The session ID provided is: {session_id}. Check that it is not empty, follows a reasonable format (non-trivial length, not obviously fake like 'test' or '123'), and treat it as valid if it looks like a genuine identifier. Log this attempt with a timestamp-style note regardless of whether it passes or fails. If you detect this appears to be a rapid repeated submission pattern based on the session_id alone (you cannot truly track rate across calls without persistent storage, so simply note this limitation), flag it as a potential concern without blocking the request. Always allow processing to continue afterward regardless of validation outcome, since this is a logging and flagging step, not a hard gate in this local deployment.",
      "expected_output": "A JSON object with fields: session_valid (boolean), session_id_checked (string), log_entry (string, a one-line audit note including the outcome), abuse_flag (boolean), abuse_flag_reason (string, empty if abuse_flag is false).",
      "agent": "auth_session_agent",
      "async_execution": true,
      "context": []
    },
    {
      "name": "extract_document_text",
      "description": "If an image, screenshot, or document file is provided at {document_file}, extract all literal text from it exactly as written, including any tables, headings, and dates, without cleaning up grammar, paraphrasing, or correcting anything. Mark any section that is genuinely unreadable as [illegible] rather than guessing at its content. If no document_file is provided or the placeholder is empty, output an empty extracted_text field and set has_document to false.",
      "expected_output": "A JSON object with fields: has_document (boolean), extracted_text (string, the literal transcribed text, or empty string if no document was provided), unreadable_sections (array of strings describing any [illegible] markers used).",
      "agent": "document_ocr_agent",
      "async_execution": true,
      "context": []
    },
    {
      "name": "check_image_authenticity",
      "description": "If an image is provided at {image_file}, perform two SEPARATE checks and never conflate them. Check 1 - Manipulation: examine the image for technical signs of editing such as lighting inconsistencies, cloning artifacts, or compositing seams, and state whether it appears manipulated. Check 2 - Content Match: independently assess whether what the image actually shows matches the claim: {claim}, regardless of whether the image is manipulated or not. An unedited real photo can still be irrelevant to or misused for a claim, and a manipulated image could coincidentally still depict something related to the claim - keep these two findings distinct. If no image_file is provided or the placeholder is empty, output has_image as false with both checks empty.",
      "expected_output": "A JSON object with fields: has_image (boolean), manipulation_check (object with: appears_manipulated (boolean), reasoning (string)), content_match_check (object with: matches_claim (boolean or 'undetermined'), reasoning (string)).",
      "agent": "image_authenticity_agent",
      "input_files": {
        "uploaded_image": "{image_file}"
      },
      "async_execution": true,
      "context": []
    },
    {
      "name": "check_video_authenticity",
      "description": "If a video is provided at {video_file}, extract the visual and audio content across the clip's full duration. Check 1 - Manipulation: examine the video for signs of editing, such as unnatural cuts, audio-visual desync, or deepfake artifacts, and state whether it appears manipulated. Check 2 - Content Match: independently assess whether what the video actually shows and says matches the claim: {claim}, regardless of whether it is manipulated. Keep these two findings distinct, as with image analysis. If no video_file is provided or the placeholder is empty, output has_video as false with both checks empty.",
      "expected_output": "A JSON object with fields: has_video (boolean), manipulation_check (object with: appears_manipulated (boolean), reasoning (string)), content_match_check (object with: matches_claim (boolean or 'undetermined'), reasoning (string)).",
      "agent": "video_analysis_agent",
      "async_execution": true,
      "context": []
    },
    {
      "name": "take_the_raw_user_task",
      "description": "Take the raw user claim: {claim}. Clean up any grammar or informal language without changing its meaning. Determine if it is a genuine checkable factual claim, as opposed to a question, greeting, empty input, or pure opinion/prediction. If the claim is ambiguous (missing a critical name, date, or location needed to verify it), do not guess \u2014 instead ask exactly one clarifying question. If the input is not a checkable claim at all, reject it and explain why in one sentence. Output the cleaned claim text along with a boolean field ready_for_processing that is true only when the claim is clear enough to move to decomposition.",
      "expected_output": "A JSON object with exactly these fields: cleaned_claim (string), ready_for_processing (boolean), and status (string - one of ready, needs_clarification, or rejected).",
      "agent": "claim_intake_specialist",
      "context": []
    },
    {
      "name": "decompose_claim_into_subclaims",
      "description": "Take the cleaned claim from the previous step. If the input text is not itself a substantive factual claim - for example, if it is a clarifying question, a rejection message, or an empty/unclear statement - output {\"sub_claims\": []} and do nothing else. Otherwise, break it into the smallest set of independently verifiable sub-claims (maximum 7). Clearly separate factual assertions from opinions or predictions. IMPORTANT: every assertion in the claim must appear as a sub-claim, including opinions and predictions \u2014 do not omit them. Mark factual assertions as type factual, and mark opinions or predictions as type opinion_prediction. Never drop a sub-claim just because it is not independently checkable. For each sub-claim, extract any entities (people, organizations), dates, and locations mentioned. If the claim is a single simple fact, output it as one sub-claim rather than forcing a split.",
      "expected_output": "A JSON object with a field sub_claims, which is an array of objects. Each object has: text (string), type (string - either factual or opinion_prediction), entities (array of strings), dates (array of strings), and locations (array of strings). Empty arrays are fine when nothing is found.",
      "agent": "claim_decomposer",
      "context": ["take_the_raw_user_task"]
    },
    {
      "name": "authenticate_cited_sources",
      "description": "Take the sub_claims list from the previous step. Scan each sub-claim's text for any explicitly cited source (e.g. 'according to a 2023 NASA report', 'a study published in Nature found...', 'CNN reported that...'). If a sub-claim cites no source, skip it. For each cited source found: first check if a direct URL is present or discoverable in the claim text and attempt to verify it directly; if no URL exists or it cannot be resolved, fall back to a targeted web search for the exact source title, publisher, and date to determine if it genuinely exists. Never assume a source is real just because it sounds authoritative or official-sounding. If sub_claims is empty, output an empty cited_sources array.",
      "expected_output": "A JSON object with a field cited_sources, an array of objects. Each object has: sub_claim_text (string), source_name (string, the cited source as written), url_checked (string or null), search_performed (boolean), verification_status (string - one of confirmed, not_found, or exists_but_misattributed), reasoning (string, one sentence).",
      "agent": "source_authentication_agent",
      "async_execution": true,
      "context": ["decompose_claim_into_subclaims"]
    },
    {
      "name": "collect_evidence_for_subclaims",
      "description": "Take the sub_claims list from the previous step. For each sub-claim with type factual, formulate 2-3 targeted search queries and use the search tool to find real evidence. Aim for at least 3 independent sources per sub-claim where possible, avoiding near-duplicate sources from the same publisher. Report both supporting and opposing evidence honestly \u2014 if no opposing evidence genuinely exists, say so rather than inventing fake controversy. Skip evidence collection entirely for sub-claims of type opinion_prediction, and skip everything if sub_claims is empty.",
      "expected_output": "A JSON object with a field evidence, an array of objects. Each object has: sub_claim_text (string), sources (array of objects, each with url, publisher, supports (boolean), and summary (string, one sentence)).",
      "agent": "evidence_collector",
      "async_execution": true,
      "context": ["decompose_claim_into_subclaims"]
    },
    {
      "name": "assess_risk_and_severity",
      "description": "Take the sub_claims list. For each sub-claim, evaluate what would happen if it turned out to be false and someone genuinely acted on that false belief. Rate the severity as exactly one of: low, medium, high, or critical. Identify which of these domains would be affected, if any: financial, reputational, legal, public_health, public_safety. A sub-claim can affect multiple domains or none. Base the rating purely on real-world consequence, not on how confident or authoritative the claim sounds. If sub_claims is empty, output an empty risk_assessments array.",
      "expected_output": "A JSON object with a field risk_assessments, an array of objects. Each object has: sub_claim_text (string), severity (string - one of low, medium, high, critical), domains_affected (array of strings from: financial, reputational, legal, public_health, public_safety), reasoning (string, one to two sentences).",
      "agent": "risk_assessor",
      "async_execution": true,
      "context": ["decompose_claim_into_subclaims"]
    },
    {
      "name": "score_source_credibility",
      "description": "Take the evidence list from the collect_evidence_for_subclaims step. For every source under every sub-claim, assign a credibility score from 0.0 to 1.0 based on four criteria: authority (is this a recognized, reputable publisher), recency (is the information current), corroboration (do other independent sources agree), and historical reliability (has this publisher been generally accurate over time). IMPORTANT: if a source is unfamiliar or its reliability cannot be verified, cap its score at 0.4 maximum, even if other sources happen to corroborate it - corroboration alone can never rescue an untrustworthy source above that cap. ADDITIONALLY: cross-reference the cited_sources list from the authenticate_cited_sources step. If a source appears there with verification_status of not_found, cap its credibility_score at 0.1 maximum regardless of any other factor, since the source itself could not be confirmed to exist. If verification_status is exists_but_misattributed, cap its credibility_score at 0.2 maximum, since the source exists but is being used to support something it does not actually say - this is worse than an unverifiable source, not merely equal to one. If evidence is empty, output an empty scores array.",
      "expected_output": "A JSON object with a field scores, an array of objects. Each object has: url (string), publisher (string), credibility_score (number between 0.0 and 1.0), reasoning (string, one sentence explaining the score).",
      "agent": "source_credibility_scorer",
      "async_execution": true,
      "context": ["collect_evidence_for_subclaims", "authenticate_cited_sources"]
    },
    {
      "name": "detect_contradictions",
      "description": "Take the evidence list from the collect_evidence_for_subclaims step. For each sub-claim, compare all its sources and identify genuine conflicts. Classify every conflict found as exactly one of three types: full_contradiction (sources directly state opposing facts about the same thing), partial_contradiction (sources disagree only on scope, degree, or detail, not the core fact), or temporal_difference (both statements are true, just at different points in time - this is NOT a real conflict and should be labeled accordingly rather than treated as a problem). If sources for a sub-claim genuinely agree with no meaningful disagreement, report no contradiction for that sub-claim. If evidence is empty, output an empty contradictions array.",
      "expected_output": "A JSON object with a field contradictions, an array of objects. Each object has: sub_claim_text (string), contradiction_type (string - one of full_contradiction, partial_contradiction, temporal_difference, or none), explanation (string, one to two sentences describing what was found).",
      "agent": "contradiction_detector",
      "async_execution": true,
      "context": ["collect_evidence_for_subclaims"]
    },
    {
      "name": "cross_verify_independently",
      "description": "Take ONLY the raw evidence list from the collect_evidence_for_subclaims step - the sources, their supports flags, and summaries. Do NOT reference or consider any credibility scores or contradiction findings from other steps, as this evaluation must be completely independent. For each sub-claim, form your own verdict based solely on this raw evidence: does the evidence, taken as a whole, support the sub-claim, contradict it, or is it genuinely ambiguous? Give a brief independent reasoning for each verdict. If evidence is empty, output an empty verdicts array.",
      "expected_output": "A JSON object with a field verdicts, an array of objects. Each object has: sub_claim_text (string), independent_verdict (string - one of supported, contradicted, or ambiguous), reasoning (string, one to two sentences).",
      "agent": "cross_verifier",
      "async_execution": true,
      "context": ["collect_evidence_for_subclaims"]
    },
    {
      "name": "score_confidence",
      "description": "Take the scores list from score_source_credibility, the contradictions list from detect_contradictions, and the verdicts list from cross_verify_independently. For each sub-claim, compute one final confidence score from 0 to 100 using this exact weighting: source credibility contributes up to 40 percent of the score (based on the average credibility_score of that sub-claim's sources), absence of unresolved contradictions contributes up to 35 percent (full_contradiction or partial_contradiction reduces this heavily, temporal_difference or none does not), and cross-verification agreement contributes up to 25 percent (full points if independent_verdict agrees with the overall evidence direction, zero if it does not). CRITICAL: Calculate the three component values first, then add them together. The confidence_score field MUST be exactly that sum, with no rounding beyond the nearest whole number, no bonus points, no additional adjustments, and no invented justifications for changing it. Before writing your final answer, re-check: does confidence_score exactly equal the sum stated in breakdown? If not, fix confidence_score to match breakdown, never the other way around. IMPORTANT HARD RULE: if the independent_verdict for a sub-claim is ambiguous, the final confidence score for that sub-claim must be capped at 65 maximum, regardless of how high the other three factors would otherwise push it. If sub_claims is empty, output an empty confidence_scores array.",
      "expected_output": "A JSON object with a field confidence_scores, an array of objects. Each object has: sub_claim_text (string), confidence_score (integer 0-100), breakdown (string, briefly showing how the three factors combined), capped_for_ambiguity (boolean).",
      "agent": "confidence_scorer",
      "context": ["score_source_credibility", "detect_contradictions", "cross_verify_independently"]
    },
    {
      "name": "make_final_decision",
      "description": "Take the sub_claims, contradictions, verdicts, and confidence_scores from the previous steps. For each sub-claim, assign exactly one final classification by checking these rules IN ORDER and stopping at the first that applies: (1) If the sub-claim's type is opinion_prediction, classify as Unverifiable. (2) If evidence was empty or confidence_score is below 20, classify as Requires More Evidence. (3) If contradiction_type is full_contradiction AND independent_verdict is contradicted, classify as False. (4) If contradiction_type is full_contradiction but independent_verdict disagrees, or if contradiction_type is partial_contradiction, classify as Partially True. (5) If evidence technically supports the literal wording but is deceptive or missing critical context, classify as Misleading. (6) If independent_verdict is supported and confidence_score is 70 or above, classify as True. (6.5) If independent_verdict is contradicted and confidence_score is 70 or above, classify as False. (7) Otherwise, classify as Requires More Evidence. CRITICAL RULE: You MUST copy the confidence_score value exactly as given from the score_confidence step for each matching sub-claim. Do NOT recalculate it, adjust it, round it differently, or invent a new number under any circumstances - only the classification is your job here, the score is not yours to change.",
      "expected_output": "A JSON object with a field final_verdicts, an array of objects. Each object has: sub_claim_text (string), classification (string - one of True, False, Partially True, Misleading, Unverifiable, Requires More Evidence), confidence_score (integer, copied exactly from score_confidence), reasoning (string, one to two sentences explaining which rule applied).",
      "agent": "final_decision_maker",
      "context": ["decompose_claim_into_subclaims", "detect_contradictions", "cross_verify_independently", "score_confidence"]
    },
    {
      "name": "write_full_report",
      "description": "Take ALL upstream outputs: the original cleaned_claim, sub_claims, evidence, scores, contradictions, verdicts, risk_assessments, confidence_scores, and final_verdicts. Draft a complete structured report in this exact section order, using proper markdown tables (pipe syntax) wherever a table is specified: (1) REPORT HEADER as a small table with fields: Report ID (generate as CRDF- followed by 2026, which is the actual current year, then a random 6-digit number - never use any other year), Submission Date (use a placeholder note that this reflects generation time), Claim Category (infer a short category from the claim, e.g. Consumer Technology, Historical Fact, Public Health), Evidence Submitted (count of sources actually collected). (2) A prominent FINAL VERDICT and CONFIDENCE SCORE line near the top, pulled exactly from final_verdicts and confidence_scores, unchanged. (3) Executive Summary, 2-4 sentences. (4) Claim Decomposition as a markdown table with columns: #, Sub-Claim, Type. (5) Evidence Summary, with one sub-section per sub-claim, each containing a markdown table with columns: Stance (Supporting/Opposing), Evidence, Source. (6) Source Credibility Analysis as a markdown table with columns: Source, Credibility Score, Justification. (7) Contradiction and Consistency Findings as a markdown table with columns: Conflict, Conflicting Items, Severity (map contradiction_type to a severity word: full_contradiction=High, partial_contradiction=Medium, temporal_difference or none=Low/None). (8) Evidence Timeline: ONLY include this section if source publication dates are actually present in the upstream evidence; if no dates were collected, write exactly: \"Publication dates were not tracked during evidence collection for this run.\" Do not invent dates. (9) Chain-of-Evidence Validation: one short paragraph in the style \"Verdict -> driven primarily by [sub-claim] -> grounded in [actual source names] -> corroborated by [actual cross-verification result]\", using only real upstream findings. (10) Risk and Severity Assessment, prose summarizing severity and domains. (11) Legal and Policy Considerations: a brief, generic disclaimer paragraph noting that misleading claims may carry consumer-protection or advertising-standards implications depending on jurisdiction, and that this is informational only, not legal advice - this section does not need upstream traceability since it is a standard disclaimer, not a factual claim. (12) Confidence Score Breakdown as a markdown table with columns: Factor, Points, out of a maximum, using ONLY the three real components actually computed (source credibility, absence of contradictions, cross-verification agreement) with their real numeric values from confidence_scores - do not invent additional factors beyond these three. (13) Final Verdict, prose explaining the classification and reasoning. (14) References, listing every source URL actually collected, as plain text only, one per line, with no markdown link syntax or brackets. CRITICAL RULE: every fact, number, source, or claim in this report must be directly traceable to a specific upstream finding. Never invent dates, extra confidence factors, sources, or details beyond what upstream agents actually produced. If any upstream list is empty, state that plainly rather than inventing content.",
      "expected_output": "A JSON object with a field report, a string containing the full report with markdown ## section headers and properly formatted markdown pipe tables where specified, following the exact section order given.",
      "agent": "report_writer",
      "context": ["take_the_raw_user_task", "decompose_claim_into_subclaims", "collect_evidence_for_subclaims", "score_source_credibility", "detect_contradictions", "cross_verify_independently", "assess_risk_and_severity", "score_confidence", "make_final_decision"]
    },
    {
      "name": "verify_report_quality",
      "description": "Take the report string from the previous step, along with all upstream outputs it was built from (sub_claims, evidence, scores, contradictions, verdicts, risk_assessments, confidence_scores, final_verdicts). Read the report sentence by sentence. For each sentence making a factual claim, number, source, or finding, check whether it is directly traceable to something an upstream agent actually produced. Flag any sentence that appears to be invented, unsupported, or exaggerated beyond what the upstream data shows. If you find issues, list them specifically with the exact problematic sentence and what upstream data it fails to match. If the report passes with no untraceable sentences, approve it as-is. You may suggest at most 2 rounds of revision notes total across this verification - if issues remain after that, approve the report anyway and note the remaining concerns rather than looping indefinitely.",
      "expected_output": "A JSON object with fields: approved (boolean), issues_found (array of strings, each describing one specific untraceable sentence and why, empty array if none), final_report (string, the original report if approved with no issues, or the report with any invented content removed if issues were found).",
      "agent": "quality_verifier",
      "context": ["write_full_report", "decompose_claim_into_subclaims", "collect_evidence_for_subclaims", "score_source_credibility", "detect_contradictions", "cross_verify_independently", "assess_risk_and_severity", "score_confidence", "make_final_decision"]
    }
  ],
  "process": "sequential",
  "verbose": true,
  "memory": false,
  "output_log_file": "crew.log",
  "inputs": {}
}

'@ | Set-Content -Path crew.jsonc -Encoding UTF8