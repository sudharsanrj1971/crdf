"""
test_multimodal.py

Standalone script to properly test CRDF's multimodal agents (Document OCR
and Image Authenticity) with a REAL file attached, bypassing the JSON-crew
CLI's text-only placeholder limitation.

Usage:
    python test_multimodal.py "C:\path\to\your\file.pdf" "Your claim text here"
"""

import sys
import os
from dotenv import load_dotenv
from crewai import Agent, Task, Crew, Process

load_dotenv()

if len(sys.argv) < 3:
    print("Usage: python test_multimodal.py <file_path> <claim_text>")
    sys.exit(1)

file_path = sys.argv[1]
claim_text = sys.argv[2]

if not os.path.exists(file_path):
    print(f"ERROR: File not found at: {file_path}")
    sys.exit(1)

print(f"Loading file: {file_path}")
print(f"Testing claim: {claim_text}\n")

document_ocr_agent = Agent(
    role="Document and OCR Analyst",
    goal="Extract literal text from uploaded images, screenshots, or documents exactly as written, including tables, headings, and dates, without cleaning up or paraphrasing the original wording",
    backstory="A meticulous transcriber who never improves, summarizes, or corrects the source text - their only job is faithful literal extraction, marking anything unreadable rather than guessing at it",
    llm="gemini/gemini-3.1-flash-lite",
    multimodal=True,
    verbose=True,
)

ocr_task = Task(
    description="Extract all literal text from the attached image/document exactly as written, including any tables, headings, and dates, without cleaning up grammar, paraphrasing, or correcting anything. Mark any section that is genuinely unreadable as [illegible] rather than guessing at its content.",
    expected_output="A JSON object with fields: has_document (boolean, true since a real file is attached), extracted_text (string, the literal transcribed text), unreadable_sections (array of strings describing any [illegible] markers used).",
    agent=document_ocr_agent,
    images=[file_path],
)

image_authenticity_agent = Agent(
    role="Image and Visual Authenticity Analyst",
    goal="Check uploaded images for signs of manipulation such as lighting inconsistencies or compositing artifacts, and separately assess whether the image's actual content matches the claim it is attached to, keeping these two findings distinct from each other",
    backstory="A forensic image analyst who insists on separating two very different questions that people often confuse: whether an image has been technically altered, and whether an unaltered image is being used to falsely support a claim it has nothing to do with",
    llm="gemini/gemini-3.1-flash-lite",
    multimodal=True,
    verbose=True,
)

authenticity_task = Task(
    description=f"Examine the attached image for technical signs of editing such as lighting inconsistencies, cloning artifacts, or compositing seams, and state whether it appears manipulated. Separately, independently assess whether what the image actually shows matches this claim: {claim_text}. Keep these two findings distinct - an unedited real photo can still be irrelevant to a claim, and a manipulated image could coincidentally still relate to the claim.",
    expected_output="A JSON object with fields: has_image (boolean, true since a real file is attached), manipulation_check (object with: appears_manipulated (boolean), reasoning (string)), content_match_check (object with: matches_claim (boolean or 'undetermined'), reasoning (string)).",
    agent=image_authenticity_agent,
    images=[file_path],
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