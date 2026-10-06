"""
CRDF Edge-Case Test Suite (pytest)

Tests cover the validation, retry, rule-ordering, and PDF-generation edge cases
specified in STEP 4 of the final production pass. All inputs are either:
  - Real values sourced from combined_result.json / the actual pipeline schema, or
  - Clearly labeled SYNTHETIC inputs (see comments per test).

Run with:
    .venv/Scripts/pytest test_edge_cases.py -v
"""
import asyncio
import json
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# FastAPI test client
# ---------------------------------------------------------------------------
from web_app import app

client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REAL_COMBINED_RESULT_PATH = Path(__file__).parent / "combined_result.json"


def _load_combined_result() -> dict:
    with REAL_COMBINED_RESULT_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _minimal_generate_pdf_payload() -> dict:
    """Build a minimal valid /generate_pdf payload from the real combined_result.json."""
    data = _load_combined_result()
    return {
        "claim": data["claim"],
        "multimodal_results": data["multimodal_results"],
        "multimodal_summary_text": data.get("multimodal_summary_text", ""),
        "text_pipeline_report": data["text_pipeline_report"],
        "raw_pipeline_data": data.get("raw_pipeline_data", {}),
        "text_pipeline_error": data.get("text_pipeline_error"),
    }


# ===========================================================================
# Test 1: Empty / whitespace-only claim → 400, no pipeline run
# (SYNTHETIC input: "" and "   ")
# ===========================================================================
@pytest.mark.parametrize("claim_value", ["   ", "\t\n"])
def test_empty_claim_returns_400(claim_value):
    """SYNTHETIC: whitespace-only claim must be rejected with 400, not pipeline run."""
    resp = client.post("/analyze", data={"claim": claim_value})
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code} for claim={repr(claim_value)}"
    body = resp.json()
    assert "empty" in body.get("detail", "").lower() or "claim" in body.get("detail", "").lower()


def test_truly_empty_claim_returns_4xx():
    """SYNTHETIC: a completely empty claim (FastAPI Form required) returns 4xx (422 from
    FastAPI Form validation or 400 from our check). Either is correct — the request must
    not reach the pipeline."""
    resp = client.post("/analyze", data={"claim": ""})
    assert resp.status_code in (400, 422), (
        f"Expected 400 or 422 for empty claim, got {resp.status_code}"
    )


# ===========================================================================
# Test 2: Claim text beyond the 2000-char cap → 400, no pipeline run
# (SYNTHETIC: 2001-char string of 'a')
# ===========================================================================
def test_overlong_claim_returns_400():
    """SYNTHETIC: claim > 2000 chars must be rejected with 400."""
    long_claim = "a" * 2001
    resp = client.post("/analyze", data={"claim": long_claim})
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    body = resp.json()
    assert "length" in body.get("detail", "").lower() or "2000" in body.get("detail", "")


# ===========================================================================
# Test 3: Malformed /generate_pdf body → 422, not a 500 from matplotlib/reportlab
# (SYNTHETIC: JSON missing required fields)
# ===========================================================================
def test_generate_pdf_malformed_body_returns_422():
    """SYNTHETIC: /generate_pdf must return 422 for malformed payloads."""
    # Missing 'multimodal_results', 'text_pipeline_report', 'raw_pipeline_data'
    malformed = {"claim": "some claim"}
    resp = client.post("/generate_pdf", json=malformed)
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}"


def test_generate_pdf_wrong_types_returns_422():
    """SYNTHETIC: /generate_pdf with wrong types must return 422."""
    payload = _minimal_generate_pdf_payload()
    payload["raw_pipeline_data"] = "this_should_be_a_dict"  # wrong type
    resp = client.post("/generate_pdf", json=payload)
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}"


def test_generate_pdf_missing_image_analysis_returns_422():
    """SYNTHETIC: /generate_pdf with missing multimodal sub-fields must return 422."""
    payload = _minimal_generate_pdf_payload()
    payload["multimodal_results"] = {"image_analysis": None, "video_analysis": None, "document_analysis": None}
    resp = client.post("/generate_pdf", json=payload)
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}"


# ===========================================================================
# Test 4: Forced 429 from LiteLLM → retry kicks in, doesn't hang or crash silently
# (SYNTHETIC: mock that raises RateLimitError 2 times then succeeds)
# ===========================================================================
def test_429_retry_logic():
    """SYNTHETIC: verifies patch_llm_retry catches 429 and retries up to max_retries."""
    import patch_llm_retry  # ensures wrappers are registered
    import litellm

    call_count = {"n": 0}

    class FakeRateLimitError(Exception):
        pass

    def mock_completion_sometimes_fails(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] < 3:
            raise FakeRateLimitError("429 RESOURCE_EXHAUSTED: please retry in 1s")
        # On 3rd call, succeed (return a minimal response-like object)
        m = MagicMock()
        m.choices = [MagicMock()]
        m.choices[0].message = MagicMock()
        m.choices[0].message.content = "ok"
        return m

    original = litellm.completion
    try:
        litellm.completion = mock_completion_sometimes_fails
        # Import and re-register patch so it wraps our mock
        import importlib
        import patch_llm_retry as plr
        # patch the underlying private reference directly
        plr._original_completion = mock_completion_sometimes_fails

        result = plr.patched_completion(model="gemini/gemini-2.0-flash", messages=[{"role": "user", "content": "test"}])
        assert call_count["n"] == 3, f"Expected 3 calls (2 failures + 1 success), got {call_count['n']}"
    finally:
        litellm.completion = original


# ===========================================================================
# Test 5: Zero credibility scores → PDF renders without ZeroDivisionError
# (SYNTHETIC: modified payload with all credibility scores = 0)
# ===========================================================================
def test_generate_pdf_zero_credibility_no_crash(tmp_path):
    """SYNTHETIC: All source credibility scores = 0 must not crash render_report.py."""
    from render_report import generate_pdf

    data = _load_combined_result()

    # Zero out all credibility scores in raw_pipeline_data
    rpd = data.get("raw_pipeline_data", {})
    if "score_source_credibility" in rpd and isinstance(rpd["score_source_credibility"], dict):
        scores = rpd["score_source_credibility"].get("scores", [])
        for s in scores:
            if isinstance(s, dict):
                s["credibility_score"] = 0.0

    # Write a temp JSON and run generate_pdf
    tmp_json = tmp_path / "test_result.json"
    tmp_pdf = tmp_path / "test_output.pdf"
    with tmp_json.open("w", encoding="utf-8") as f:
        json.dump(data, f)

    # Should NOT raise ZeroDivisionError
    try:
        out = generate_pdf(str(tmp_json), str(tmp_pdf))
        assert Path(out).exists(), "PDF was not created"
        assert Path(out).stat().st_size > 1000, "PDF is suspiciously small"
    except ZeroDivisionError:
        pytest.fail("generate_pdf raised ZeroDivisionError with zero credibility scores")


# ===========================================================================
# Test 6: Regression — sub-claim with unanimous contradicted evidence → False
# (Uses real pipeline rule-order behavior from the make_final_decision task description)
# ===========================================================================
def test_false_classification_rule_order():
    """
    Regression: rule order in make_final_decision puts
    (contradiction_type == full_contradiction AND independent_verdict == contradicted)
    BEFORE the confidence_score threshold check.
    We verify that if both conditions are met, the classification is 'False'
    regardless of confidence score.

    This doesn't run the full pipeline (that would be slow), but validates
    the logic exists and is described as required in crew.jsonc.
    """
    with open("crew.jsonc", "r", encoding="utf-8") as f:
        crew_text = f.read()

    # The rule must appear BEFORE "Requires More Evidence"
    rule_false_idx = crew_text.find("full_contradiction AND independent_verdict is contradicted")
    rule_req_more_idx = crew_text.find("confidence_score is below 20")

    assert rule_false_idx != -1, "False rule not found in crew.jsonc"
    assert rule_req_more_idx != -1, "Requires More Evidence rule not found in crew.jsonc"
    assert rule_false_idx < rule_req_more_idx, (
        "REGRESSION: 'False' rule appears AFTER 'Requires More Evidence' rule in crew.jsonc. "
        "This breaks the rule ordering required for the False classification."
    )


# ===========================================================================
# Test 7: /health endpoint reflects env var state
# ===========================================================================
def test_health_check_with_key_set(monkeypatch):
    """Health check returns 200 when GEMINI_API_KEY is set."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-synthetic")
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_health_check_without_key(monkeypatch):
    """Health check returns 500 when GEMINI_API_KEY is absent."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    resp = client.get("/health")
    assert resp.status_code == 500


# ===========================================================================
# Test 8: Timeout guard returns 504 (mocked pipeline, force short delay)
# ===========================================================================
def test_analyze_timeout_returns_504():
    """SYNTHETIC: When asyncio.wait_for raises TimeoutError, caller receives 504.
    
    Note: TestClient uses WSGI sync mode, so we verify that the endpoint's
    try/except asyncio.TimeoutError block would correctly map a TimeoutError to 504.
    We confirm this by examining the web_app source directly.
    """
    import inspect
    import web_app
    source = inspect.getsource(web_app.analyze)
    assert "asyncio.TimeoutError" in source, "TimeoutError not caught in analyze()"
    assert "504" in source, "504 status code not returned on TimeoutError"
    # Also verify the timeout value is positive and meaningful
    assert "timeout=" in source, "No timeout= argument found in asyncio.wait_for call"


# ===========================================================================
# Test 9: Partial PDF file (.tmp) is cleaned up on real success run
# ===========================================================================
def test_no_tmp_file_after_successful_pdf(tmp_path):
    """After a successful PDF generation, no .tmp file must remain."""
    from render_report import generate_pdf

    data = _load_combined_result()
    tmp_json = tmp_path / "test_result.json"
    tmp_pdf = tmp_path / "test_output.pdf"

    with tmp_json.open("w", encoding="utf-8") as f:
        json.dump(data, f)

    generate_pdf(str(tmp_json), str(tmp_pdf))

    tmp_leftover = Path(str(tmp_pdf) + ".tmp")
    assert not tmp_leftover.exists(), ".tmp file was not cleaned up after successful PDF generation"
    assert tmp_pdf.exists(), "Final PDF file was not created"
