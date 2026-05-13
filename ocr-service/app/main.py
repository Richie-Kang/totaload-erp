"""Totaload ERP — OCR/PDF service (FastAPI). Stateless.

Endpoints:
- GET  /health    : liveness + codex status
- POST /extract    : image upload -> codex OCR -> normalized fields (always 200; 429 if busy)
- POST /fill-pdf   : logical field values -> filled malso application PDF bytes
"""

import asyncio
import os
import stat
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.responses import JSONResponse

from . import extract as extract_mod
from . import fill_pdf as fill_pdf_mod
from .codex_client import codex_health
from .schema import ExtractResponse, FillPdfRequest

app = FastAPI(title="Totaload OCR/PDF service")


@app.on_event("startup")
def _bootstrap_codex_auth() -> None:
    """If CODEX_AUTH_JSON is set, write it to ~/.codex/auth.json (ADR-008)."""
    value = os.environ.get("CODEX_AUTH_JSON")
    if not value:
        return
    codex_dir = os.path.expanduser("~/.codex")
    os.makedirs(codex_dir, exist_ok=True)
    auth_path = os.path.join(codex_dir, "auth.json")
    with open(auth_path, "w", encoding="utf-8") as fh:
        fh.write(value)
    os.chmod(auth_path, stat.S_IRUSR | stat.S_IWUSR)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "codex": codex_health()}


@app.post("/extract", response_model=ExtractResponse)
async def post_extract(file: Optional[UploadFile] = File(default=None)) -> ExtractResponse:
    if file is None:
        raise HTTPException(status_code=400, detail={"error": {"code": "NO_FILE", "message": "파일이 필요합니다"}})
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail={"error": {"code": "EMPTY_FILE", "message": "빈 파일입니다"}})
    if not extract_mod.OCR_SEMAPHORE.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail={"error": {"code": "OCR_BUSY", "message": "OCR 처리량 초과 — 잠시 후 재시도"}},
        )
    try:
        return await asyncio.to_thread(extract_mod.extract_from_upload, data, file.filename or "")
    finally:
        extract_mod.OCR_SEMAPHORE.release()


@app.post("/fill-pdf")
def post_fill_pdf(req: FillPdfRequest) -> Response:
    try:
        pdf_bytes, missing = fill_pdf_mod.fill(req)
    except fill_pdf_mod.PdfTemplateMissing as exc:
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "PDF_TEMPLATE_MISSING", "message": str(exc)}},
        )
    except Exception as exc:  # noqa: BLE001 — never crash the service
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "PDF_FILL_FAILED", "message": str(exc)}},
        )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"X-Missing-Fields": ",".join(missing)},
    )
