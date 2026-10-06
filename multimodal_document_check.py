"""
Standalone document/image OCR extractor for CRDF.
Mirrors multimodal_image_check.py but for document_ocr_agent.

Usage:
    python multimodal_document_check.py --document path/to/file.png
"""

import argparse
import json
from pathlib import Path

from crewai import Agent, Task, Crew


def build_ocr_agent() -> Agent:
    return Agent(
        role="Document and OCR Analyst",
        goal=(
            "Extract all literal text from an uploaded image, screenshot, "
            "or document exactly as written, without cleaning up grammar, "
            "paraphrasing, or correcting anything"
        ),
        backstory=(
            "A meticulous transcriptionist who never guesses at unreadable "
            "content and marks it clearly instead"
        ),
        llm="gemini/gemini-3.1-flash-lite",
        multimodal=True,
        verbose=False,
        allow_delegation=False,
    )


def build_ocr_task(agent: Agent, document_path: str) -> Task:
    return Task(
        description=(
            f"Extract all literal text from the attached document/image "
            f"exactly as written, including any tables, headings, and "
            f"dates, without cleaning up grammar, paraphrasing, or "
            f"correcting anything. Mark any section that is genuinely "
            f"unreadable as [illegible] rather than guessing at its "
            f"content.\n\n"
            f"CRITICAL - DO NOT HALLUCINATE: If the image contains no "
            f"readable text at all (e.g. it is a photo, illustration, "
            f"abstract graphic, or blank), you MUST set has_text_content "
            f"to false and extracted_text to an empty string. NEVER "
            f"invent example text, sample documents, invoices, or any "
            f"content that is not literally visible in the image. "
            f"Fabricating text is a critical failure - if in doubt, report "
            f"less text rather than more.\n\n"
            f"Document file path: {document_path}"
        ),
        expected_output=(
            "A JSON object with fields: has_document (boolean, true), "
            "has_text_content (boolean, true only if actual readable text "
            "was found in the image), extracted_text (string, the literal "
            "transcribed text, or empty string if has_text_content is "
            "false), unreadable_sections (array of strings describing any "
            "[illegible] markers used, empty array if none)."
        ),
        agent=agent,
        multimodal=True,
    )


def _normalize_text(text: str) -> str:
    """Lowercase and collapse whitespace for fuzzy comparison."""
    return " ".join(text.lower().split())


def _text_similarity(a: str, b: str) -> float:
    """Simple word-overlap similarity ratio between two strings (0.0-1.0)."""
    a_words = set(_normalize_text(a).split())
    b_words = set(_normalize_text(b).split())
    if not a_words and not b_words:
        return 1.0
    if not a_words or not b_words:
        return 0.0
    overlap = len(a_words & b_words)
    union = len(a_words | b_words)
    return overlap / union if union else 0.0


def _single_ocr_attempt(document_path: str) -> tuple[dict, bool]:
    """Run one OCR attempt. Returns (parsed_result, is_trustworthy_format).
    is_trustworthy_format is False if the response was a failure signal or
    unparseable, meaning this attempt should not be used for consensus."""
    FAILURE_SIGNALS = [
        "please provide", "please upload", "i don't see", "i do not see",
        "no image", "no document", "unable to view", "cannot view",
        "can't see", "no file",
    ]

    agent = build_ocr_agent()
    task = build_ocr_task(agent, document_path)
    crew = Crew(agents=[agent], tasks=[task], verbose=False)
    result = crew.kickoff()
    raw = str(result)

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    cleaned = cleaned.strip()

    lowered = cleaned.lower()
    if any(sig in lowered for sig in FAILURE_SIGNALS):
        return {}, False

    try:
        parsed = json.loads(cleaned)
        return parsed, True
    except json.JSONDecodeError:
        return {}, False


def run_document_check(document_path: str | None) -> dict:
    if not document_path or document_path.strip().lower() == "none":
        return {
            "has_document": False,
            "has_text_content": False,
            "extracted_text": "",
            "unreadable_sections": [],
        }

    resolved = Path(document_path).expanduser().resolve()
    if not resolved.is_file():
        return {
            "has_document": False,
            "has_text_content": False,
            "extracted_text": "",
            "unreadable_sections": [f"File not found at {resolved}"],
        }

    # Consensus check: run OCR twice independently. Real extracted text
    # should closely match across calls; hallucinated content is different
    # each time (since it's fabricated fresh, not read from the image), so
    # a low similarity score is a strong hallucination signal.
    SIMILARITY_THRESHOLD = 0.6
    max_rounds = 2  # up to 2 rounds of (2 calls each) = 4 calls total

    for round_num in range(1, max_rounds + 1):
        attempt_a, ok_a = _single_ocr_attempt(str(resolved))
        attempt_b, ok_b = _single_ocr_attempt(str(resolved))

        if not ok_a or not ok_b:
            continue  # at least one attempt failed to attach/parse - retry round

        text_a = attempt_a.get("extracted_text", "")
        text_b = attempt_b.get("extracted_text", "")
        has_text_a = attempt_a.get("has_text_content", bool(text_a.strip()))
        has_text_b = attempt_b.get("has_text_content", bool(text_b.strip()))

        # Both agree no text content - trust it, that's a consistent negative.
        if not has_text_a and not has_text_b:
            return {
                "has_document": True,
                "has_text_content": False,
                "extracted_text": "",
                "unreadable_sections": [],
                "_consensus": "both_agree_no_text",
            }

        # Both claim text content - check if the actual text agrees.
        if has_text_a and has_text_b:
            similarity = _text_similarity(text_a, text_b)
            if similarity >= SIMILARITY_THRESHOLD:
                # Agreement - trust attempt_a's version (or could merge)
                result = dict(attempt_a)
                result["_consensus"] = f"agreed_similarity_{similarity:.2f}"
                return result
            else:
                # Disagreement between two independent reads = likely
                # hallucination on at least one side. Do not trust either.
                continue  # try another round

        # One says text, one says no text - inconsistent, retry.
        continue

    # Consensus never reached after all rounds - do not trust any extracted
    # text, since we cannot tell real content from hallucination.
    return {
        "has_document": True,
        "has_text_content": False,
        "extracted_text": "",
        "unreadable_sections": [
            "OCR consensus could not be reached across independent attempts "
            "- treating as no reliably-verified text content to avoid "
            "reporting possibly hallucinated text."
        ],
        "_consensus": "failed_no_agreement",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--document", required=True)
    args = parser.parse_args()

    output = run_document_check(args.document)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
