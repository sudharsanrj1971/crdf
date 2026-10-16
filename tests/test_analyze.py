import io
import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import crdf_pipeline  # noqa: E402
import web_app  # noqa: E402

client = TestClient(web_app.app)
ROOT = Path(__file__).resolve().parent.parent

REPORT = """## (1) REPORT HEADER

| Field | Value |
| :--- | :--- |
| Report ID | CRDF-2026-000001 |
| Submission Date | [Reflects generation time] |

## (2) FINAL VERDICT AND CONFIDENCE SCORE

Final Verdict: False | Confidence Score: 91%

## (3) EXECUTIVE SUMMARY

The Zyxwv Tower claim is false.
"""


def png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def gemini_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("CRDF_API_KEY", raising=False)


# ----------------------------------------------------------------- definition loading
def test_strip_jsonc_keeps_slashes_in_strings():
    out = json.loads(crdf_pipeline.strip_jsonc('{"a": "http://x // y", // note\n "b": [1, 2,],}'))
    assert out == {"a": "http://x // y", "b": [1, 2]}


def test_real_crew_definition_loads():
    crew_def, agents_def = crdf_pipeline.load_definition(ROOT)
    assert len(crew_def["tasks"]) == 16 and len(agents_def) == 16
    names = {t["name"] for t in crew_def["tasks"]}
    assert crdf_pipeline.REPORT_TASK in names and crdf_pipeline.INTAKE_TASK in names


def test_crew_builds_from_definition(monkeypatch):
    pytest.importorskip("crewai")
    monkeypatch.setenv("SERPER_API_KEY", "test")
    crew_def, agents_def = crdf_pipeline.load_definition(ROOT)
    crew, names = crdf_pipeline.build_crew(crew_def, agents_def)
    assert names[-1] == "verify_report_quality"
    assert len(crew.tasks) == 13  # 16 minus the 3 multimodal tasks handled separately


# ----------------------------------------------------------------- pipeline orchestration
def test_analyze_success(monkeypatch):
    seen = {}

    def fake_crew(claim_text, session_id, crew_def, agents_def):
        seen["claim_text"] = claim_text
        return {"take_the_raw_user_task": {"cleaned_claim": "x", "ready_for_processing": True, "status": "ready"},
                "write_full_report": "```markdown\n" + REPORT + "\n```"}

    def fake_mm(kind, path, mime, claim, crew_def, agents_def, client=None):
        return crdf_pipeline.normalise_multimodal(kind, {"manipulation_check": {"appears_manipulated": True, "reasoning": "edge halo"},
                                                         "content_match_check": {"matches_claim": "false", "reasoning": "wrong tower"}})

    monkeypatch.setattr(crdf_pipeline, "run_crew", fake_crew)
    monkeypatch.setattr(crdf_pipeline, "run_multimodal_check", fake_mm)
    out = crdf_pipeline.analyze("The Zyxwv Tower is 5 km tall", None, {"image": {"path": "x.png", "mime": "image/png"}}, ROOT)
    assert out["text_pipeline_report"].startswith("## (1) REPORT HEADER")
    assert "Multimodal Context:" in seen["claim_text"] and "appears_manipulated=True" in seen["claim_text"]
    assert out["multimodal_results"]["image_analysis"]["has_image"] is True
    assert out["multimodal_results"]["image_analysis"]["content_match_check"]["matches_claim"] is False
    assert out["multimodal_results"]["video_analysis"]["has_video"] is False
    assert "text_pipeline_error" not in out


def test_analyze_needs_clarification(monkeypatch):
    monkeypatch.setattr(crdf_pipeline, "run_crew", lambda *a, **k: {
        "take_the_raw_user_task": {"cleaned_claim": "Which year do you mean?", "ready_for_processing": False, "status": "needs_clarification"},
        "write_full_report": REPORT})
    out = crdf_pipeline.analyze("It happened last year", None, None, ROOT)
    assert out["text_pipeline_error"].startswith("Clarification needed: Which year")
    assert out["text_pipeline_report"] is None


def test_analyze_crew_failure_is_reported_not_raised(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("429 RESOURCE_EXHAUSTED")
    monkeypatch.setattr(crdf_pipeline, "run_crew", boom)
    out = crdf_pipeline.analyze("Some claim", None, None, ROOT)
    assert "crew.kickoff() failed" in out["text_pipeline_error"] and "429" in out["text_pipeline_error"]


def test_multimodal_failure_does_not_stop_text_pipeline(monkeypatch):
    def bad_mm(*a, **k):
        raise RuntimeError("model unavailable")
    monkeypatch.setattr(crdf_pipeline, "run_multimodal_check", bad_mm)
    monkeypatch.setattr(crdf_pipeline, "run_crew", lambda *a, **k: {"write_full_report": REPORT})
    out = crdf_pipeline.analyze("claim", None, {"image": {"path": "x.png", "mime": "image/png"}}, ROOT)
    assert out["text_pipeline_report"]
    assert "model unavailable" in out["multimodal_results"]["image_analysis"]["manipulation_check"]["reasoning"]


# ----------------------------------------------------------------- /analyze endpoint
def test_endpoint_returns_pipeline_payload(monkeypatch):
    captured = {}

    def fake_analyze(claim, session_id, files):
        captured.update(claim=claim, session_id=session_id, files={k: os.path.exists(v["path"]) for k, v in files.items()})
        return {"claim": claim, "multimodal_results": crdf_pipeline.default_multimodal_results(), "multimodal_summary_text": "",
                "text_pipeline_report": REPORT, "raw_pipeline_data": {}}

    monkeypatch.setattr(crdf_pipeline, "analyze", fake_analyze)
    r = client.post("/analyze", data={"claim": "  The Zyxwv Tower is tall  ", "session_id": "abc-123"},
                    files={"image": ("p.png", png_bytes(), "image/png")})
    assert r.status_code == 200, r.text
    assert captured["claim"] == "The Zyxwv Tower is tall" and captured["session_id"] == "abc-123"
    assert captured["files"] == {"image": True}
    assert set(r.json()) >= {"claim", "multimodal_results", "multimodal_summary_text", "text_pipeline_report", "raw_pipeline_data"}


def test_endpoint_cleans_up_uploads(monkeypatch):
    paths = []
    monkeypatch.setattr(crdf_pipeline, "analyze", lambda c, s, f: paths.extend(v["path"] for v in f.values()) or {"claim": c})
    client.post("/analyze", data={"claim": "x"}, files={"image": ("p.png", png_bytes(), "image/png")})
    assert paths and not any(os.path.exists(p) for p in paths)


@pytest.mark.parametrize("data,files,status", [
    ({"claim": "   "}, None, 422),
    ({}, None, 422),
    ({"claim": "x" * 5001}, None, 422),
    ({"claim": "x"}, {"image": ("a.exe", b"MZ", "application/x-msdownload")}, 422),
    ({"claim": "x"}, {"image": ("a.png", b"not really a png", "image/png")}, 422),
    ({"claim": "x"}, {"document": ("a.pdf", b"", "application/pdf")}, 422),
])
def test_endpoint_validation(data, files, status):
    assert client.post("/analyze", data=data, files=files).status_code == status


def test_endpoint_rejects_oversize_upload(monkeypatch):
    monkeypatch.setattr(web_app, "MAX_UPLOAD_BYTES", 100)
    r = client.post("/analyze", data={"claim": "x"}, files={"document": ("a.txt", b"a" * 500, "text/plain")})
    assert r.status_code == 413


def test_endpoint_needs_gemini_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    assert client.post("/analyze", data={"claim": "x"}).status_code == 503


def test_endpoint_api_key(monkeypatch):
    monkeypatch.setenv("CRDF_API_KEY", "s3cret")
    monkeypatch.setattr(crdf_pipeline, "analyze", lambda c, s, f: {"claim": c})
    assert client.post("/analyze", data={"claim": "x"}).status_code == 401
    assert client.post("/analyze", data={"claim": "x"}, headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.post("/analyze", data={"claim": "x"}, headers={"X-API-Key": "s3cret"}).status_code == 200
    assert client.post("/analyze", data={"claim": "x"}, headers={"Authorization": "Bearer s3cret"}).status_code == 200
    assert client.post("/generate_pdf", json={"claim": "x"}).status_code == 401
    assert client.get("/health").status_code == 200


def test_endpoint_busy_returns_429(monkeypatch):
    sem = web_app._pipeline_slots
    held = []
    while sem.acquire(blocking=False):
        held.append(1)
    try:
        assert client.post("/analyze", data={"claim": "x"}).status_code == 429
    finally:
        for _ in held:
            sem.release()
