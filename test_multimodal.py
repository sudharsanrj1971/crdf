r"""
test_multimodal.py

Standalone script to properly test CRDF's multimodal agents (Document OCR
and Image Authenticity) with a REAL file attached, bypassing the JSON-crew
CLI's text-only placeholder limitation.

Usage:
    python test_multimodal.py "C:\path\to\your\file.pdf" "Your claim text here"
"""

import patch_llm_retry
import sys
import os
from pathlib import Path
from dotenv import load_dotenv
from crewai import Agent, Task, Crew, Process

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv()

if len(sys.argv) < 3:
    print("Usage: python test_multimodal.py <file_path> <claim_text>")
    sys.exit(1)

file_path = sys.argv[1]
claim_text = sys.argv[2]

resolved = Path(file_path).expanduser().resolve()
if not resolved.is_file():
    print(f"ERROR: File not found at: {resolved}")
    sys.exit(1)

print(f"Loading file: {resolved}")
print(f"Testing claim: {claim_text}\n")

import base64
import litellm
from crewai.tools import tool

@tool("inspect_visual_media")
def inspect_visual_media(file_path: str) -> str:
    """Inspect the visual content or extract text from a local image/document file."""
    p = Path(file_path).expanduser().resolve()
    if not p.is_file():
        return f"File not found: {p}"
    try:
        b64 = base64.b64encode(open(p, "rb").read()).decode("utf-8")
        ext = p.suffix.lower()
        mime = "image/png" if ext == ".png" else ("image/jpeg" if ext in (".jpg", ".jpeg") else "application/octet-stream")
        data_uri = f"data:{mime};base64,{b64}"
        res = litellm.completion(
            model="gemini/gemini-3.1-flash-lite",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract all literal text exactly as written, and provide a detailed visual description of the image content, lighting, and signs of manipulation."},
                    {"type": "image_url", "image_url": {"url": data_uri}}
                ]
            }],
            timeout=30
        )
        return res.choices[0].message.content.strip()
    except Exception as e:
        return f"Error reading image: {e}"

document_ocr_agent = Agent(
    role="Document and OCR Analyst",
    goal="Extract literal text from uploaded images, screenshots, or documents exactly as written, including tables, headings, and dates, without cleaning up or paraphrasing the original wording",
    backstory="A meticulous transcriber who never improves, summarizes, or corrects the source text - their only job is faithful literal extraction, marking anything unreadable rather than guessing at it",
    llm="gemini/gemini-3.1-flash-lite",
    tools=[inspect_visual_media],
    verbose=False,
    allow_delegation=False,
)

ocr_task = Task(
    description=(
        f"Use inspect_visual_media to inspect the document at: {resolved}.\n"
        f"Extract all literal text from it exactly as written, including any tables, headings, and dates. "
        f"Mark any section that is genuinely unreadable as [illegible] rather than guessing at its content."
    ),
    expected_output="A JSON object with fields: has_document (boolean, true since a real file is attached), extracted_text (string, the literal transcribed text), unreadable_sections (array of strings describing any [illegible] markers used).",
    agent=document_ocr_agent,
)

image_authenticity_agent = Agent(
    role="Image and Visual Authenticity Analyst",
    goal="Check uploaded images for signs of manipulation such as lighting inconsistencies or compositing artifacts, and separately assess whether the image's actual content matches the claim it is attached to, keeping these two findings distinct from each other",
    backstory="A forensic image analyst who insists on separating two very different questions that people often confuse: whether an image has been technically altered, and whether an unaltered image is being used to falsely support a claim it has nothing to do with",
    llm="gemini/gemini-3.1-flash-lite",
    tools=[inspect_visual_media],
    verbose=False,
    allow_delegation=False,
)

authenticity_task = Task(
    description=(
        f"Use inspect_visual_media to inspect the image at: {resolved}.\n"
        f"Perform two checks: (1) Manipulation: examine for signs of editing and state whether it appears manipulated. "
        f"(2) Content Match: independently assess whether what the image actually shows matches this claim: {claim_text}."
    ),
    expected_output="A JSON object with fields: has_image (boolean, true since a real file is attached), manipulation_check (object with: appears_manipulated (boolean), reasoning (string)), content_match_check (object with: matches_claim (boolean or 'undetermined'), reasoning (string)).",
    agent=image_authenticity_agent,
)

crew = Crew(
    agents=[document_ocr_agent, image_authenticity_agent],
    tasks=[ocr_task, authenticity_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff()

print("\n\n========== FINAL RESULT ==========")
print(result)