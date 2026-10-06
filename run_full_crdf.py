"""
CRDF end-to-end workflow - fully automated, single command.

Runs, in order:
  1. The three multimodal checks (image, video, document) via native
     CrewAI Python API, with retry/consensus logic for reliability.
  2. The existing 15-agent JSON text pipeline (crew.jsonc) via CrewAI's
     direct Python API (load_crew + crew.kickoff(inputs=...)), bypassing
     the interactive CLI prompts entirely.
  3. Merges both into one final combined_result.json and prints the
     final report.

Usage:
    python run_full_crdf.py --claim "..." --image path.png --video none --document none --session-id none

If step 2's direct Python API call fails (e.g. load_crew()'s signature
differs in your installed CrewAI version), this script prints the exact
error and falls back to printing manual `crewai run` instructions with the
multimodal summary folded in, same as before - so you are never left
without a way to finish the run.
"""

import patch_llm_retry
import argparse
import json
import sys
from pathlib import Path

from multimodal_image_check import run_image_check
from multimodal_video_check import run_video_check
from multimodal_document_check import run_document_check

from dotenv import load_dotenv
load_dotenv()


def build_multimodal_summary(image_result: dict, video_result: dict, document_result: dict) -> str:
    """Build a short plain-English summary to fold into the claim context
    for the text pipeline, so agents like final_decision_maker and
    report_writer can factor in multimodal findings."""
    lines = []

    if image_result.get("has_image"):
        mc = image_result.get("manipulation_check", {})
        cc = image_result.get("content_match_check", {})
        lines.append(
            f"[Attached image analysis] appears_manipulated="
            f"{mc.get('appears_manipulated')}: {mc.get('reasoning', '')} "
            f"| matches_claim={cc.get('matches_claim')}: {cc.get('reasoning', '')}"
        )

    if video_result.get("has_video"):
        mc = video_result.get("manipulation_check", {})
        cc = video_result.get("content_match_check", {})
        lines.append(
            f"[Attached video analysis] appears_manipulated="
            f"{mc.get('appears_manipulated')}: {mc.get('reasoning', '')} "
            f"| matches_claim={cc.get('matches_claim')}: {cc.get('reasoning', '')}"
        )

    if document_result.get("has_document") and document_result.get("has_text_content"):
        lines.append(
            f"[Attached document text] {document_result.get('extracted_text', '')}"
        )

    return "\n".join(lines)


def _parse_task_output(raw: str) -> tuple[dict | None, str]:
    """Strip markdown fences and parse JSON from a task output string.
    Returns (parsed_dict_or_None, cleaned_str)."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        cleaned = parts[1] if len(parts) >= 2 else cleaned[3:]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    try:
        return json.loads(cleaned), cleaned
    except Exception:
        return None, cleaned


def run_intake_only(
    claim: str,
    session_id: str,
    multimodal_summary_text: str = "",
) -> tuple[dict | None, str | None]:
    """Run ONLY the claim_intake_specialist task as a standalone mini-crew.

    Returns (intake_result_dict, error_message).  If intake succeeds,
    intake_result_dict will contain at minimum 'ready_for_processing' (bool)
    and 'status' (str).  Returns (None, error_message) on failure.
    """
    from crewai import Agent, Task, Crew

    claim_with_context = claim
    if multimodal_summary_text:
        claim_with_context = f"Claim: {claim}\n\nMultimodal Context:\n{multimodal_summary_text}"

    intake_agent = Agent(
        role="Claim Intake Specialist",
        goal=(
            "Clean and validate raw user claims, rejecting non-checkable input "
            "and asking clarifying questions when a claim is ambiguous, so only "
            "claims marked ready_for_processing are passed downstream"
        ),
        backstory=(
            "An experienced fact-checking intake editor who has reviewed thousands "
            "of user submissions and knows the difference between a genuine "
            "checkable claim, a vague question, and an opinion disguised as fact"
        ),
        llm="gemini/gemini-3.1-flash-lite",
        verbose=False,
        allow_delegation=False,
    )

    intake_task = Task(
        description=(
            f"Take the raw user input: {claim_with_context}, which may contain a "
            f"'Claim:' section and a 'Multimodal Context:' section. Clean up any "
            f"grammar or informal language in the 'Claim:' portion without changing "
            f"its meaning. Preserve the 'Multimodal Context:' portion exactly as-is "
            f"at the end of the string. Determine if the Claim portion is a genuine "
            f"checkable factual claim, as opposed to a question, greeting, empty "
            f"input, or pure opinion/prediction. If the claim is ambiguous (missing a "
            f"critical name, date, or location needed to verify it), do not guess — "
            f"instead ask exactly one clarifying question. If the input is not a "
            f"checkable claim at all, reject it and explain why in one sentence. "
            f"Output the combined text as the cleaned claim text along with a boolean "
            f"field ready_for_processing that is true only when the claim is clear "
            f"enough to move to decomposition."
        ),
        expected_output=(
            "A JSON object with exactly these fields: cleaned_claim (string), "
            "ready_for_processing (boolean), and status (string — one of ready, "
            "needs_clarification, or rejected)."
        ),
        agent=intake_agent,
    )

    mini_crew = Crew(agents=[intake_agent], tasks=[intake_task], verbose=False)
    try:
        result = mini_crew.kickoff()
    except Exception as e:
        return None, f"Intake mini-crew kickoff failed: {e}"

    raw = str(getattr(result, "raw", result))
    parsed, _ = _parse_task_output(raw)
    if parsed is None:
        return None, f"Intake output could not be parsed as JSON: {raw[:200]}"
    return parsed, None


def run_text_pipeline_direct(
    claim: str, 
    session_id: str, 
    multimodal_summary_text: str = "",
    image_file: str = "none",
    video_file: str = "none",
    document_file: str = "none"
) -> tuple[str | None, dict | None, str | None]:
    """Load and run crew.jsonc directly via CrewAI's Python API, bypassing
    the interactive CLI.

    PHASE 1: Run claim_intake_specialist as a standalone mini-crew.
    If ready_for_processing is False, return immediately — the full crew
    is NEVER started.  This is a genuine pre-kickoff halt, not a
    post-hoc response filter.

    PHASE 2 (only if intake passes): Run the full 15-agent crew.

    Returns (final_report_text, raw_pipeline_data, error_message).
    Exactly one of final_report_text or error_message will be non-None."""
    try:
        from crewai.project.crew_loader import load_crew
    except ImportError as e:
        return None, None, f"Could not import load_crew from this CrewAI version: {e}"

    crew_path = Path("crew.jsonc")
    if not crew_path.is_file():
        return None, None, f"crew.jsonc not found at {crew_path.resolve()}"

    # Inject multimodal context into the claim
    claim_with_context = claim
    if multimodal_summary_text:
        claim_with_context = f"Claim: {claim}\n\nMultimodal Context:\n{multimodal_summary_text}"

    inputs = {
        "claim": claim_with_context,
        "document_file": document_file,
        "image_file": image_file,
        "video_file": video_file,
        "session_id": session_id,
    }

    # ── PHASE 1: Intake-only mini-crew ──────────────────────────────────
    # Run ONLY the intake agent first. If the claim is ambiguous or
    # rejected, return immediately without ever starting the full crew.
    print("[run_full_crdf] Phase 1: running intake mini-crew...", file=sys.stderr)
    intake_data, intake_err = run_intake_only(claim, session_id, multimodal_summary_text)

    if intake_err is not None:
        # Intake itself failed — fall through to full crew as a safety net
        # so we don't silently eat claims when the mini-crew has an issue.
        print(f"[run_full_crdf] Intake mini-crew error (falling through): {intake_err}", file=sys.stderr)
        intake_data = None

    if isinstance(intake_data, dict):
        ready = intake_data.get("ready_for_processing")
        status = intake_data.get("status", "")
        if ready is False or status in ("needs_clarification", "rejected"):
            question = (
                intake_data.get("clarification_question")
                or intake_data.get("clarifying_question")
                or intake_data.get("reasoning")
                or "Please specify missing details (such as names, dates, or locations)."
            )
            clarification_report = (
                "## CLAIM REQUIRES CLARIFICATION\n\n"
                "**The submitted claim is ambiguous or underspecified and cannot be evaluated by the fact-checking pipeline.**\n\n"
                f"> **Clarification Required:** {question}\n\n"
                "Please resubmit your claim with additional specific details (such as names, dates, or locations)."
            )
            filtered_raw_data = {"take_the_raw_user_task": intake_data}
            print("[run_full_crdf] Intake returned not-ready. Full crew NOT started.", file=sys.stderr)
            return clarification_report, filtered_raw_data, None

    # ── PHASE 2: Full crew (only reached if intake passed) ───────────────
    print("[run_full_crdf] Phase 2: intake passed, starting full crew...", file=sys.stderr)
    try:
        from crewai.project.crew_loader import load_crew
    except ImportError as e:
        return None, None, f"Could not import load_crew from this CrewAI version: {e}"

    crew_path = Path("crew.jsonc")
    if not crew_path.is_file():
        return None, None, f"crew.jsonc not found at {crew_path.resolve()}"

    # Inject multimodal context into the claim for the full crew
    claim_with_context = claim
    if multimodal_summary_text:
        claim_with_context = f"Claim: {claim}\n\nMultimodal Context:\n{multimodal_summary_text}"

    inputs = {
        "claim": claim_with_context,
        "document_file": document_file,
        "image_file": image_file,
        "video_file": video_file,
        "session_id": session_id,
    }

    try:
        loaded = load_crew(crew_path)
    except Exception as e:
        return None, None, f"load_crew() failed: {e}"

    if isinstance(loaded, tuple):
        crew_obj = loaded[0]
        default_inputs = loaded[1] if len(loaded) > 1 else None
        if isinstance(default_inputs, dict):
            merged = dict(default_inputs)
            merged.update(inputs)
            inputs = merged
    else:
        crew_obj = loaded

    try:
        result = crew_obj.kickoff(inputs=inputs)
    except Exception as e:
        return None, None, f"crew.kickoff() failed: {e}"

    # Extract raw pipeline data for all tasks
    raw_pipeline_data = {}
    if isinstance(intake_data, dict):
        # Seed with the intake result we already have from Phase 1
        raw_pipeline_data["take_the_raw_user_task"] = intake_data

    for idx, task_output in enumerate(getattr(result, "tasks_output", [])):
        t_name = getattr(task_output, "name", None) or f"task_{idx}"
        t_raw = getattr(task_output, "raw", "") or ""
        t_parsed, _ = _parse_task_output(t_raw)
        raw_pipeline_data[t_name] = t_parsed if t_parsed is not None else t_raw

    # Don't trust str(result) - it returns whichever task ran LAST in
    # sequence, not necessarily the actual final report. Explicitly find
    # the verify_report_quality task's output and pull its final_report
    # field, since that's the real deliverable.
    report_task_output = None
    for task_output in getattr(result, "tasks_output", []):
        task_name = getattr(task_output, "name", None) or ""
        task_desc = getattr(task_output, "description", None) or ""
        if "verify_report_quality" in task_name or "verify_report_quality" in task_desc:
            report_task_output = task_output
            break

    if report_task_output is None:
        for task_output in getattr(result, "tasks_output", []):
            if "final_report" in (getattr(task_output, "raw", "") or ""):
                report_task_output = task_output
                break

    if report_task_output is None:
        return None, raw_pipeline_data, "Could not locate verify_report_quality task output in crew result."

    raw = report_task_output.raw

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 2:
            cleaned = parts[1]
        else:
            cleaned = cleaned[3:]  # Strip leading ``` and use as-is
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        final_report = parsed.get("final_report")
        if final_report:
            return final_report, raw_pipeline_data, None
    except (json.JSONDecodeError, AttributeError):
        pass

    return raw, raw_pipeline_data, None


def print_manual_fallback_instructions(claim: str, session_id: str, multimodal_summary_text: str, error: str) -> None:
    print(f"\nAutomatic text-pipeline run failed: {error}", file=sys.stderr)
    print("Falling back to manual instructions.\n", file=sys.stderr)
    print("=== Text pipeline (run manually) ===", file=sys.stderr)
    print("Run:  crewai run", file=sys.stderr)
    print("\nAt the prompts, use:", file=sys.stderr)
    print(f"    claim > {claim}", file=sys.stderr)
    print("    document_file > none", file=sys.stderr)
    print("    image_file > none", file=sys.stderr)
    print("    video_file > none", file=sys.stderr)
    print(f"    session_id > {session_id}", file=sys.stderr)
    if multimodal_summary_text:
        print(
            "\nMultimodal findings to incorporate into your report:\n"
            + multimodal_summary_text,
            file=sys.stderr,
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--claim", required=True)
    parser.add_argument("--image", default="none")
    parser.add_argument("--video", default="none")
    parser.add_argument("--document", default="none")
    parser.add_argument("--session-id", default="none")
    args = parser.parse_args()

    print("=== Step 1: Running multimodal checks ===", file=sys.stderr)
    image_result = run_image_check(args.claim, args.image)
    video_result = run_video_check(args.claim, args.video)
    document_result = run_document_check(args.document)

    multimodal_summary_text = build_multimodal_summary(
        image_result, video_result, document_result
    )

    print("\n=== Step 2: Running text pipeline (automated) ===", file=sys.stderr)
    report_text, raw_pipeline_data, error = run_text_pipeline_direct(
        args.claim, 
        args.session_id, 
        multimodal_summary_text,
        args.image,
        args.video,
        args.document
    )

    combined = {
        "claim": args.claim,
        "multimodal_results": {
            "image_analysis": image_result,
            "video_analysis": video_result,
            "document_analysis": document_result,
        },
        "multimodal_summary_text": multimodal_summary_text,
        "text_pipeline_report": report_text,
        "raw_pipeline_data": raw_pipeline_data,
        "text_pipeline_error": error,
    }

    with open("combined_result.json", "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2)

    if error is not None:
        print_manual_fallback_instructions(
            args.claim, args.session_id, multimodal_summary_text, error
        )
    else:
        print("\n=== Text pipeline completed automatically ===", file=sys.stderr)

    print(f"\nCombined result written to combined_result.json", file=sys.stderr)
    print(json.dumps(combined, indent=2))


if __name__ == "__main__":
    main()
