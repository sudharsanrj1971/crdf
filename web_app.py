import os
import io
import shutil
import secrets
import tempfile
import asyncio
import threading
import logging
from fastapi import FastAPI, HTTPException, Form, File, UploadFile, Header, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from render_report import generate_pdf_report
import crdf_pipeline

log = logging.getLogger("crdf.api")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = FastAPI(title="CRDF Backend API", version="1.0.0")

# Comma-separated list of allowed origins, e.g. "http://localhost:3000,https://crdf.example.com".
# Defaults to the local Vite dev server. Wildcard origins cannot be combined with credentials.
CORS_ORIGINS = [o.strip() for o in (os.getenv("CORS_ORIGINS") or "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------------- auth
def require_api_key(authorization: Optional[str] = Header(None), x_api_key: Optional[str] = Header(None)):
    """If CRDF_API_KEY is set, requests must send it as X-API-Key or 'Authorization: Bearer'."""
    expected = os.getenv("CRDF_API_KEY", "").strip()
    if not expected:
        return
    supplied = (x_api_key or "").strip()
    if not supplied and authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


# ----------------------------------------------------------------------------- upload rules
MAX_CLAIM_CHARS = 5000
MAX_UPLOAD_BYTES = int(os.getenv("CRDF_MAX_UPLOAD_MB", "10")) * 1024 * 1024
ALLOWED_TYPES = {
    "image": {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"},
    "video": {"video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "video/mpeg": ".mpeg", "video/x-msvideo": ".avi"},
    "document": {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "text/plain": ".txt"},
}
_pipeline_slots = threading.BoundedSemaphore(int(os.getenv("CRDF_MAX_CONCURRENT", "2")))


async def _save_upload(kind: str, upload: Optional[UploadFile], workdir: str):
    """Validate one uploaded file and save it; returns {'path','mime'} or None when nothing was sent."""
    if upload is None or not (upload.filename or ""):
        return None
    mime = (upload.content_type or "").split(";")[0].strip().lower()
    ext = ALLOWED_TYPES[kind].get(mime)
    if ext is None:
        allowed = ", ".join(sorted(ALLOWED_TYPES[kind]))
        raise HTTPException(status_code=422, detail=f"Unsupported {kind} type '{mime or 'unknown'}'. Allowed: {allowed}.")
    path = os.path.join(workdir, f"{kind}{ext}")
    size = 0
    with open(path, "wb") as out:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"The {kind} file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
            out.write(chunk)
    if size == 0:
        raise HTTPException(status_code=422, detail=f"The {kind} file is empty.")
    if mime.startswith("image/"):
        try:
            from PIL import Image
            with Image.open(path) as im:
                im.verify()
        except Exception:
            raise HTTPException(status_code=422, detail=f"The {kind} file is not a valid image.")
    return {"path": path, "mime": mime}


class PdfRequestPayload(BaseModel):
    claim: Optional[str] = Field("Untitled Claim", description="The claim text")
    multimodal_results: Optional[Dict[str, Any]] = Field(default_factory=dict)
    multimodal_summary_text: Optional[str] = Field("")
    text_pipeline_report: Optional[str] = Field(None)
    raw_pipeline_data: Optional[Dict[str, Any]] = Field(default_factory=dict)
    text_pipeline_error: Optional[str] = Field(None)

def _remove_file(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "crdf-backend"}

@app.post("/analyze")
async def analyze_endpoint(
    claim: str = Form(...),
    session_id: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    document: Optional[UploadFile] = File(None),
    _auth: None = Depends(require_api_key),
):
    claim = (claim or "").strip()
    if not claim:
        raise HTTPException(status_code=422, detail="claim must not be empty.")
    if len(claim) > MAX_CLAIM_CHARS:
        raise HTTPException(status_code=422, detail=f"claim is longer than {MAX_CLAIM_CHARS} characters.")
    if not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
        raise HTTPException(status_code=503, detail="The server has no GEMINI_API_KEY configured.")
    if not _pipeline_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="The pipeline is busy with other requests. Please retry shortly.")

    workdir = tempfile.mkdtemp(prefix="crdf_up_")
    try:
        files = {}
        for kind, upload in (("image", image), ("video", video), ("document", document)):
            saved = await _save_upload(kind, upload, workdir)
            if saved:
                files[kind] = saved
        # The pipeline blocks for minutes (LLM calls) - keep it off the event loop.
        return await asyncio.to_thread(crdf_pipeline.analyze, claim, session_id, files)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        _pipeline_slots.release()


@app.post("/generate_pdf", dependencies=[Depends(require_api_key)])
async def generate_pdf_endpoint(payload: PdfRequestPayload):
    tmp_pdf = None
    try:
        fd, tmp_pdf = tempfile.mkstemp(suffix=".pdf", prefix="crdf_rep_")
        os.close(fd)

        # Run render in threadpool to avoid blocking event loop
        await asyncio.to_thread(generate_pdf_report, payload.model_dump(), tmp_pdf)

        if not os.path.exists(tmp_pdf) or os.path.getsize(tmp_pdf) == 0:
            raise HTTPException(status_code=500, detail="Generated PDF file is empty or missing.")

        # Safe filename from claim
        claim_slug = "".join(c if c.isalnum() and c.isascii() else "_" for c in (payload.claim or "report"))[:50].strip("_") or "report"
        filename = f"CRDF_Report_{claim_slug}.pdf"

        return FileResponse(
            path=tmp_pdf,
            media_type="application/pdf",
            filename=filename,
            background=BackgroundTask(_remove_file, tmp_pdf),  # delete the temp PDF once it has been sent
        )
    except Exception as e:
        if tmp_pdf and os.path.exists(tmp_pdf):
            _remove_file(tmp_pdf)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "message": "Failed to generate PDF report."}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web_app:app", host="127.0.0.1", port=8000, reload=False)
