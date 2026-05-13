"""Codex CLI provider — `codex exec -i <image>` against the user's ChatGPT account (ADR-002, ADR-008).

The CLI is non-deterministic and may be missing / unauthenticated / rate-limited; every failure
mode maps to a typed ProviderError subclass.
"""

import os
import shutil
import subprocess
import tempfile

from . import (
    ProviderAuth,
    ProviderBadOutput,
    ProviderRateLimit,
    ProviderTimeout,
    ProviderUnavailable,
)

CODEX_BIN = os.environ.get("CODEX_BIN", "codex")
CODEX_TIMEOUT = 90  # seconds — ADR-009 / §2.6

# Shared prompt for the 9-field extraction. Used verbatim by upstage and gemini providers too
# (see ./prompt.py to keep them in sync). Defined inline here to keep this file standalone.
from .prompt import EXTRACTION_PROMPT as PROMPT  # noqa: E402

_AUTH_PATTERNS = (
    "not logged in", "please run `codex login`", "please run codex login",
    "run `codex login`", "unauthorized", "authentication", "auth.json",
    "401", "sign in", "expired token",
)
_RATE_PATTERNS = (
    "rate limit", "rate_limit", "rate-limit", "too many requests",
    "429", "quota", "usage limit", "usage_limit",
)


def _match(text: str, patterns) -> bool:
    return any(p in text for p in patterns)


def run_codex_ocr(image_path: str) -> str:
    with tempfile.TemporaryDirectory() as tmpdir:
        out_file = os.path.join(tmpdir, "codex_last_message.txt")
        cmd = [
            CODEX_BIN, "exec",
            "--skip-git-repo-check",
            "-s", "read-only",
            "--color", "never",
            "-i", image_path,
            "-o", out_file,
            PROMPT,
        ]
        try:
            proc = subprocess.run(
                cmd, capture_output=True, text=True, timeout=CODEX_TIMEOUT, cwd=tmpdir
            )
        except FileNotFoundError as exc:
            raise ProviderUnavailable(f"codex CLI를 찾을 수 없음: {exc}") from exc
        except subprocess.TimeoutExpired as exc:
            raise ProviderTimeout(f"codex 타임아웃 ({CODEX_TIMEOUT}s)") from exc

        combined = ((proc.stdout or "") + "\n" + (proc.stderr or "")).lower()

        if proc.returncode != 0:
            if _match(combined, _AUTH_PATTERNS):
                raise ProviderAuth((proc.stderr or proc.stdout or "").strip()[:2000])
            if _match(combined, _RATE_PATTERNS):
                raise ProviderRateLimit((proc.stderr or proc.stdout or "").strip()[:2000])
            raise ProviderBadOutput(
                f"codex 비정상 종료 (code={proc.returncode}): "
                f"{((proc.stderr or proc.stdout) or '').strip()[:2000]}"
            )

        text = ""
        if os.path.isfile(out_file):
            with open(out_file, encoding="utf-8", errors="replace") as fh:
                text = fh.read().strip()
        if not text:
            text = (proc.stdout or "").strip()
        if not text:
            if _match(combined, _AUTH_PATTERNS):
                raise ProviderAuth((proc.stderr or "").strip()[:2000])
            if _match(combined, _RATE_PATTERNS):
                raise ProviderRateLimit((proc.stderr or "").strip()[:2000])
            raise ProviderBadOutput("codex가 빈 출력을 반환함")
        return text


def codex_health() -> str:
    resolved = shutil.which(CODEX_BIN)
    if not resolved and not (os.path.isfile(CODEX_BIN) and os.access(CODEX_BIN, os.X_OK)):
        return "missing"
    try:
        proc = subprocess.run(
            [CODEX_BIN, "--version"], capture_output=True, text=True, timeout=10
        )
    except FileNotFoundError:
        return "missing"
    except (subprocess.SubprocessError, OSError):
        return "unknown"
    if proc.returncode != 0:
        return "unknown"
    if not os.path.isfile(os.path.expanduser("~/.codex/auth.json")):
        return "unauthenticated"
    return "ok"
