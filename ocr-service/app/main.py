"""Totaload ERP — OCR/PDF service (FastAPI).

This is the minimal scaffold. The real endpoints land in step2:
- POST /extract  : image -> codex CLI -> normalized JSON
- POST /fill-pdf : field values JSON -> filled malso application PDF bytes
"""

from fastapi import FastAPI

app = FastAPI(title="Totaload OCR/PDF service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
