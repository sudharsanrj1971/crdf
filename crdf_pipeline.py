"""
CRDF pipeline runner.

  1. Multimodal checks (image / video / document) are run directly against Gemini, using the
     role, goal, backstory, task description and expected output defined in agents/*.jsonc and crew.jsonc.
  2. The findings are folded into the claim as a "Multimodal Context:" section (the intake task is
     written to expect exactly that).
  3. The text pipeline (every remaining task in crew.jsonc) is built as a CrewAI crew and run.
  4. Everything is returned in the shape the frontend's AnalyzeResponse expects.

crew.jsonc stays the single source of truth for agents and tasks.
"""
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

BASE_DIR = Path(__file__).resolve().parent
log = logging.getLogger("crdf.pipeline")

# crew.jsonc tasks that are handled by run_multimodal_check instead of the CrewAI crew
MULTIMODAL_TASKS = {
    "extract_document_text": "document",
    "check_image_authenticity": "image",
    "check_video_authenticity": "video",
}
REPORT_TASK = "write_full_report"
INTAKE_TASK = "take_the_raw_user_task"


# --------------------------------------------------------------------------- definition loading
def strip_jsonc(text: str) -> str:
    """Remove // and /* */ comments (outside strings) and trailing commas from JSONC text."""
    out, i, n, in_str, esc = [], 0, len(text), False, False
    while i < n:
        ch = text[i]
        if in_str:
            out.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            i += 1
            continue
        if ch == '"':
            in_str = True
            out.append(ch)
        elif text.startswith("//", i):
            while i < n and text[i] != "\n":
                i += 1
            continue
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j == -1 else j + 2
            continue
        else:
            out.append(ch)
        i += 1
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))


def load_jsonc(path: Path) -> dict:
    return json.loads(strip_jsonc(path.read_text(encoding="utf-8")))


def load_definition(base_dir: Path = BASE_DIR):
    crew_def = load_jsonc(base_dir / "crew.jsonc")
    agents_def = {name: load_jsonc(base_dir / "agents" / f"{name}.jsonc") for name in crew_def["agents"]}
    return crew_def, agents_def


# --------------------------------------------------------------------------- helpers
def parse_json_loose(text: Any) -> Any:
    """Parse JSON that may be wrapped in ``` fences or surrounded by prose. Returns None on failure."""
    if isinstance(text, (dict, list)):
        return text
    if not isinstance(text, str):
        return None
    s = text.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.I)
    try:
        return json.loads(s)
    except Exception:
        pass
    m = re.search(r"\{.*\}", s, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None


def fill_placeholders(text: str, values: Dict[str, str]) -> str:
    for k, v in values.items():
        text = text.replace("{" + k + "}", v)
    return text


def default_multimodal_results() -> Dict[str, Any]:
    undetermined = {"matches_claim": "undetermined", "reasoning": ""}
    no_manip = {"appears_manipulated": False, "reasoning": ""}
    return {
        "image_analysis": {"has_image": False, "manipulation_check": dict(no_manip), "content_match_check": dict(undetermined)},
        "video_analysis": {"has_video": False, "manipulation_check": dict(no_manip), "content_match_check": dict(undetermined)},
        "document_analysis": {"has_document": False, "has_text_content": False, "extracted_text": "", "unreadable_sections": []},
    }


def _llm_name(agent_def: dict) -> str:
    return os.getenv("CRDF_MM_MODEL") or str(agent_def.get("llm", "gemini-2.5-flash")).split("/", 1)[-1]


def _gemini_client():
    from google import genai
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key)


# --------------------------------------------------------------------------- multimodal checks
def run_multimodal_check(kind: str, path: str, mime_type: str, claim: str, crew_def: dict, agents_def: dict,
                         client=None) -> Dict[str, Any]:
    """Run the image / video / document task from crew.jsonc against Gemini and return its JSON."""
    task_name = next(t for t, k in MULTIMODAL_TASKS.items() if k == kind)
    task = next(t for t in crew_def["tasks"] if t["name"] == task_name)
    agent = agents_def[task["agent"]]
    client = client or _gemini_client()

    values = {"claim": claim, "image_file": "the attached image", "video_file": "the attached video",
              "document_file": "the attached file", "session_id": ""}
    prompt = (
        f"You are a {agent['role']}.\nGoal: {agent['goal']}\nBackground: {agent['backstory']}\n\n"
        f"TASK:\n{fill_placeholders(task['description'], values)}\n\n"
        f"EXPECTED OUTPUT:\n{fill_placeholders(task['expected_output'], values)}\n\n"
        "Respond with ONLY the JSON object, no commentary and no code fences."
    )

    from google.genai import types
    size = os.path.getsize(path)
    uploaded = None
    try:
        if kind == "video" or size > 18 * 1024 * 1024:
            uploaded = client.files.upload(file=path, config={"mime_type": mime_type})
            for _ in range(60):  # wait until Gemini has processed the upload
                state = getattr(getattr(uploaded, "state", None), "name", str(getattr(uploaded, "state", "ACTIVE")))
                if state == "ACTIVE":
                    break
                if state == "FAILED":
                    raise RuntimeError("Gemini could not process the uploaded file")
                time.sleep(2)
                uploaded = client.files.get(name=uploaded.name)
            part = uploaded
        else:
            with open(path, "rb") as fh:
                part = types.Part.from_bytes(data=fh.read(), mime_type=mime_type)
        resp = client.models.generate_content(
            model=_llm_name(agent),
            contents=[part, prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.1),
        )
        parsed = parse_json_loose(resp.text)
    finally:
        if uploaded is not None:
            try:
                client.files.delete(name=uploaded.name)
            except Exception:
                pass

    if not isinstance(parsed, dict):
        raise RuntimeError(f"{kind} analysis returned something that is not a JSON object")
    return normalise_multimodal(kind, parsed)


def normalise_multimodal(kind: str, raw: dict) -> Dict[str, Any]:
    """Coerce model output into exactly the shape the frontend/PDF renderer expect."""
    if kind == "document":
        text = str(raw.get("extracted_text") or "")
        return {"has_document": True, "has_text_content": bool(text.strip()), "extracted_text": text,
                "unreadable_sections": [str(x) for x in (raw.get("unreadable_sections") or [])]}
    mc, cc = raw.get("manipulation_check") or {}, raw.get("content_match_check") or {}
    matches = cc.get("matches_claim", "undetermined")
    if isinstance(matches, str) and matches.strip().lower() in ("true", "false"):
        matches = matches.strip().lower() == "true"
    out = {
        f"has_{kind}": True,
        "manipulation_check": {"appears_manipulated": bool(mc.get("appears_manipulated", False)), "reasoning": str(mc.get("reasoning", ""))},
        "content_match_check": {"matches_claim": matches, "reasoning": str(cc.get("reasoning", ""))},
    }
    return out


def build_multimodal_summary(results: Dict[str, Any]) -> str:
    parts = []
    for kind, key, label in (("image", "image_analysis", "image"), ("video", "video_analysis", "video")):
        a = results.get(key) or {}
        if a.get(f"has_{kind}"):
            mc, cc = a.get("manipulation_check", {}), a.get("content_match_check", {})
            parts.append(f"[Attached {label} analysis] appears_manipulated={mc.get('appears_manipulated')}: {mc.get('reasoning', '')} "
                         f"| matches_claim={cc.get('matches_claim')}: {cc.get('reasoning', '')}")
    d = results.get("document_analysis") or {}
    if d.get("has_document"):
        parts.append(f"[Attached document text] {d.get('extracted_text') or '(no readable text)'}")
    return "\n".join(parts)


# --------------------------------------------------------------------------- text pipeline (CrewAI)
def build_crew(crew_def: dict, agents_def: dict):
    from crewai import Agent, Crew, Process, Task

    tasks_def = [t for t in crew_def["tasks"] if t["name"] not in MULTIMODAL_TASKS]
    tool_classes = {}
    if os.getenv("SERPER_API_KEY"):
        try:
            from crewai_tools import SerperDevTool
            tool_classes["SerperDevTool"] = SerperDevTool
        except Exception as e:  # pragma: no cover
            log.warning("SerperDevTool unavailable: %s", e)
    else:
        log.warning("SERPER_API_KEY is not set - the evidence collector will run without web search")

    model_override = os.getenv("MODEL", "").strip()
    agents: Dict[str, Any] = {}
    for t in tasks_def:
        name = t["agent"]
        if name in agents:
            continue
        a = agents_def[name]
        settings = a.get("settings", {})
        agents[name] = Agent(
            role=a["role"], goal=a["goal"], backstory=a["backstory"],
            llm=model_override or a.get("llm"),
            tools=[tool_classes[x]() for x in a.get("tools", []) if x in tool_classes],
            verbose=False, allow_delegation=bool(settings.get("allow_delegation", False)),
        )

    tasks: Dict[str, Any] = {}
    ordered = []
    for t in tasks_def:
        task = Task(
            name=t["name"], description=t["description"], expected_output=t["expected_output"],
            agent=agents[t["agent"]], async_execution=bool(t.get("async_execution", False)),
            context=[tasks[c] for c in t.get("context", []) if c in tasks],
        )
        tasks[t["name"]] = task
        ordered.append(task)

    kwargs = {}
    if os.getenv("CRDF_MAX_RPM"):
        kwargs["max_rpm"] = int(os.environ["CRDF_MAX_RPM"])
    crew = Crew(agents=list(agents.values()), tasks=ordered, process=Process.sequential,
                verbose=False, memory=False, **kwargs)
    return crew, [t["name"] for t in tasks_def]


def run_crew(claim_text: str, session_id: str, crew_def: dict, agents_def: dict) -> Dict[str, Any]:
    """Run the text pipeline. Returns {task_name: parsed-or-raw output}."""
    crew, names = build_crew(crew_def, agents_def)
    result = crew.kickoff(inputs={"claim": claim_text, "session_id": session_id,
                                  "image_file": "", "video_file": "", "document_file": ""})
    outputs = list(getattr(result, "tasks_output", []) or [])
    data: Dict[str, Any] = {}
    for name, out in zip(names, outputs):
        raw = getattr(out, "raw", None) or str(out)
        parsed = parse_json_loose(raw)
        data[name] = parsed if parsed is not None else raw
    if REPORT_TASK not in data and getattr(result, "raw", None):
        data[REPORT_TASK] = result.raw
    return data


def clean_report(text: Any) -> Optional[str]:
    if not isinstance(text, str) or not text.strip():
        return None
    s = text.strip()
    s = re.sub(r"^```(?:markdown|md)?\s*\n", "", s)
    s = re.sub(r"\n```\s*$", "", s)
    return s.strip() or None


# --------------------------------------------------------------------------- public entry point
def analyze(claim: str, session_id: Optional[str] = None, files: Optional[Dict[str, Dict[str, str]]] = None,
            base_dir: Path = BASE_DIR) -> Dict[str, Any]:
    """
    files: {"image"|"video"|"document": {"path": ..., "mime": ...}}
    Returns the AnalyzeResponse dict.  Failures inside a stage are reported in the payload
    (text_pipeline_error / multimodal reasoning) rather than raised, matching the frontend contract.
    """
    claim = claim.strip()
    session_id = (session_id or "").strip() or f"web-{uuid.uuid4().hex[:12]}"
    crew_def, agents_def = load_definition(base_dir)

    results = default_multimodal_results()
    raw: Dict[str, Any] = {}
    errors = []
    key_for = {"image": "image_analysis", "video": "video_analysis", "document": "document_analysis"}
    for kind, info in (files or {}).items():
        try:
            results[key_for[kind]] = run_multimodal_check(kind, info["path"], info["mime"], claim, crew_def, agents_def)
        except Exception as e:
            log.exception("%s analysis failed", kind)
            errors.append(f"{kind} analysis failed: {e}")
            if kind == "document":
                results[key_for[kind]] = {"has_document": True, "has_text_content": False, "extracted_text": "",
                                          "unreadable_sections": [f"Analysis failed: {e}"]}
            else:
                results[key_for[kind]][f"has_{kind}"] = True
                results[key_for[kind]]["manipulation_check"]["reasoning"] = f"Analysis failed: {e}"
    if errors:
        raw["multimodal_errors"] = errors

    summary = build_multimodal_summary(results)
    claim_text = f"Claim: {claim}\n\nMultimodal Context: {summary}" if summary else claim

    payload = {"claim": claim, "multimodal_results": results, "multimodal_summary_text": summary,
               "text_pipeline_report": None, "raw_pipeline_data": raw}
    try:
        data = run_crew(claim_text, session_id, crew_def, agents_def)
    except Exception as e:
        log.exception("crew.kickoff() failed")
        payload["text_pipeline_error"] = f"crew.kickoff() failed: {e}"
        return payload

    raw.update(data)
    intake = data.get(INTAKE_TASK)
    if isinstance(intake, dict):
        status = str(intake.get("status", "")).lower()
        if status == "needs_clarification" or (intake.get("ready_for_processing") is False and status != "rejected"):
            payload["text_pipeline_error"] = f"Clarification needed: {intake.get('cleaned_claim', 'please add more detail to the claim.')}"
            return payload
        if status == "rejected":
            payload["text_pipeline_error"] = f"Claim rejected: {intake.get('cleaned_claim', 'this is not a checkable factual claim.')}"
            return payload

    report = clean_report(data.get(REPORT_TASK))
    if report:
        payload["text_pipeline_report"] = report
    else:
        payload["text_pipeline_error"] = "The report-writing agent returned no report."
    return payload
