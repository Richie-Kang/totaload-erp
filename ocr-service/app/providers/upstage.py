"""Upstage Document OCR + Solar Chat provider.

Two-step pipeline (mirrors the assignment's "real-world document" workflow):
1. POST https://api.upstage.ai/v1/document-digitization  (model=document-parse)
   -> extracts text + layout from the registration certificate
2. POST https://api.upstage.ai/v1/chat/completions       (model=solar-pro by default)
   -> structures the extracted text into the 9 logical fields (JSON object)

Auth: single `UPSTAGE_API_KEY` env var for both endpoints.
Docs: https://console.upstage.ai/docs/getting-started
"""

import json
import os

import httpx

from . import (
    ProviderAuth,
    ProviderBadOutput,
    ProviderRateLimit,
    ProviderTimeout,
    ProviderUnavailable,
)
from .prompt import EXTRACTION_PROMPT

DOC_PARSE_URL = "https://api.upstage.ai/v1/document-digitization"
CHAT_URL = "https://api.upstage.ai/v1/chat/completions"
DOC_PARSE_MODEL = os.environ.get("UPSTAGE_DOCUMENT_MODEL", "document-parse")
CHAT_MODEL = os.environ.get("UPSTAGE_CHAT_MODEL", "solar-pro")
TIMEOUT = float(os.environ.get("UPSTAGE_TIMEOUT", "60"))


def _api_key() -> str:
    key = (os.environ.get("UPSTAGE_API_KEY") or "").strip()
    if not key:
        raise ProviderUnavailable("UPSTAGE_API_KEY 가 설정되지 않음")
    return key


def _raise_for_status(response: httpx.Response, what: str) -> None:
    if response.status_code == 401 or response.status_code == 403:
        raise ProviderAuth(f"{what}: HTTP {response.status_code} {response.text[:500]}")
    if response.status_code == 429:
        raise ProviderRateLimit(f"{what}: HTTP 429 {response.text[:500]}")
    if response.status_code >= 400:
        raise ProviderBadOutput(f"{what}: HTTP {response.status_code} {response.text[:500]}")


def _document_parse(api_key: str, image_path: str) -> str:
    """Step 1 — extract text/HTML from the image. Returns a single text blob suitable for an LLM."""
    with open(image_path, "rb") as fh:
        files = {"document": (os.path.basename(image_path) or "upload.jpg", fh, "image/jpeg")}
        data = {"model": DOC_PARSE_MODEL}
        headers = {"Authorization": f"Bearer {api_key}"}
        try:
            response = httpx.post(
                DOC_PARSE_URL, headers=headers, files=files, data=data, timeout=TIMEOUT
            )
        except httpx.TimeoutException as exc:
            raise ProviderTimeout(f"upstage document-parse 타임아웃 ({TIMEOUT}s)") from exc
        except httpx.HTTPError as exc:
            raise ProviderBadOutput(f"upstage document-parse 네트워크 오류: {exc}") from exc
    _raise_for_status(response, "upstage document-parse")
    payload = response.json()
    # Upstage returns content with html / text / markdown variants — prefer text, fall back to html.
    content = payload.get("content") if isinstance(payload, dict) else None
    if isinstance(content, dict):
        for key in ("text", "markdown", "html"):
            value = content.get(key)
            if isinstance(value, str) and value.strip():
                return value
    # last-resort: dump the whole payload as text so Solar still has something to work with
    return json.dumps(payload, ensure_ascii=False)


def _solar_extract(api_key: str, document_text: str) -> str:
    """Step 2 — ask Solar Chat to return the 9 fields as a JSON object."""
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": CHAT_MODEL,
        "messages": [
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": document_text[:60_000]},  # safety cap
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
    }
    try:
        response = httpx.post(CHAT_URL, headers=headers, json=body, timeout=TIMEOUT)
    except httpx.TimeoutException as exc:
        raise ProviderTimeout(f"upstage solar-chat 타임아웃 ({TIMEOUT}s)") from exc
    except httpx.HTTPError as exc:
        raise ProviderBadOutput(f"upstage solar-chat 네트워크 오류: {exc}") from exc
    _raise_for_status(response, "upstage solar-chat")
    payload = response.json()
    try:
        return payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderBadOutput(f"upstage solar-chat 응답 형식 이상: {payload!r}") from exc


def run_upstage_ocr(image_path: str, _image_bytes: bytes) -> str:
    key = _api_key()
    document_text = _document_parse(key, image_path)
    return _solar_extract(key, document_text)


def upstage_health() -> str:
    return "configured" if (os.environ.get("UPSTAGE_API_KEY") or "").strip() else "missing"
