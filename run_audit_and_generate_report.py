import os
import sys
import json
import time
import requests
from pathlib import Path

CLAIM = "I heard on the news that it will rain in Kanchipuram tomorrow and that all schools and colleges will be closed. Is it true?"

def main():
    reports_dir = Path("reports")
    reports_dir.mkdir(exist_ok=True)

    print(f"=== 1. Submitting Claim to CRDF Pipeline ===")
    print(f"Claim: {CLAIM}\n")

    start_time = time.time()
    analyze_url = "http://127.0.0.1:8000/analyze"
    data = {
        "claim": CLAIM,
        "session_id": "kanchipuram-live-audit-session"
    }

    try:
        resp = requests.post(analyze_url, data=data, timeout=600)
    except Exception as e:
        print(f"ERROR: Failed to connect or execute /analyze: {e}")
        sys.exit(1)

    elapsed = time.time() - start_time
    print(f"Status Code: {resp.status_code} in {elapsed:.2f}s\n")

    if resp.status_code != 200:
        print(f"ERROR response: {resp.text}")
        sys.exit(1)

    analysis_result = resp.json()

    # Save full audit JSON
    json_path = reports_dir / "kanchipuram_analysis_audit.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(analysis_result, f, indent=2, ensure_ascii=False)
    print(f"=== 2. Audit Data Saved ===")
    print(f"Saved full audit JSON to: {json_path}")

    # Print summary of audit
    raw_data = analysis_result.get("raw_pipeline_data", {})
    print(f"Tasks Completed in Pipeline ({len(raw_data)} tasks):")
    for task_name in raw_data.keys():
        print(f"  - {task_name}")

    report_text = analysis_result.get("text_pipeline_report", "")
    print(f"\nReport Preview:\n{report_text[:600]}...\n")

    # Generate PDF
    print(f"=== 3. Generating PDF Report ===")
    pdf_url = "http://127.0.0.1:8000/generate_pdf"
    
    # Payload matches GeneratePdfRequest schema
    pdf_payload = {
        "claim": analysis_result.get("claim", CLAIM),
        "multimodal_results": analysis_result.get("multimodal_results", {
            "image_analysis": {"has_image": False},
            "video_analysis": {"has_video": False},
            "document_analysis": {"has_document": False}
        }),
        "multimodal_summary_text": analysis_result.get("multimodal_summary_text", ""),
        "text_pipeline_report": str(report_text),
        "raw_pipeline_data": raw_data,
        "text_pipeline_error": analysis_result.get("text_pipeline_error")
    }

    pdf_resp = requests.post(pdf_url, json=pdf_payload, timeout=120)
    if pdf_resp.status_code != 200:
        print(f"ERROR: PDF generation failed with code {pdf_resp.status_code}: {pdf_resp.text}")
        sys.exit(1)

    pdf_path = reports_dir / "CRDF_Report_Kanchipuram.pdf"
    with open(pdf_path, "wb") as f:
        f.write(pdf_resp.content)

    pdf_size = os.path.getsize(pdf_path)
    print(f"PDF successfully generated and saved to: {pdf_path}")
    print(f"PDF File Size: {pdf_size:,} bytes")

    if pdf_size < 1000:
        print(f"WARNING: PDF size is unusually small ({pdf_size} bytes)")
    else:
        print(f"PDF verified: Non-empty valid PDF ({pdf_size:,} bytes)")

if __name__ == "__main__":
    main()
