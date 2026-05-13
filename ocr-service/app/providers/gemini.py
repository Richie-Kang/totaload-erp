"""Gemini multimodal provider — single call sending the image + extraction prompt.

Default model: gemini-2.5-flash (override with GEMINI_MODEL). Auth: GEMINI_API_KEY env var.
Asks for response_mime_type=application/json so the returned text is already a JSON object.

Safety settings are explicitly relaxed to BLOCK_NONE for every category because the
input is a Korean vehicle registration certificate — names, resident-registration
numbers, and addresses all appear on the document and trigger Gemini's default
filters, returning an empty response with finishReason=SAFETY.
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

# Gemini 1.5 series was deprecated in 2025; 2.5-flash is the current stable
# vision-capable model on the public v1beta endpoint.
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
TIMEOUT = float(os.environ.get("GEMINI_TIMEOUT", "60"))

_SAFETY_CATEGORIES = (
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
    "HARM_CATEGORY_CIVIC_INTEGRITY",
)


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
        # Relax safety so the cert (names, SSN, address) isn't blocked outright.
        "safetySettings": [
            {"category": cat, "threshold": "BLOCK_NONE"} for cat in _SAFETY_CATEGORIES
        ],
    }
    try:
        response = httpx.post(url, json=body, timeout=TIMEOUT)
    except httpx.TimeoutException as exc:
        raise ProviderTimeout(f"gemini 타임아웃 ({TIMEOUT}s)") from exc
    except httpx.HTTPError as exc:
        raise ProviderBadOutput(f"gemini 네트워크 오류: {exc}") from exc

    if response.status_code == 404:
        # most common cause: model name was deprecated. Surface that as Unavailable so the
        # UI tells the user to set GEMINI_MODEL rather than blaming the input.
        raise ProviderUnavailable(
            f"gemini model not found: {MODEL!r} (set GEMINI_MODEL env var, e.g. gemini-2.0-flash). "
            f"Response: {response.text[:300]}"
        )
    if response.status_code in (401, 403):
        raise ProviderAuth(f"gemini HTTP {response.status_code} {response.text[:500]}")
    if response.status_code == 429:
        raise ProviderRateLimit(f"gemini HTTP 429 {response.text[:500]}")
    if response.status_code >= 400:
        raise ProviderBadOutput(f"gemini HTTP {response.status_code} {response.text[:500]}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise ProviderBadOutput(f"gemini 응답이 JSON 이 아님: {response.text[:500]}") from exc

    # Prompt-level block (the whole request was rejected before generation).
    prompt_feedback = payload.get("promptFeedback") or {}
    block_reason = prompt_feedback.get("blockReason")
    if block_reason:
        raise ProviderBadOutput(
            f"gemini blocked the prompt (blockReason={block_reason}): {prompt_feedback}"
        )

    candidates = payload.get("candidates") or []
    if not candidates:
        raise ProviderBadOutput(f"gemini 응답에 candidate 없음: {payload}")

    cand = candidates[0]
    finish = cand.get("finishReason")
    if finish and finish not in ("STOP", "MAX_TOKENS"):
        # SAFETY / RECITATION / OTHER / PROHIBITED_CONTENT — content portion is empty.
        raise ProviderBadOutput(
            f"gemini finishReason={finish}; safetyRatings={cand.get('safetyRatings')}"
        )

    content = cand.get("content") or {}
    parts = content.get("parts") or []
    if not parts:
        raise ProviderBadOutput(
            f"gemini 응답에 content.parts 비어있음 (finishReason={finish}): {cand}"
        )
    text = parts[0].get("text")
    if not text or not str(text).strip():
        raise ProviderBadOutput(f"gemini 응답 text 비어있음: {cand}")
    return text


def gemini_health() -> str:
    return "configured" if (os.environ.get("GEMINI_API_KEY") or "").strip() else "missing"
