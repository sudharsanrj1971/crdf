import io
import os
import tempfile
from fastapi.testclient import TestClient
from web_app import app
from render_report import generate_pdf_report

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert response.json()["status"] == "healthy"
    print("PASS: test_health_endpoint")

def test_openapi_endpoint():
    response = client.get("/openapi.json")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert "openapi" in response.json()
    print("PASS: test_openapi_endpoint")

def test_generate_pdf_valid_payload():
    payload = {
        "claim": "The Eiffel Tower is in Paris, France (°C, ₹, é, em—dash, 'quotes').",
        "multimodal_results": {},
        "multimodal_summary_text": "Valid test summary",
        "text_pipeline_report": "## Executive Summary\nValid test report",
        "raw_pipeline_data": {},
        "text_pipeline_error": None
    }
    response = client.post("/generate_pdf", json=payload)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}, content: {response.text}"
    assert response.headers["content-type"] == "application/pdf"
    assert len(response.content) > 1000
    print("PASS: test_generate_pdf_valid_payload")

def test_generate_pdf_missing_optional_fields():
    payload = {
        "claim": "Minimal claim payload"
    }
    response = client.post("/generate_pdf", json=payload)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert response.headers["content-type"] == "application/pdf"
    print("PASS: test_generate_pdf_missing_optional_fields")

def test_generate_pdf_malformed_payload():
    response = client.post("/generate_pdf", json={"claim": 12345, "multimodal_results": "not_a_dict"})
    assert response.status_code == 422, f"Expected 422, got {response.status_code}"
    print("PASS: test_generate_pdf_malformed_payload")

def test_generate_pdf_very_long_text():
    long_claim = "Very long claim " + "word " * 200 + "https://example.com/" + "a" * 100
    payload = {
        "claim": long_claim,
        "multimodal_summary_text": "Summary " * 100,
        "text_pipeline_report": "Report " * 200
    }
    response = client.post("/generate_pdf", json=payload)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert response.headers["content-type"] == "application/pdf"
    print("PASS: test_generate_pdf_very_long_text")

def test_generate_pdf_needs_clarification():
    payload = {
        "claim": "Ambiguous claim",
        "text_pipeline_error": "Clarification needed: Please specify which year."
    }
    response = client.post("/generate_pdf", json=payload)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert response.headers["content-type"] == "application/pdf"
    print("PASS: test_generate_pdf_needs_clarification")

def test_file_hygiene():
    temp_dir = tempfile.gettempdir()
    for f in os.listdir(temp_dir):
        if f.startswith("crdf_rep_"):
            os.remove(os.path.join(temp_dir, f))
    payload = {"claim": "Hygiene test claim"}
    response = client.post("/generate_pdf", json=payload)
    assert response.status_code == 200
    leftovers = [f for f in os.listdir(temp_dir) if f.startswith("crdf_rep_") or ("crdf" in f.lower() and f.endswith(".tmp"))]
    assert len(leftovers) == 0, f"Leftover temp files found: {leftovers}"
    print("PASS: test_file_hygiene")

if __name__ == "__main__":
    print("Running PDF generation and API test suite...")
    test_health_endpoint()
    test_openapi_endpoint()
    test_generate_pdf_valid_payload()
    test_generate_pdf_missing_optional_fields()
    test_generate_pdf_malformed_payload()
    test_generate_pdf_very_long_text()
    test_generate_pdf_needs_clarification()
    test_file_hygiene()
    print("ALL TESTS PASSED SUCCESSFULLY!")


# ----------------------------------------------------------------- content of the report (not just "a PDF came back")
def _pdf_text(raw: bytes) -> str:
    from pypdf import PdfReader
    return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(raw)).pages)


REPORT_MD = """## (1) REPORT HEADER

| Field | Value |
| :--- | :--- |
| Report ID | CRDF-2026-000777 |
| Submission Date | [Reflects generation time] |
| Claim Category | Geography |

## (2) FINAL VERDICT AND CONFIDENCE SCORE

Final Verdict: False | Confidence Score: 91%

## (3) EXECUTIVE SUMMARY

The Zyxwv Tower claim is **false**: it is 330 m tall, not 5 km. Temperature 21°C, price ₹500.

## (4) CLAIM DECOMPOSITION

| # | Sub-Claim | Type |
| :--- | :--- | :--- |
| 1 | The Zyxwv Tower is 5 km tall. | Factual |

## (14) REFERENCES

https://example.org/zyxwv-tower
https://example.org/second-source
"""


def test_pdf_reflects_the_submitted_report():
    r = client.post("/generate_pdf", json={"claim": "The Zyxwv Tower is 5 km tall", "text_pipeline_report": REPORT_MD})
    assert r.status_code == 200
    text = _pdf_text(r.content)
    for expected in ("CRDF Claim Verification Report", "CRDF-2026-000777", "FINAL VERDICT", "FALSE", "91%",
                     "Executive Summary", "Claim Decomposition", "Zyxwv Tower", "₹500", "21°C", "https://example.org/second-source"):
        assert expected in text, f"missing {expected!r}"
    assert "**" not in text and "##" not in text and "[Reflects" not in text
    assert "iPhone" not in text and "Steve Jobs" not in text  # the old hard-coded demo content is gone


def test_pdf_without_report_says_so():
    r = client.post("/generate_pdf", json={"claim": "Some claim", "text_pipeline_error": "crew.kickoff() failed: 429"})
    text = _pdf_text(r.content)
    assert "Report Unavailable" in text and "429" in text


def test_pdf_includes_multimodal_findings():
    mm = {"image_analysis": {"has_image": True, "manipulation_check": {"appears_manipulated": True, "reasoning": "halo around edges"},
                             "content_match_check": {"matches_claim": False, "reasoning": "shows a different tower"}}}
    r = client.post("/generate_pdf", json={"claim": "c", "text_pipeline_report": REPORT_MD, "multimodal_results": mm})
    text = _pdf_text(r.content)
    assert "Multimodal Evidence Analysis" in text and "halo around edges" in text
