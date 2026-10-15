import os
import tempfile
import asyncio
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from render_report import generate_pdf_report

app = FastAPI(title="CRDF Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PdfRequestPayload(BaseModel):
    claim: Optional[str] = Field("Untitled Claim", description="The claim text")
    multimodal_results: Optional[Dict[str, Any]] = Field(default_factory=dict)
    multimodal_summary_text: Optional[str] = Field("")
    text_pipeline_report: Optional[str] = Field(None)
    raw_pipeline_data: Optional[Dict[str, Any]] = Field(default_factory=dict)
    text_pipeline_error: Optional[str] = Field(None)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "crdf-backend"}

@app.post("/generate_pdf")
async def generate_pdf_endpoint(payload: PdfRequestPayload):
    tmp_pdf = None
    try:
        fd, tmp_pdf = tempfile.mkstemp(suffix=".pdf", prefix="crdf_rep_")
        os.close(fd)

        # Run render in threadpool to avoid blocking event loop
        await asyncio.to_thread(generate_pdf_report, payload.dict(), tmp_pdf)

        if not os.path.exists(tmp_pdf) or os.path.getsize(tmp_pdf) == 0:
            raise HTTPException(status_code=500, detail="Generated PDF file is empty or missing.")

        # Safe filename from claim
        claim_slug = "".join(c if c.isalnum() else "_" for c in (payload.claim or "report"))[:50].strip("_")
        filename = f"CRDF_Report_{claim_slug}.pdf"

        return FileResponse(
            path=tmp_pdf,
            media_type="application/pdf",
            filename=filename,
            background=None # we handle cleanup or let OS clean temp
        )
    except Exception as e:
        if tmp_pdf and os.path.exists(tmp_pdf):
            try:
                os.remove(tmp_pdf)
            except:
                pass
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "message": "Failed to generate PDF report."}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web_app:app", host="127.0.0.1", port=8000, reload=False)
