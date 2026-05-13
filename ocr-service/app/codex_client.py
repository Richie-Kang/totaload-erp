"""Thin wrapper around the local `codex` CLI used for OCR extraction.

OCR = `codex exec -i <image>` (ADR-002). The CLI is non-deterministic and may
be missing/unauthenticated/rate-limited — every failure mode maps to a typed
exception so the caller can translate it into a structured error_code.
"""

import os
import shutil
import subprocess
import tempfile

CODEX_BIN = os.environ.get("CODEX_BIN", "codex")
CODEX_TIMEOUT = 90  # seconds — ADR-009 / §2.6

# system-style prompt: the model must return exactly one JSON object, nothing else.
PROMPT = (
    "당신은 한국 자동차등록증 OCR 추출기다. 첨부 이미지에서 아래 키만 가진 JSON 객체 하나만 출력하라. "
    "코드펜스·설명·다른 텍스트 금지. 값을 못 읽으면 null. "
    "키: owner_name, owner_ssn, owner_address, vehicle_reg_no, vehicle_vin, vehicle_model, vehicle_year, "
    "vehicle_mileage(정수 km 또는 null), vehicle_weight(차량총중량 정수 kg, 없으면 차량중량, 둘 다 없으면 null). "
    "vehicle_vin 은 공백 없는 영문 대문자/숫자. owner_address 는 한 줄. 숫자는 콤마 없이 정수만."
)

# patterns we look for in codex output to distinguish failure modes
_AUTH_PATTERNS = (
    "not logged in",
    "please run `codex login`",
    "please run codex login",
    "run `codex login`",
    "unauthorized",
    "authentication",
    "auth.json",
    "401",
    "sign in",
    "expired token",
)
_RATE_PATTERNS = (
    "rate limit",
    "rate_limit",
    "rate-limit",
    "too many requests",
    "429",
    "quota",
    "usage limit",
    "usage_limit",
)


class CodexError(Exception):
    """Base class for codex CLI failures."""


class CodexUnavailable(CodexError):
    """The `codex` binary is not installed / not on PATH."""


class CodexAuth(CodexError):
    """codex ran but reported an authentication problem."""


class CodexRateLimit(CodexError):
    """codex ran but reported a rate / usage limit."""


class CodexTimeout(CodexError):
    """codex did not finish within CODEX_TIMEOUT."""


class CodexBadOutput(CodexError):
    """codex exited non-zero / produced no usable output."""


def _match(text: str, patterns) -> bool:
    return any(p in text for p in patterns)


def run_codex_ocr(image_path: str) -> str:
    """Run codex against one image and return its raw final message.

    Raises a CodexError subclass on any failure — never returns an error string.
    """
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
            raise CodexUnavailable(f"codex CLI를 찾을 수 없음: {exc}") from exc
        except subprocess.TimeoutExpired as exc:
            raise CodexTimeout(f"codex 타임아웃 ({CODEX_TIMEOUT}s)") from exc

        combined = ((proc.stdout or "") + "\n" + (proc.stderr or "")).lower()

        if proc.returncode != 0:
            if _match(combined, _AUTH_PATTERNS):
                raise CodexAuth((proc.stderr or proc.stdout or "").strip()[:2000])
            if _match(combined, _RATE_PATTERNS):
                raise CodexRateLimit((proc.stderr or proc.stdout or "").strip()[:2000])
            raise CodexBadOutput(
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
                raise CodexAuth((proc.stderr or "").strip()[:2000])
            if _match(combined, _RATE_PATTERNS):
                raise CodexRateLimit((proc.stderr or "").strip()[:2000])
            raise CodexBadOutput("codex가 빈 출력을 반환함")
        return text


def codex_health() -> str:
    """Lightweight liveness probe — does NOT call OCR.

    Returns one of: 'ok' | 'missing' | 'unauthenticated' | 'unknown'.
    """
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
