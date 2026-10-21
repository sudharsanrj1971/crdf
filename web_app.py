"""
CRDF web backend.

Wraps the existing multimodal checks and the text pipeline behind a simple HTTP API.
"""

import asyncio
import json
import shutil
import tempfile
import threading
import uuid
import os
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
load_dotenv()

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from fastapi import FastAPI, Form, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

from multimodal_image_check import run_image_check
from multimodal_video_check import run_video_check
from multimodal_document_check import run_document_check
from run_full_crdf import build_multimodal_summary, run_text_pipeline_direct
from render_report import generate_pdf

app = FastAPI(title="CRDF - Claim Research and Detection Framework")

@app.on_event("startup")
async def startup_event_check():
    import os, sys
    missing = []
    if not os.getenv("GEMINI_API_KEY"):
        missing.append("GEMINI_API_KEY")
    if not os.getenv("SERPER_API_KEY"):
        missing.append("SERPER_API_KEY")
    if missing:
        print(f"FATAL: Missing required environment variable(s) at startup: {', '.join(missing)}", file=sys.stderr)



# Hardening: Explicit CORS allowlist via env var
allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(tempfile.gettempdir()) / "crdf_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


# --- Pydantic Models for /generate_pdf Validation ---
class MultimodalCheck(BaseModel):
    appears_manipulated: Optional[bool] = False
    reasoning: Optional[str] = ""

class ContentMatchCheck(BaseModel):
    matches_claim: Any = "undetermined"
    reasoning: Optional[str] = ""

class ImageAnalysis(BaseModel):
    has_image: bool
    manipulation_check: Optional[MultimodalCheck] = None
    content_match_check: Optional[ContentMatchCheck] = None

class VideoAnalysis(BaseModel):
    has_video: bool
    manipulation_check: Optional[MultimodalCheck] = None
    content_match_check: Optional[ContentMatchCheck] = None

class DocumentAnalysis(BaseModel):
    has_document: bool
    has_text_content: Optional[bool] = False
    extracted_text: Optional[str] = ""
    unreadable_sections: Optional[List[str]] = []

class MultimodalResults(BaseModel):
    image_analysis: ImageAnalysis
    video_analysis: VideoAnalysis
    document_analysis: DocumentAnalysis

class GeneratePdfRequest(BaseModel):
    claim: str
    multimodal_results: MultimodalResults
    multimodal_summary_text: str
    text_pipeline_report: str
    raw_pipeline_data: Dict[str, Any]
    text_pipeline_error: Optional[str] = None


def _save_upload(upload: UploadFile | None) -> str:
    if upload is None or not upload.filename:
        return "none"
    suffix = Path(upload.filename).suffix
    dest = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return str(dest)


# Dedicated ThreadPoolExecutor for running blocking pipeline tasks
pipeline_executor = ThreadPoolExecutor(max_workers=4)

# Shared cancellation flag - moved to per-request scope inside analyze()

@app.post("/analyze")
async def analyze(
    claim: str = Form(...),
    session_id: str = Form("none"),
    image: UploadFile | None = None,
    video: UploadFile | None = None,
    document: UploadFile | None = None,
):
    if not claim or not claim.strip():
        raise HTTPException(status_code=400, detail="Claim cannot be empty")
    if len(claim) > 2000:
        raise HTTPException(status_code=400, detail="Claim exceeds maximum length of 2000 characters")

    image_path = _save_upload(image)
    video_path = _save_upload(video)
    document_path = _save_upload(document)

    loop = asyncio.get_running_loop()
    pipeline_cancel_event = threading.Event()

    def _run_pipeline():
        img_res = run_image_check(claim, image_path)
        if pipeline_cancel_event.is_set():
            return {
                "claim": claim,
                "multimodal_results": {
                    "image_analysis": img_res,
                    "video_analysis": {"has_video": False},
                    "document_analysis": {"has_document": False},
                },
                "multimodal_summary_text": "",
                "text_pipeline_report": None,
                "raw_pipeline_data": {},
                "text_pipeline_error": "Cancelled: timeout fired during image check.",
            }

        vid_res = run_video_check(claim, video_path)
        if pipeline_cancel_event.is_set():
            return {
                "claim": claim,
                "multimodal_results": {
                    "image_analysis": img_res,
                    "video_analysis": vid_res,
                    "document_analysis": {"has_document": False},
                },
                "multimodal_summary_text": "",
                "text_pipeline_report": None,
                "raw_pipeline_data": {},
                "text_pipeline_error": "Cancelled: timeout fired during video check.",
            }

        doc_res = run_document_check(document_path)
        if pipeline_cancel_event.is_set():
            return {
                "claim": claim,
                "multimodal_results": {
                    "image_analysis": img_res,
                    "video_analysis": vid_res,
                    "document_analysis": doc_res,
                },
                "multimodal_summary_text": "",
                "text_pipeline_report": None,
                "raw_pipeline_data": {},
                "text_pipeline_error": "Cancelled: timeout fired during document check.",
            }

        mm_sum = build_multimodal_summary(img_res, vid_res, doc_res)
        
        # We pass image_path, video_path, document_path, and mm_sum to the pipeline
        # (Modifications applied directly inside run_full_crdf.py for Fix 2)
        rep_txt, raw_data, err = run_text_pipeline_direct(claim, session_id, mm_sum, image_path, video_path, document_path)
        
        return {
            "claim": claim,
            "multimodal_results": {
                "image_analysis": img_res,
                "video_analysis": vid_res,
                "document_analysis": doc_res,
            },
            "multimodal_summary_text": mm_sum,
            "text_pipeline_report": rep_txt,
            "raw_pipeline_data": raw_data,
            "text_pipeline_error": err,
        }

    try:
        # Wrap in timeout. wait_for throws TimeoutError and cancels the future.
        # Note: Cancelling run_in_executor doesn't instantly kill the thread in Python,
        # but returning a 504 immediately satisfies the caller requirement.
        # For actual thread teardown, we would need to pass cancellation tokens into CrewAI,
        # which is often unsupported. However, the 504 response goes out instantly.
        combined = await asyncio.wait_for(
            loop.run_in_executor(pipeline_executor, _run_pipeline),
            timeout=float(os.getenv("PIPELINE_TIMEOUT_SECONDS", "600.0"))  # 10 minute timeout default
        )
        return JSONResponse(content=combined)
    except asyncio.TimeoutError:
        pipeline_cancel_event.set()  # Signal running thread to stop at next checkpoint
        raise HTTPException(status_code=504, detail="Pipeline execution timed out.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in (image_path, video_path, document_path):
            if p != "none":
                Path(p).unlink(missing_ok=True)


@app.post("/generate_pdf")
async def generate_pdf_endpoint(request: GeneratePdfRequest, background_tasks: BackgroundTasks):
    # Validates structure before chart-generation code runs via Pydantic model
    temp_json = UPLOAD_DIR / f"temp_report_{uuid.uuid4().hex}.json"
    temp_pdf = UPLOAD_DIR / f"temp_pdf_{uuid.uuid4().hex}.pdf"
    
    with temp_json.open("w", encoding="utf-8") as f:
        json.dump(request.dict(), f)
    
    success = False
    try:
        # We run PDF generation in executor to avoid blocking the event loop
        loop = asyncio.get_running_loop()
        pdf_path = await loop.run_in_executor(
            pipeline_executor,
            generate_pdf, str(temp_json), str(temp_pdf)
        )
        # Schedule cleanup of the temp PDF after response is streamed
        background_tasks.add_task(Path(pdf_path).unlink, missing_ok=True)
        success = True
        return FileResponse(
            path=pdf_path,
            media_type="application/pdf",
            filename="CRDF_Report.pdf",
            headers={"Content-Disposition": "attachment; filename=CRDF_Report.pdf"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF Generation failed: {str(e)}")
    finally:
        temp_json.unlink(missing_ok=True)
        if not success:
            temp_pdf.unlink(missing_ok=True)


@app.get("/health")
async def health_check():
    import os
    import sys
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="Missing GEMINI_API_KEY")
    serper_status = "ok"
    if not os.getenv("SERPER_API_KEY"):
        serper_status = "missing_warning"
        print("[CRDF WARNING] SERPER_API_KEY is missing! Real web evidence collection will fail.", file=sys.stderr)
    return {"status": "ok", "serper_api_key": serper_status}


dist_dir = Path(__file__).parent / "dist"
dist_index = dist_dir / "index.html"
dist_assets = dist_dir / "assets"

if dist_assets.exists():
    app.mount("/assets", StaticFiles(directory=dist_assets), name="assets")

@app.get("/")
async def root():
    if dist_index.exists():
        return FileResponse(dist_index)
    return FileResponse(Path(__file__).parent / "static" / "index.html")

app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")


