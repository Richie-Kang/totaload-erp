"""Gemini multimodal provider — single call sending the image + extraction prompt.

Default model: gemini-1.5-flash (override with GEMINI_MODEL). Auth: GEMINI_API_KEY env var.
Asks for response_mime_type=application/json so the returned text is already a JSON object.
"""

import base64
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

MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")
TIMEOUT = float(os.environ.get("GEMINI_TIMEOUT", "60"))


def _api_key() -> str:
    key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not key:
        raise ProviderUnavailable("GEMINI_API_KEY 가 설정되지 않음")
    return key


def run_gemini_ocr(image_bytes: bytes) -> str:
    key = _api_key()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={key}"
    body = {
        "contents": [
            {
                "parts": [
                    {"text": EXTRACTION_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(image_bytes).decode("ascii"),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0,
        },
    }
    try:
        response = httpx.post(url, json=body, timeout=TIMEOUT)
    except httpx.TimeoutException as exc:
        raise ProviderTimeout(f"gemini 타임아웃 ({TIMEOUT}s)") from exc
    except httpx.HTTPError as exc:
        raise ProviderBadOutput(f"gemini 네트워크 오류: {exc}") from exc
    if response.status_code in (401, 403):
        raise ProviderAuth(f"gemini HTTP {response.status_code} {response.text[:500]}")
    if response.status_code == 429:
        raise ProviderRateLimit(f"gemini HTTP 429 {response.text[:500]}")
    if response.status_code >= 400:
        raise ProviderBadOutput(f"gemini HTTP {response.status_code} {response.text[:500]}")
    payload = response.json()
    try:
        return payload["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderBadOutput(f"gemini 응답 형식 이상: {payload!r}") from exc


def gemini_health() -> str:
    return "configured" if (os.environ.get("GEMINI_API_KEY") or "").strip() else "missing"
