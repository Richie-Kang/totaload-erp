"""OCR provider dispatcher — codex (CLI vision), upstage (Document Parse + Solar), gemini (multimodal).

Every provider exposes `run_ocr(image_path, image_bytes) -> str` that returns text containing a
single JSON object with the 9 logical fields. Parsing/normalization of that JSON is shared
(see ../extract.py). Failures map to one of the typed exceptions below so the caller can
translate them to a stable error_code regardless of which provider was used.
"""

from typing import Optional


class ProviderError(Exception):
    """Base for any OCR provider failure."""


class ProviderUnavailable(ProviderError):
    """The provider is not installed / API key not configured."""


class ProviderAuth(ProviderError):
    """API key rejected (HTTP 401, expired token, codex auth.json missing, …)."""


class ProviderRateLimit(ProviderError):
    """Rate / quota / usage limit hit (HTTP 429 or provider-specific equivalent)."""


class ProviderTimeout(ProviderError):
    """The provider call did not finish within the per-provider timeout."""


class ProviderBadOutput(ProviderError):
    """Provider responded but the response was unusable (non-zero exit, no JSON-bearing text)."""


def run_ocr(provider: str, image_path: str, image_bytes: bytes) -> str:
    """Dispatch to the named provider. `image_path` is a real file on disk (some providers
    upload it as multipart); `image_bytes` is the same content already in memory (some
    providers post it inline as base64). Returns raw text containing a JSON object."""
    p = (provider or "upstage").lower()
    if p == "codex":
        from . import codex as _codex
        return _codex.run_codex_ocr(image_path)
    if p == "upstage":
        from . import upstage as _upstage
        return _upstage.run_upstage_ocr(image_path, image_bytes)
    if p == "gemini":
        from . import gemini as _gemini
        return _gemini.run_gemini_ocr(image_bytes)
    raise ValueError(f"unknown ocr provider: {provider!r}")


def provider_health(provider: str) -> str:
    """Lightweight check (no real OCR call). Each provider returns 'ok' / 'configured' /
    'unauthenticated' / 'missing' depending on local state. See per-module impls."""
    p = (provider or "").lower()
    if p == "codex":
        from . import codex as _codex
        return _codex.codex_health()
    if p == "upstage":
        from . import upstage as _upstage
        return _upstage.upstage_health()
    if p == "gemini":
        from . import gemini as _gemini
        return _gemini.gemini_health()
    return "missing"


def provider_label(provider: str) -> Optional[str]:
    """Display label for a provider key. Returns None for unknown."""
    return {
        "upstage": "Upstage",
        "codex": "Codex",
        "gemini": "Gemini",
    }.get((provider or "").lower())
