"""
Standalone multimodal video authenticity checker for CRDF.
Mirrors multimodal_image_check.py but for video files.

Usage:
    python multimodal_video_check.py --claim "some claim text" --video path/to/video.mp4
"""

import argparse
import json
from pathlib import Path

from crewai import Agent, Task, Crew


def build_video_agent() -> Agent:
    return Agent(
        role="Video and Multimedia Analyst",
        goal=(
            "Extract visual and audio content from a video across its full "
            "duration, check for signs of editing or manipulation, and "
            "separately assess whether the video's actual content matches "
            "the claim it is attached to, keeping these findings distinct"
        ),
        backstory=(
            "A meticulous video forensics analyst who applies the same "
            "discipline as image analysis but across time - a video can be "
            "technically unedited yet still misused for an unrelated claim, "
            "or edited in ways that do not actually change whether it "
            "supports the claim, and both distinctions matter"
        ),
        llm="gemini/gemini-3.5-flash-lite",
        multimodal=True,
        verbose=False,
        allow_delegation=False,
    )


def build_video_task(agent: Agent, claim: str, video_path: str) -> Task:
    return Task(
        description=(
            f"Perform two SEPARATE checks on the attached video and never "
            f"conflate them.\n\n"
            f"Check 1 - Manipulation: examine the video for signs of "
            f"editing, such as unnatural cuts, audio-visual desync, or "
            f"deepfake artifacts, and state whether it appears "
            f"manipulated.\n\n"
            f"Check 2 - Content Match: independently assess whether what "
            f"the video actually shows and says matches this claim: "
            f"\"{claim}\", regardless of whether it is manipulated.\n\n"
            f"You MUST actually watch/analyze the attached video content to "
            f"answer both checks with specific details you observe - do "
            f"not answer generically.\n\n"
            f"Video file path to analyze: {video_path}"
        ),
        expected_output=(
            "A JSON object with fields: has_video (boolean, true since a "
            "video is attached), manipulation_check (object with: "
            "appears_manipulated (boolean), reasoning (string, must "
            "reference specific details you observed)), "
            "content_match_check (object with: matches_claim (boolean or "
            "'undetermined'), reasoning (string))."
        ),
        agent=agent,
        multimodal=True,
    )


def run_video_check(claim: str, video_path: str | None) -> dict:
    if not video_path or video_path.strip().lower() == "none":
        return {
            "has_video": False,
            "manipulation_check": {"appears_manipulated": False, "reasoning": ""},
            "content_match_check": {"matches_claim": "undetermined", "reasoning": ""},
        }

    resolved = Path(video_path).expanduser().resolve()
    if not resolved.is_file():
        return {
            "has_video": False,
            "manipulation_check": {
                "appears_manipulated": False,
                "reasoning": f"File not found at {resolved}",
            },
            "content_match_check": {"matches_claim": "undetermined", "reasoning": ""},
        }

    FAILURE_SIGNALS = [
        "please provide", "please upload", "i don't see", "i do not see",
        "no video", "unable to view", "cannot view", "can't see", "no file",
    ]

    max_attempts = 3
    last_raw = ""
    for attempt in range(1, max_attempts + 1):
        agent = build_video_agent()
        task = build_video_task(agent, claim, str(resolved))

        crew = Crew(agents=[agent], tasks=[task], verbose=False)
        result = crew.kickoff()
        raw = str(result)
        last_raw = raw

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        cleaned = cleaned.strip()

        lowered = cleaned.lower()
        if any(sig in lowered for sig in FAILURE_SIGNALS):
            continue

        try:
            parsed = json.loads(cleaned)
            if parsed.get("has_video") is True:
                return parsed
            continue
        except json.JSONDecodeError:
            continue

    return {
        "has_video": True,
        "manipulation_check": {"appears_manipulated": False, "reasoning": ""},
        "content_match_check": {"matches_claim": "undetermined", "reasoning": ""},
        "_raw_output": last_raw,
        "_parse_error": True,
        "_attempts_exhausted": max_attempts,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--claim", required=True)
    parser.add_argument("--video", default=None)
    args = parser.parse_args()

    output = run_video_check(args.claim, args.video)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
