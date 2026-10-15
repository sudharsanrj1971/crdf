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
    payload = {"claim": "Hygiene test claim"}
    response = client.post("/generate_pdf", json=payload)
    assert response.status_code == 200
    tmp_files_after = [f for f in os.listdir(temp_dir) if "crdf" in f.lower() and f.endswith(".tmp")]
    assert len(tmp_files_after) == 0, "Leftover .tmp files found!"
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
